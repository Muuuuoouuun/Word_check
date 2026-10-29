const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// All writes are confined to a fresh disposable database.
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "words-review-test-"));
process.env.DB_FILE = path.join(testDirectory, "test.db");
const db = require("../src/db");
require("../src/initDb")();
const { createReviewSetFromWrongItems, completeReviewSet, getReviewSet, buildStudentDashboard } = require("../src/services/studentProgress");
const { startStudentSession } = require("../src/services/studentSessions");

db.exec(`
  INSERT INTO teachers(id,name) VALUES ('teacher','Test');
  INSERT INTO students(id,student_code,name) VALUES ('student','S1','Test'),('other','S2','Other');
  INSERT INTO vocab_sources(id,name,source_type) VALUES ('source','Test words','CUSTOM');
`);
const addAssignment = db.prepare(`INSERT INTO homework_assignments
  (id,student_id,teacher_id,source_id,range_start_lesson,range_end_lesson,question_count,publish_at,due_at,status)
  VALUES (?,'student','teacher','source',1,1,2,'2026-09-05T00:00:00Z','2026-09-06T00:00:00Z','PUBLISHED')`);
for (let i = 0; i < 20; i++) addAssignment.run(`assignment-${i}`);
db.exec(`INSERT INTO test_sessions(id,assignment_id,student_id,generated_seed,status)
  VALUES ('session','assignment-0','student','test','COMPLETED');`);
for (const [index, word] of ["achieve", "remember"].entries()) {
  db.prepare(`INSERT INTO vocab_items(id,source_id,lemma,meaning_primary) VALUES (?,'source',?,'뜻')`).run(`word-${index}`,word);
  db.prepare(`INSERT INTO test_questions(id,test_session_id,vocab_item_id,order_no,type,prompt,expected_answer)
    VALUES (?,'session',?,?,'DIRECT_TRANSLATION','뜻',?)`).run(`q-${index}`,`word-${index}`,index+1,word);
}
function newReview() {
  db.exec("DELETE FROM review_set_items; DELETE FROM review_sets; DELETE FROM student_xp_events; DELETE FROM student_badge_grants; DELETE FROM student_game_profiles; DELETE FROM student_vocab_stats;");
  return createReviewSetFromWrongItems({ studentId: "student", assignmentId: "assignment-0", sourceSessionId: "session",
    wrongItems: ["achieve","remember"].map((word,index)=>({questionId:`q-${index}`,vocabItemId:`word-${index}`,prompt:"뜻",expectedAnswer:word,response:"wrong"})) });
}

test("dashboard includes every assignment beyond the former 16-item cap", () => {
  assert.equal(buildStudentDashboard("student").items.length,20);
  assert.equal(buildStudentDashboard("student").items.find(item => item.id === "assignment-0").preview_word,"achieve");
});
test("missing, wrong, foreign, and duplicate answers cannot complete a review", () => {
  const review = newReview();
  assert.throws(()=>completeReviewSet(review.id,"student"),/답안/);
  assert.throws(()=>completeReviewSet(review.id,"other",[]),/찾을/);
  assert.throws(()=>completeReviewSet(review.id,"student",[{itemId:"foreign",response:"achieve"}]),/유효/);
  const answer = {itemId:review.items[0].id,response:"achieve"};
  assert.throws(()=>completeReviewSet(review.id,"student",[answer,answer]),/유효/);
  const checked = completeReviewSet(review.id,"student",review.items.map(item=>({itemId:item.id,response:"wrong"})));
  assert.equal(checked.reviewSet.status,"OPEN");
  assert.equal(checked.reviewSet.recoveredCount,0);
  assert.equal(checked.rewards,null);
});
test("partial recovery persists; only correct answers update mastery; completion rewards are idempotent", () => {
  const review = newReview();
  const first = {itemId:review.items[0].id,response:" ACHIEVE! "};
  let checked = completeReviewSet(review.id,"student",[first,{itemId:review.items[1].id,response:"wrong"}]);
  assert.equal(checked.reviewSet.status,"OPEN");
  assert.equal(getReviewSet(review.id,"student").recoveredCount,1);
  assert.equal(buildStudentDashboard("student").learningSummary.trackedCount,1);
  completeReviewSet(review.id,"student",[first]);
  assert.equal(db.prepare("SELECT correct_count FROM student_vocab_stats WHERE vocab_item_id='word-0'").get().correct_count,1);
  checked = completeReviewSet(review.id,"student",[{itemId:review.items[1].id,response:"remember"}]);
  assert.equal(checked.reviewSet.status,"COMPLETED");
  assert.equal(checked.reviewSet.recoveredCount,2);
  assert.equal(checked.rewards.earnedXp,8);
  assert.equal(checked.rewards.profile.currentStreak,1);
  assert.equal(completeReviewSet(review.id,"student").rewards.earnedXp,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM student_xp_events").get().n,1);
});
test("failed mastery update rolls back recovery", () => {
  const review = newReview();
  db.exec("CREATE TRIGGER fail_stats BEFORE INSERT ON student_vocab_stats BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  try {
    assert.throws(()=>completeReviewSet(review.id,"student",[{itemId:review.items[0].id,response:"achieve"}]),/test failure/);
    assert.equal(getReviewSet(review.id,"student").recoveredCount,0);
    assert.equal(getReviewSet(review.id,"student").items[0].isRecovered,false);
  } finally { db.exec("DROP TRIGGER fail_stats"); }
});
test("session start rejects terminal and scheduled states without changing either record", () => {
  for (const state of ["COMPLETED", "SCHEDULED", "CANCELED"]) {
    for (const blockedRecord of ["test_sessions", "homework_assignments"]) {
      db.exec("UPDATE test_sessions SET status='PUBLISHED'; UPDATE homework_assignments SET status='PUBLISHED' WHERE id='assignment-0';");
      db.prepare(`UPDATE ${blockedRecord} SET status=? WHERE id=?`).run(state,blockedRecord === "test_sessions" ? "session" : "assignment-0");
      const beforeSession = db.prepare("SELECT * FROM test_sessions WHERE id='session'").get();
      const beforeAssignment = db.prepare("SELECT * FROM homework_assignments WHERE id='assignment-0'").get();
      assert.throws(()=>startStudentSession("session","student"),{status:409});
      assert.deepEqual(db.prepare("SELECT * FROM test_sessions WHERE id='session'").get(),beforeSession);
      assert.deepEqual(db.prepare("SELECT * FROM homework_assignments WHERE id='assignment-0'").get(),beforeAssignment);
    }
  }
});
test("session start enforces ownership and preview, and preserves the timer when resuming", () => {
  db.exec("UPDATE test_sessions SET status='PUBLISHED',started_at=NULL,preview_completed_at=NULL; UPDATE homework_assignments SET status='PUBLISHED',preview_enabled=1 WHERE id='assignment-0';");
  assert.throws(()=>startStudentSession("missing","student"),{status:404});
  assert.throws(()=>startStudentSession("session","other"),{status:403});
  assert.throws(()=>startStudentSession("session","student"),{status:409});
  db.exec("UPDATE test_sessions SET preview_completed_at='2026-09-07T00:00:00Z';");
  assert.deepEqual(startStudentSession("session","student"),{ok:true});
  const start = db.prepare("SELECT started_at FROM test_sessions WHERE id='session'").get().started_at;
  startStudentSession("session","student");
  assert.equal(db.prepare("SELECT started_at FROM test_sessions WHERE id='session'").get().started_at,start);
  assert.equal(db.prepare("SELECT status FROM homework_assignments WHERE id='assignment-0'").get().status,"IN_PROGRESS");
});
after(() => {
  db.close();
  // The directory was created here with mkdtemp and contains only test data.
  assert.equal(path.dirname(path.resolve(testDirectory)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(testDirectory).startsWith("words-review-test-"));
  fs.rmSync(testDirectory, { recursive: true, force: true });
});
