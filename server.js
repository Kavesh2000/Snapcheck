import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000
});
const mailer = process.env.SMTP_USER && process.env.SMTP_PASSWORD ? nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.office365.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  requireTLS: true
}) : null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({ limit: '10mb' }));

const seedUsers = [
  ['Raphael Kioko', 'raphael.kioko@maishabank.com', 'Branch manager'],
  ['Lilian Kimani', 'lilian.kimani@maishabank.com', 'Branch staff'],
  ['Maureen Kerubo', 'maureen.kerubo@maishabank.com', 'Branch staff'],
  ['Alice Muthoni', 'alice.muthoni@maishabank.com', 'Branch staff'],
  ['Daniel Mboloi', 'daniel.mboloi@maishabank.com', 'Branch staff'],
  ['Esther Nabwala', 'esther.nabwala@maishabank.com', 'Branch staff'],
  ['Molly Okello', 'molly.okello@maishabank.com', 'Branch staff'],
  ['Nelly Karauki', 'nelly.karauki@maishabank.com', 'Branch staff'],
  ['Pauline Biraori', 'pauline.biraori@maishabank.com', 'Branch staff'],
  ['Paul Maseno', 'paul.maseno@maishabank.com', 'Branch staff'],
  ['Hilda Mwende', 'hilda.mwende@maishabank.com', 'Branch staff'],
  ['Purity Khavere', 'purity.khavere@maishabank.com', 'Branch staff'],
  ['Boniface Kioko', 'boniface.kioko@maishabank.com', 'Branch staff'],
  ['Bonface Mugambi', 'bonface.mugambi@maishabank.com', 'Branch staff'],
  ['Faith Bonareri', 'faith.bonareri@maishabank.com', 'Branch staff']
];

const initializeDatabase = async () => {
  const schema = await readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  const initialPassword = await bcrypt.hash(process.env.DEFAULT_USER_PASSWORD || '1234', 12);
  for (const [name, email, role] of seedUsers) {
    await pool.query(
      `INSERT INTO users (name, email, role, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [name, email, role, initialPassword]
    );
  }
};

const publicUser = user => ({ name: user.name, email: user.email, role: user.role });
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const htmlEscape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

app.post('/api/notifications/email', async (request, response) => {
  const { recipientEmail, title, detail, websiteLink } = request.body;
  if (!recipientEmail || !title || !detail || !websiteLink) return response.status(400).json({ error: 'Notification fields are required' });
  if (!mailer) return response.status(503).json({ error: 'Email service is not configured' });
  try {
    await mailer.sendMail({
      from: process.env.SMTP_USER,
      to: recipientEmail,
      subject: `SnapChecks alert: ${title}`,
      text: `${detail}\n\nOpen SnapChecks: ${websiteLink}`,
      html: `<p>${htmlEscape(detail)}</p><p><a href="${htmlEscape(websiteLink)}">Open SnapChecks</a></p>`
    });
    response.status(204).end();
  } catch (error) {
    console.error('Notification email failed:', error.message);
    response.status(502).json({ error: 'Unable to send notification email' });
  }
});

app.post('/api/auth/login', async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase();
  const password = String(request.body.password || '');
  try {
    const result = await pool.query('SELECT * FROM users WHERE lower(email) = $1 AND active = true', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return response.status(401).json({ error: 'Invalid email or password' });
    response.json({ user: publicUser(user) });
  } catch (error) {
    console.error('POST /api/auth/login failed:', error.message);
    response.status(503).json({ error: 'Authentication service unavailable' });
  }
});

app.post('/api/auth/change-password', async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase();
  const currentPassword = String(request.body.currentPassword || '');
  const newPassword = String(request.body.newPassword || '');
  if (newPassword.length < 8) return response.status(400).json({ error: 'New password must be at least 8 characters' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE lower(email) = $1 AND active = true', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) return response.status(401).json({ error: 'Current password is incorrect' });
    await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [await bcrypt.hash(newPassword, 12), user.id]);
    response.json({ ok: true });
  } catch (error) {
    response.status(503).json({ error: 'Password service unavailable' });
  }
});

app.post('/api/auth/forgot-password', async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase();
  const token = crypto.randomBytes(32).toString('hex');
  try {
    const result = await pool.query(
      'UPDATE users SET reset_token_hash = $1, reset_token_expires_at = now() + interval \'30 minutes\' WHERE lower(email) = $2 AND active = true RETURNING id',
      [tokenHash(token), email]
    );
    if (!result.rowCount) return response.json({ ok: true });
    if (!mailer) return response.status(503).json({ error: 'Email service is not configured' });
    const resetUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}?resetToken=${encodeURIComponent(token)}`;
    await mailer.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: 'SnapChecks password reset',
      text: `Use this link to reset your SnapChecks password. It expires in 30 minutes: ${resetUrl}`,
      html: `<p>Use the link below to reset your SnapChecks password. It expires in 30 minutes.</p><p><a href="${resetUrl}">Reset your password</a></p>`
    });
    response.json({ ok: true });
  } catch (error) {
    response.status(503).json({ error: 'Password service unavailable' });
  }
});

app.post('/api/auth/reset-password', async (request, response) => {
  const token = String(request.body.token || '');
  const newPassword = String(request.body.newPassword || '');
  if (newPassword.length < 8) return response.status(400).json({ error: 'New password must be at least 8 characters' });
  try {
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, reset_token_hash = NULL, reset_token_expires_at = NULL, updated_at = now()
       WHERE reset_token_hash = $2 AND reset_token_expires_at > now() AND active = true RETURNING id`,
      [await bcrypt.hash(newPassword, 12), tokenHash(token)]
    );
    if (!result.rowCount) return response.status(400).json({ error: 'Reset token is invalid or expired' });
    response.json({ ok: true });
  } catch (error) {
    response.status(503).json({ error: 'Password service unavailable' });
  }
});

app.get('/api/health', async (_request, response) => {
  try {
    const result = await pool.query('SELECT now() AS connected_at');
    response.json({ ok: true, database: process.env.DB_NAME, connectedAt: result.rows[0].connected_at });
  } catch (error) {
    console.error('GET /api/health failed:', error.message);
    response.status(503).json({ ok: false, error: 'Database connection failed' });
  }
});

app.get('/api/state', async (_request, response) => {
  try {
    const result = await pool.query('SELECT payload FROM snapcheck_state WHERE id = 1');
    response.json(result.rows[0]?.payload || null);
  } catch (error) {
    console.error('GET /api/state failed:', error.message);
    response.status(503).json({ error: 'Database unavailable' });
  }
});

app.put('/api/state', async (request, response) => {
  try {
    await pool.query(
      `INSERT INTO snapcheck_state (id, payload, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [JSON.stringify(request.body)]
    );
    response.status(204).end();
  } catch (error) {
    console.error('PUT /api/state failed:', error.message);
    response.status(503).json({ error: 'Database unavailable' });
  }
});

app.use(express.static(__dirname));

try {
  await initializeDatabase();
  app.listen(port, () => console.log(`Snapcheck server listening on http://localhost:${port}`));
} catch (error) {
  console.error('Unable to initialize PostgreSQL:', error.message);
  process.exitCode = 1;
}
