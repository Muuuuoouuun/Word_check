-- Legacy schema from ae1fc7bea3ff45400f7d30cf88ec814368f227b2 (initial main).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('STUDENT','TEACHER','PARENT','ADMIN')),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  student_id TEXT UNIQUE,
  parent_id TEXT UNIQUE,
  teacher_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL,
  FOREIGN KEY(parent_id) REFERENCES parents(id) ON DELETE SET NULL,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_parents (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  relation_label TEXT,
  receives_reports INTEGER NOT NULL DEFAULT 1,
  UNIQUE(student_id, parent_id),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(parent_id) REFERENCES parents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  push_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_devices (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  UNIQUE(student_id, device_id),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('GLOBAL','TEACHER')),
  owner_teacher_id TEXT,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK(value_type IN ('string','number','boolean','json')),
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(scope, owner_teacher_id, setting_key),
  FOREIGN KEY(owner_teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS login_access_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  student_id TEXT,
  created_by_user_id TEXT,
  created_by_role TEXT,
  label TEXT,
  channel TEXT NOT NULL CHECK(channel IN ('LINK','QR','AUTO_LOGIN')) DEFAULT 'LINK',
  metadata TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  allow_reuse INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vocab_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  owner_teacher_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(owner_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vocab_lessons (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  lesson_no INTEGER NOT NULL,
  title TEXT,
  UNIQUE(source_id, lesson_no),
  FOREIGN KEY(source_id) REFERENCES vocab_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vocab_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  lesson_id TEXT,
  lemma TEXT NOT NULL,
  meaning_primary TEXT NOT NULL,
  example_sentence TEXT,
  FOREIGN KEY(source_id) REFERENCES vocab_sources(id) ON DELETE CASCADE,
  FOREIGN KEY(lesson_id) REFERENCES vocab_lessons(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS homework_assignments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  range_start_lesson INTEGER NOT NULL,
  range_end_lesson INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  publish_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('SCHEDULED','PUBLISHED','IN_PROGRESS','COMPLETED','MISSED','CANCELED')) DEFAULT 'SCHEDULED',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE RESTRICT,
  FOREIGN KEY(source_id) REFERENCES vocab_sources(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS test_sessions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('SCHEDULED','PUBLISHED','IN_PROGRESS','COMPLETED','MISSED','CANCELED')) DEFAULT 'PUBLISHED',
  generated_seed TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  score INTEGER,
  out_of INTEGER,
  locked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(assignment_id) REFERENCES homework_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_questions (
  id TEXT PRIMARY KEY,
  test_session_id TEXT NOT NULL,
  vocab_item_id TEXT NOT NULL,
  order_no INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('DIRECT_TRANSLATION','FILL_IN_BLANK')),
  prompt TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  blank_sentence TEXT,
  is_teacher_edited INTEGER NOT NULL DEFAULT 0,
  UNIQUE(test_session_id, order_no),
  FOREIGN KEY(test_session_id) REFERENCES test_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(vocab_item_id) REFERENCES vocab_items(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS student_answers (
  id TEXT PRIMARY KEY,
  test_session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  response TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  answered_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(test_session_id, question_id),
  FOREIGN KEY(test_session_id) REFERENCES test_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES test_questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS proxy_submission_log (
  id TEXT PRIMARY KEY,
  test_session_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK(actor_role IN ('TEACHER','ADMIN')),
  entry_mode TEXT NOT NULL CHECK(entry_mode IN ('OFFLINE_PROXY','MANUAL_PROXY')),
  note TEXT,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(test_session_id) REFERENCES test_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(assignment_id) REFERENCES homework_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  student_id TEXT,
  parent_id TEXT,
  tier TEXT NOT NULL CHECK(tier IN ('TIER1_STUDENT_ASSIGN','TIER2_STUDENT_REMIND','TIER3_PARENT_REPORT')),
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','SENT','FAILED','SKIPPED')) DEFAULT 'PENDING',
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  payload TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(assignment_id) REFERENCES homework_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL,
  FOREIGN KEY(parent_id) REFERENCES parents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_assignment_status_due ON homework_assignments(status, due_at);
CREATE INDEX IF NOT EXISTS idx_assignment_student_publish ON homework_assignments(student_id, publish_at);
CREATE INDEX IF NOT EXISTS idx_notification_status_scheduled ON notification_log(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_vocab_items_source_lesson ON vocab_items(source_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_app_settings_scope_teacher ON app_settings(scope, owner_teacher_id, setting_key);
CREATE INDEX IF NOT EXISTS idx_login_access_links_user_expires ON login_access_links(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_proxy_submission_log_session ON proxy_submission_log(test_session_id, created_at);
