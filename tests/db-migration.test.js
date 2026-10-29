const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "words-migration-test-"));
process.env.DB_FILE = path.join(testDirectory, "test.db");
const db = require("../src/db");
const initDb = require("../src/initDb");

test("upgrading the original main schema preserves learning data and is repeatable", () => {
  db.exec(fs.readFileSync(path.join(__dirname, "fixtures/schema-v1.sql"), "utf8"));
  db.exec(`
    INSERT INTO teachers(id,name) VALUES ('teacher','Teacher');
    INSERT INTO students(id,student_code,name) VALUES ('student','S1','Student');
    INSERT INTO vocab_sources(id,name,source_type,owner_teacher_id) VALUES ('source','Words','CUSTOM','teacher');
    INSERT INTO vocab_items(id,source_id,lemma,meaning_primary) VALUES ('word','source','remember','기억하다');
    INSERT INTO homework_assignments
      (id,student_id,teacher_id,source_id,range_start_lesson,range_end_lesson,question_count,publish_at,due_at,status)
      VALUES ('assignment','student','teacher','source',1,1,1,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z','COMPLETED');
    INSERT INTO test_sessions(id,assignment_id,student_id,generated_seed,status,score,out_of,completed_at)
      VALUES ('session','assignment','student','seed','COMPLETED',100,100,'2026-01-01T12:00:00Z');
    INSERT INTO test_questions(id,test_session_id,vocab_item_id,order_no,type,prompt,expected_answer)
      VALUES ('question','session','word',1,'DIRECT_TRANSLATION','기억하다','remember');
    INSERT INTO student_answers(id,test_session_id,question_id,response,is_correct)
      VALUES ('answer','session','question','remember',1);
  `);
  const legacyTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const before = new Map(legacyTables.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY id`).all()]));

  for (let attempt = 0; attempt < 2; attempt++) {
    initDb();
    for (const [table, rows] of before) {
      const columns = rows.length ? Object.keys(rows[0]).join(",") : "*";
      assert.deepEqual(db.prepare(`SELECT ${columns} FROM ${table} ORDER BY id`).all(), rows, `${table} retains legacy data`);
    }
    assert.deepEqual(db.prepare(`SELECT assignment_kind,preview_enabled,preview_duration_sec,preview_scope,gamification_enabled
      FROM homework_assignments WHERE id='assignment'`).get(), {
      assignment_kind: "REGULAR", preview_enabled: 0, preview_duration_sec: 60, preview_scope: "ALL", gamification_enabled: 1,
    });
    assert.deepEqual(db.prepare("SELECT preview_started_at,preview_completed_at FROM test_sessions WHERE id='session'").get(), {
      preview_started_at: null, preview_completed_at: null,
    });
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_assignment_teacher_kind'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='review_sets'").get());
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  }
});

after(() => {
  db.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});
