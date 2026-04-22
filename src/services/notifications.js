const db = require("../db");
const { uid, nowIso } = require("../utils");
const { generateTestForAssignment } = require("./testGenerator");
const { getResolvedSettings } = require("./settings");

function insertNotification({
  assignmentId,
  studentId = null,
  parentId = null,
  tier,
  channel,
  scheduledAt,
  payload,
  idempotencyKey,
}) {
  db.prepare(
    `INSERT OR IGNORE INTO notification_log
     (id, assignment_id, student_id, parent_id, tier, channel, status, scheduled_at, payload, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`
  ).run(uid(), assignmentId, studentId, parentId, tier, channel, scheduledAt, JSON.stringify(payload || {}), idempotencyKey, nowIso());
}

function createSettingsCache() {
  return new Map();
}

function getTeacherSettings(ownerTeacherId, cache = null) {
  if (!cache) return getResolvedSettings({ ownerTeacherId });
  if (!cache.has(ownerTeacherId)) {
    cache.set(ownerTeacherId, getResolvedSettings({ ownerTeacherId }));
  }
  return cache.get(ownerTeacherId);
}

function queueTier1(assignment, settingsCache = null) {
  const settings = getTeacherSettings(assignment.teacher_id, settingsCache);
  if (!settings.notify_student_on_publish) {
    return;
  }

  insertNotification({
    assignmentId: assignment.id,
    studentId: assignment.student_id,
    tier: "TIER1_STUDENT_ASSIGN",
    channel: "PUSH",
    scheduledAt: nowIso(),
    payload: { message: "오늘 단어 시험이 배정되었습니다. 지금 시작하세요." },
    idempotencyKey: `A:${assignment.id}:T1:S:${assignment.student_id}`,
  });
}

function queueTier2(assignment, settingsCache = null) {
  const settings = getTeacherSettings(assignment.teacher_id, settingsCache);
  if (!settings.notify_student_on_reminder) {
    return;
  }

  insertNotification({
    assignmentId: assignment.id,
    studentId: assignment.student_id,
    tier: "TIER2_STUDENT_REMIND",
    channel: "PUSH",
    scheduledAt: nowIso(),
    payload: { message: "미완료 숙제가 있습니다. 단어 시험을 완료하세요." },
    idempotencyKey: `A:${assignment.id}:T2:S:${assignment.student_id}`,
  });
}

function queueTier3ForCompletion(assignmentId, settingsCache = null) {
  const assignment = db.prepare(`SELECT * FROM homework_assignments WHERE id = ?`).get(assignmentId);
  if (!assignment) return;

  const settings = getTeacherSettings(assignment.teacher_id, settingsCache);
  if (!settings.notify_parent_on_completed) {
    return;
  }

  const session = db.prepare(`SELECT * FROM test_sessions WHERE assignment_id = ?`).get(assignmentId);
  const parentRows = db
    .prepare(
      `SELECT sp.parent_id
       FROM student_parents sp
       WHERE sp.student_id = ? AND sp.receives_reports = 1`
    )
    .all(assignment.student_id);

  for (const row of parentRows) {
    insertNotification({
      assignmentId,
      studentId: assignment.student_id,
      parentId: row.parent_id,
      tier: "TIER3_PARENT_REPORT",
      channel: "SMS",
      scheduledAt: nowIso(),
      payload: {
        message: `자녀가 시험을 완료했습니다. 점수: ${session?.score ?? 0}/${session?.out_of ?? 0}`,
        result: "COMPLETED",
      },
      idempotencyKey: `A:${assignmentId}:T3:P:${row.parent_id}:COMPLETED`,
    });
  }
}

function queueTier3ForMissed(assignment, settingsCache = null) {
  const settings = getTeacherSettings(assignment.teacher_id, settingsCache);
  if (!settings.notify_parent_on_missed) {
    return;
  }

  const parentRows = db
    .prepare(
      `SELECT sp.parent_id
       FROM student_parents sp
       WHERE sp.student_id = ? AND sp.receives_reports = 1`
    )
    .all(assignment.student_id);

  for (const row of parentRows) {
    insertNotification({
      assignmentId: assignment.id,
      studentId: assignment.student_id,
      parentId: row.parent_id,
      tier: "TIER3_PARENT_REPORT",
      channel: "SMS",
      scheduledAt: nowIso(),
      payload: {
        message: "긴급: 자녀가 오늘 과제를 완료하지 못했습니다.",
        result: "MISSED",
      },
      idempotencyKey: `A:${assignment.id}:T3:P:${row.parent_id}:MISSED`,
    });
  }
}

function dispatchDueAssignments() {
  const now = nowIso();
  const settingsCache = createSettingsCache();
  const dueRows = db
    .prepare(
      `SELECT * FROM homework_assignments
       WHERE status = 'SCHEDULED' AND publish_at <= ?`
    )
    .all(now);

  for (const assignment of dueRows) {
    try {
      generateTestForAssignment(assignment.id);
      queueTier1(assignment, settingsCache);
    } catch (err) {
      console.error("dispatchDueAssignments error", assignment.id, err.message);
      db.prepare(`UPDATE homework_assignments SET status = 'CANCELED', updated_at = ? WHERE id = ?`).run(nowIso(), assignment.id);
    }
  }
}

function processMissedAssignments() {
  const now = nowIso();
  const nowMs = Date.now();
  const settingsCache = createSettingsCache();
  const targetRows = db
    .prepare(
      `SELECT * FROM homework_assignments
       WHERE status IN ('PUBLISHED','IN_PROGRESS')
         AND due_at <= ?`
    )
    .all(now);

  const markMissed = db.transaction((assignment) => {
    db.prepare(`UPDATE homework_assignments SET status = 'MISSED', updated_at = ? WHERE id = ?`).run(now, assignment.id);
    db.prepare(`UPDATE test_sessions SET status = 'MISSED', updated_at = ? WHERE assignment_id = ? AND status != 'COMPLETED'`).run(
      now,
      assignment.id
    );
    queueTier3ForMissed(assignment, settingsCache);
  });

  for (const assignment of targetRows) {
    const dueMs = new Date(assignment.due_at).getTime();
    if (!Number.isFinite(dueMs) || dueMs > nowMs) {
      continue;
    }

    const settings = getTeacherSettings(assignment.teacher_id, settingsCache);
    const delayMinutes = Math.max(0, Number(settings.student_reminder_delay_minutes || 0));
    queueTier2(assignment, settingsCache);

    if (dueMs + delayMinutes * 60 * 1000 > nowMs) {
      continue;
    }

    markMissed(assignment);
  }
}

function sendDueNotifications() {
  const rows = db
    .prepare(
      `SELECT * FROM notification_log
       WHERE status = 'PENDING' AND scheduled_at <= ?
       ORDER BY created_at ASC
       LIMIT 100`
    )
    .all(nowIso());

  const markSent = db.prepare(
    `UPDATE notification_log
     SET status = 'SENT', sent_at = ?, attempt_count = attempt_count + 1
     WHERE id = ?`
  );

  const markFailed = db.prepare(
    `UPDATE notification_log
     SET status = 'FAILED', error_message = ?, attempt_count = attempt_count + 1
     WHERE id = ?`
  );

  for (const row of rows) {
    try {
      const payload = row.payload ? JSON.parse(row.payload) : {};
      // 실제 구현에서는 FCM/SMS/Kakao API 호출로 교체
      console.log(`[NOTIFY][${row.tier}][${row.channel}]`, payload.message || "");
      markSent.run(nowIso(), row.id);
    } catch (err) {
      markFailed.run(err.message, row.id);
    }
  }
}

function runAutomationCycle() {
  dispatchDueAssignments();
  processMissedAssignments();
  sendDueNotifications();
}

module.exports = {
  runAutomationCycle,
  queueTier3ForCompletion,
  sendDueNotifications,
};
