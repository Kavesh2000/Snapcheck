CREATE TABLE IF NOT EXISTS snapcheck_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'Branch staff',
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  reset_token_hash text,
  reset_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_reset_token_idx ON users(reset_token_hash);

CREATE TABLE IF NOT EXISTS staff_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id text UNIQUE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'Branch staff',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id text UNIQUE,
  reference text UNIQUE,
  name text NOT NULL,
  frequency text,
  category text NOT NULL,
  summary text,
  instructions jsonb NOT NULL DEFAULT '[]'::jsonb,
  finding_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_name text,
  owner_email text,
  status text NOT NULL DEFAULT 'pending',
  review_status text,
  note text,
  assignment_status text,
  workflow_status text,
  start_date date,
  stop_date date,
  timeline text,
  issued_at timestamptz,
  issued_by text,
  guide_link text,
  email_alert text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS check_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id text UNIQUE,
  check_id bigint NOT NULL REFERENCES control_checks(id) ON DELETE CASCADE,
  staff_id bigint REFERENCES staff_members(id) ON DELETE SET NULL,
  staff_name text NOT NULL,
  staff_email text NOT NULL,
  start_date date,
  stop_date date,
  timeline text,
  status text NOT NULL DEFAULT 'Issued',
  issued_at timestamptz,
  issued_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id text UNIQUE,
  check_id bigint NOT NULL REFERENCES control_checks(id) ON DELETE CASCADE,
  staff_id bigint REFERENCES staff_members(id) ON DELETE SET NULL,
  branch text NOT NULL,
  reporting_month text,
  snapchecker_name text NOT NULL,
  start_date date,
  stop_date date,
  findings text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  finding_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapchecker_signature text,
  manager_signature text,
  evidence_note text,
  status text NOT NULL DEFAULT 'Submitted',
  review_status text NOT NULL DEFAULT 'Submitted',
  workflow_status text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  review_comment text
);

CREATE TABLE IF NOT EXISTS submission_checklist_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id bigint NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  instruction text NOT NULL,
  checked boolean NOT NULL DEFAULT false,
  UNIQUE (submission_id, instruction)
);

CREATE TABLE IF NOT EXISTS submission_attachments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id bigint NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  content_type text,
  file_size bigint,
  data_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS findings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id text UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  owner_name text,
  owner_email text,
  status text NOT NULL DEFAULT 'Open',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id text UNIQUE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL,
  detail text,
  captured_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id text UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  check_reference text,
  check_name text,
  actor text NOT NULL,
  detail text
);

CREATE TABLE IF NOT EXISTS notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id text UNIQUE,
  recipient_email text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  kind text NOT NULL DEFAULT 'workflow',
  notification_key text,
  website_link text,
  email_channel text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS control_checks_category_idx ON control_checks(category);
CREATE INDEX IF NOT EXISTS control_checks_status_idx ON control_checks(status);
CREATE INDEX IF NOT EXISTS check_assignments_check_id_idx ON check_assignments(check_id);
CREATE INDEX IF NOT EXISTS submissions_check_id_idx ON submissions(check_id);
CREATE INDEX IF NOT EXISTS findings_status_idx ON findings(status);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_email);
