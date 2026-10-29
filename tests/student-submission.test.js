const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "words-submit-test-"));
process.env.DB_FILE = path.join(testDirectory, "test.db");
const app = require("../src/index");
const db = require("../src/db");
const { createToken } = require("../src/services/auth");

db.exec(`
  INSERT INTO teachers(id,name) VALUES ('teacher','Teacher');
  INSERT INTO students(id,student_code,name) VALUES ('student','S1','Student'),('other','S2','Other');
  INSERT INTO users(id,role,email,password_hash,teacher_id) VALUES ('teacher-user','TEACHER','teacher@test.invalid','unused','teacher');
  INSERT INTO vocab_sources(id,name,source_type,owner_teacher_id) VALUES ('source','Words','CUSTOM','teacher');
  INSERT INTO vocab_items(id,source_id,lemma,meaning_primary) VALUES ('word','source','remember','기억하다');
`);

const studentToken = createToken({ id: "student-user", role: "STUDENT", student_id: "student" });
const teacherToken = createToken({ id: "teacher-user", role: "TEACHER", teacher_id: "teacher" });
let sequence = 0;
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

function newSession({ sessionStatus = "PUBLISHED", assignmentStatus = "PUBLISHED", sessionStudent = "student",
  assignmentStudent = "student", previewEnabled = false, previewCompleted = false } = {}) {
  const id = `case-${++sequence}`;
  db.prepare(`INSERT INTO homework_assignments
    (id,student_id,teacher_id,source_id,range_start_lesson,range_end_lesson,question_count,publish_at,due_at,status,preview_enabled)
    VALUES (?,?,'teacher','source',1,1,1,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z',?,?)`)
    .run(id, assignmentStudent, assignmentStatus, previewEnabled ? 1 : 0);
  db.prepare(`INSERT INTO test_sessions(id,assignment_id,student_id,generated_seed,status,preview_completed_at)
    VALUES (?,?,?,'seed',?,?)`).run(id, id, sessionStudent, sessionStatus, previewCompleted ? "2026-01-01T01:00:00Z" : null);
  db.prepare(`INSERT INTO test_questions(id,test_session_id,vocab_item_id,order_no,type,prompt,expected_answer)
    VALUES (?,?,'word',1,'DIRECT_TRANSLATION','기억하다','remember')`).run(id, id);
  return id;
}

function snapshot() {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  return tables.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY id`).all()]);
}

async function submit(id, token = studentToken, route = "students/test-sessions", action = "submit") {
  const response = await fetch(`${baseUrl}/${route}/${id}/${action}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ answers: [{ questionId: id, response: "remember" }] }),
  });
  return { status: response.status, body: await response.json() };
}

test("HTTP submission rejects scheduled, canceled and completed session or assignment without any writes", async () => {
  for (const state of ["SCHEDULED", "CANCELED", "COMPLETED"]) {
    for (const field of ["sessionStatus", "assignmentStatus"]) {
      const id = newSession({ [field]: state });
      const before = snapshot();
      assert.equal((await submit(id)).status, 409, `${field}=${state}`);
      assert.deepEqual(snapshot(), before, "answers, scores, rewards and notifications are unchanged");
    }
  }
});

test("HTTP submission enforces required preview and both ownership records", async () => {
  for (const [options, expected] of [
    [{ previewEnabled: true }, 409],
    [{ sessionStudent: "other" }, 403],
    [{ assignmentStudent: "other" }, 403],
  ]) {
    const id = newSession(options);
    const before = snapshot();
    assert.equal((await submit(id)).status, expected);
    assert.deepEqual(snapshot(), before);
  }
  assert.equal((await submit("missing-session")).status, 404);
});

test("HTTP submission accepts eligible states, completed preview, and prevents duplicate rewards", async () => {
  for (const state of ["PUBLISHED", "IN_PROGRESS", "MISSED"]) {
    const id = newSession({ sessionStatus: state, assignmentStatus: state, previewEnabled: true, previewCompleted: true });
    const result = await submit(id);
    assert.equal(result.status, 200);
    assert.equal(result.body.score, 100);
    assert.equal(result.body.earnedXp, 10);
    assert.equal(db.prepare("SELECT status FROM test_sessions WHERE id=?").get(id).status, "COMPLETED");
    assert.equal(db.prepare("SELECT status FROM homework_assignments WHERE id=?").get(id).status, "COMPLETED");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM student_answers WHERE test_session_id=?").get(id).n, 1);
    const before = snapshot();
    assert.equal((await submit(id)).status, 409);
    assert.deepEqual(snapshot(), before);
  }
});

test("teacher offline submission still works without student preview completion", async () => {
  const id = newSession({ previewEnabled: true });
  const result = await submit(id, teacherToken, "teacher/test-sessions", "offline-submit");
  assert.equal(result.status, 200);
  assert.equal(result.body.submittedByProxy, true);
  assert.equal(result.body.score, 100);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM proxy_submission_log WHERE test_session_id=?").get(id).n, 1);
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  db.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});
