const db = require("../db");
const { nowIso } = require("../utils");

function reject(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function assertStudentSessionAllowed(session, studentId) {
  if (!session) reject(404, "세션을 찾을 수 없습니다.");
  if (session.student_id !== studentId || session.assignment_student_id !== studentId) reject(403, "권한이 없습니다.");
  if (!["PUBLISHED", "IN_PROGRESS", "MISSED"].includes(session.status) ||
      !["PUBLISHED", "IN_PROGRESS", "MISSED"].includes(session.assignment_status)) {
    reject(409, "예정·완료·취소된 시험은 응시할 수 없습니다.");
  }
  if (session.preview_enabled && !session.preview_completed_at) reject(409, "미리보기를 먼저 완료해야 시험에 응시할 수 있습니다.");
}

function startStudentSession(sessionId, studentId) {
  return db.transaction(() => {
    const session = db.prepare(`SELECT ts.*, ha.status AS assignment_status,
        ha.preview_enabled, ha.student_id AS assignment_student_id
      FROM test_sessions ts JOIN homework_assignments ha ON ha.id = ts.assignment_id
      WHERE ts.id = ?`).get(sessionId);
    assertStudentSessionAllowed(session, studentId);
    const now = nowIso();
    db.prepare(`UPDATE test_sessions SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`)
      .run(now, now, sessionId);
    db.prepare(`UPDATE homework_assignments SET status = 'IN_PROGRESS', updated_at = ? WHERE id = ?`)
      .run(now, session.assignment_id);
    return { ok: true };
  })();
}

module.exports = { assertStudentSessionAllowed, startStudentSession };
