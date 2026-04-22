const fs = require("fs");
const path = require("path");
const db = require("./db");

function tableHasColumn(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function ensureColumn(tableName, columnName, definitionSql) {
  if (tableHasColumn(tableName, columnName)) return;
  db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`).run();
}

function runMigrations() {
  ensureColumn("homework_assignments", "assignment_kind", "TEXT NOT NULL DEFAULT 'REGULAR'");
  ensureColumn("homework_assignments", "preview_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("homework_assignments", "preview_duration_sec", "INTEGER NOT NULL DEFAULT 60");
  ensureColumn("homework_assignments", "preview_scope", "TEXT NOT NULL DEFAULT 'ALL'");
  ensureColumn("homework_assignments", "gamification_enabled", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("test_sessions", "preview_started_at", "TEXT");
  ensureColumn("test_sessions", "preview_completed_at", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_vocab_stats (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      vocab_item_id TEXT NOT NULL,
      exposure_count INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      mastery_score INTEGER NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.0,
      interval_days INTEGER NOT NULL DEFAULT 0,
      lapse_count INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT,
      next_review_at TEXT,
      last_result TEXT CHECK(last_result IN ('CORRECT','WRONG')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, vocab_item_id),
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(vocab_item_id) REFERENCES vocab_items(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_assignment_status_publish ON homework_assignments(status, publish_at);
    CREATE INDEX IF NOT EXISTS idx_assignment_teacher_kind ON homework_assignments(teacher_id, assignment_kind, status);
    CREATE INDEX IF NOT EXISTS idx_assignment_student_status_due ON homework_assignments(student_id, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_test_sessions_student_status_completed ON test_sessions(student_id, status, completed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_test_questions_session_vocab ON test_questions(test_session_id, vocab_item_id);
    CREATE INDEX IF NOT EXISTS idx_student_answers_session_correct ON student_answers(test_session_id, is_correct);
    CREATE INDEX IF NOT EXISTS idx_student_vocab_stats_student_review ON student_vocab_stats(student_id, next_review_at);
    CREATE INDEX IF NOT EXISTS idx_student_vocab_stats_student_mastery ON student_vocab_stats(student_id, mastery_score);
  `);
}

function initDb() {
  const schemaPath = path.resolve(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  db.exec(sql);
  runMigrations();
}

module.exports = initDb;
