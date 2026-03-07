const express = require("express");
const cron = require("node-cron");
const multer = require("multer");
const path = require("path");

const db = require("./db");
const initDb = require("./initDb");
const { uid, nowIso } = require("./utils");
const { verifyToken, verifyPassword, issueAuthForUser } = require("./services/auth");
const { createLoginAccessLink, exchangeLoginAccessLink } = require("./services/accessLinks");
const {
  generateTestForAssignment,
  createSupplementalAssignmentFromSession,
  exportSessionWorkbook,
  importSessionWorkbook,
  applyQuestionOverrides,
  getSessionQuestions,
} = require("./services/testGenerator");
const { runAutomationCycle, queueTier3ForCompletion } = require("./services/notifications");
const { getResolvedSettings, upsertTeacherSettings, getSettingDefinitions } = require("./services/settings");
const { importFromCsv, importFromJson } = require("./services/vocabImport");

initDb();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.resolve(process.cwd(), "public")));

const PRIVILEGED_ROLES = ["TEACHER", "ADMIN"];

function authRequired(roles = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ message: "토큰이 필요합니다." });

    try {
      const decoded = verifyToken(token);
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "권한이 없습니다." });
      }
      req.user = decoded;
      return next();
    } catch {
      return res.status(401).json({ message: "유효하지 않은 토큰입니다." });
    }
  };
}

function isAdmin(user) {
  return user?.role === "ADMIN";
}

function canManageTeacherResource(user, ownerTeacherId) {
  return isAdmin(user) || user?.teacherId === ownerTeacherId;
}

function resolveTeacherOwnerId(user, requestedTeacherId) {
  if (user.role === "TEACHER") {
    return user.teacherId;
  }

  if (user.role === "ADMIN") {
    const teacherId = String(requestedTeacherId || "").trim();
    if (!teacherId) {
      throw new Error("관리자 계정은 teacherId를 함께 보내야 합니다.");
    }

    const teacher = db.prepare(`SELECT id FROM teachers WHERE id = ?`).get(teacherId);
    if (!teacher) {
      throw new Error("유효한 teacherId가 필요합니다.");
    }
    return teacher.id;
  }

  throw new Error("권한이 없습니다.");
}

function buildBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function coerceNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finalizeSessionSubmission({ sessionId, answers, actor, note = null }) {
  if (!Array.isArray(answers)) {
    throw new Error("answers 배열이 필요합니다.");
  }

  const session = db
    .prepare(
      `SELECT ts.*, ha.id AS assignment_id, ha.teacher_id
       FROM test_sessions ts
       JOIN homework_assignments ha ON ha.id = ts.assignment_id
       WHERE ts.id = ?`
    )
    .get(sessionId);

  if (!session) {
    throw new Error("세션을 찾을 수 없습니다.");
  }
  if (session.status === "COMPLETED") {
    throw new Error("이미 완료된 세션입니다.");
  }

  const questionMap = new Map(
    db
      .prepare(
        `SELECT tq.id, tq.expected_answer, tq.prompt, tq.type, tq.blank_sentence, vi.meaning_primary
         FROM test_questions tq
         JOIN vocab_items vi ON vi.id = tq.vocab_item_id
         WHERE tq.test_session_id = ?`
      )
      .all(sessionId)
      .map((q) => [q.id, q])
  );

  let correct = 0;
  const total = questionMap.size;
  const wrongItems = [];

  const tx = db.transaction(() => {
    const upsert = db.prepare(
      `INSERT INTO student_answers (id, test_session_id, question_id, response, is_correct, answered_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(test_session_id, question_id)
       DO UPDATE SET response = excluded.response, is_correct = excluded.is_correct, answered_at = excluded.answered_at`
    );

    for (const ans of answers) {
      const q = questionMap.get(ans.questionId);
      if (!q) continue;
      const normalizedUser = String(ans.response || "").trim().toLowerCase();
      const normalizedExpected = String(q.expected_answer || "").trim().toLowerCase();
      const isCorrect = normalizedUser === normalizedExpected;
      if (isCorrect) correct += 1;
      if (!isCorrect) {
        wrongItems.push({
          questionId: q.id,
          type: q.type,
          prompt: q.prompt,
          blankSentence: q.blank_sentence,
          meaningPrimary: q.meaning_primary,
          expectedAnswer: q.expected_answer,
          response: String(ans.response || ""),
        });
      }
      upsert.run(uid(), sessionId, q.id, String(ans.response || ""), isCorrect ? 1 : 0, nowIso());
    }

    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const startedAt = nowIso();
    const completedAt = nowIso();

    db.prepare(
      `UPDATE test_sessions
       SET status = 'COMPLETED',
           started_at = COALESCE(started_at, ?),
           completed_at = ?,
           score = ?,
           out_of = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(startedAt, completedAt, score, 100, nowIso(), sessionId);

    db.prepare(`UPDATE homework_assignments SET status = 'COMPLETED', updated_at = ? WHERE id = ?`).run(nowIso(), session.assignment_id);

    if (actor.mode !== "STUDENT_SELF") {
      db.prepare(
        `INSERT INTO proxy_submission_log
         (id, test_session_id, assignment_id, student_id, actor_user_id, actor_role, entry_mode, note, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uid(),
        sessionId,
        session.assignment_id,
        session.student_id,
        actor.userId,
        actor.role,
        actor.mode,
        note || null,
        JSON.stringify({
          answerCount: answers.length,
          totalQuestionCount: total,
        }),
        nowIso()
      );
    }
  });

  tx();

  queueTier3ForCompletion(session.assignment_id);

  const finalSession = db.prepare(`SELECT score, out_of FROM test_sessions WHERE id = ?`).get(sessionId);
  const wrongCount = Math.max(0, total - correct);
  const settings = getResolvedSettings({ ownerTeacherId: session.teacher_id });
  const minWrongForSupplement = Math.max(1, coerceNumber(settings.supplement_min_wrong, 1));
  const maxSupplementQuestions = Math.max(1, coerceNumber(settings.supplement_max_questions, 10));
  const supplementDueHours = Math.max(1, coerceNumber(settings.supplement_due_hours, 24));
  const elapsedSeconds = session.started_at
    ? Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000))
    : null;

  let supplemental = null;
  if (wrongCount >= minWrongForSupplement) {
    try {
      supplemental = createSupplementalAssignmentFromSession(sessionId, {
        questionCount: Math.min(wrongCount, maxSupplementQuestions),
        dueHours: supplementDueHours,
      });
    } catch (supplementErr) {
      console.error("supplement generation error", sessionId, supplementErr.message);
    }
  }

  return {
    score: finalSession.score,
    outOf: finalSession.out_of,
    correctCount: correct,
    wrongCount,
    wrongItems,
    elapsedSeconds,
    supplementalAvailable: wrongCount > 0,
    supplementalCreated: Boolean(supplemental),
    supplementalAssignmentId: supplemental?.assignmentId || null,
    supplementalSessionId: supplemental?.sessionId || null,
    supplementalDueAt: supplemental?.dueAt || null,
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, at: nowIso() });
});

app.post("/auth/login", (req, res) => {
  const { email, password, deviceFingerprint, pushToken } = req.body;
  if (!email || !password || !deviceFingerprint) {
    return res.status(400).json({ message: "email, password, deviceFingerprint이 필요합니다." });
  }

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: "이메일 또는 비밀번호가 올바르지 않습니다." });
  }

  return res.json(
    issueAuthForUser(user, {
      deviceFingerprint,
      pushToken,
    })
  );
});

app.post("/auth/access-links/exchange", (req, res) => {
  const { loginToken, deviceFingerprint, pushToken } = req.body;
  if (!loginToken || !deviceFingerprint) {
    return res.status(400).json({ message: "loginToken, deviceFingerprint이 필요합니다." });
  }

  try {
    return res.json(
      exchangeLoginAccessLink({
        loginToken,
        deviceFingerprint,
        pushToken,
      })
    );
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.post("/auth/access-links", authRequired(PRIVILEGED_ROLES), async (req, res) => {
  try {
    const { userId, studentId, label, expiresInMinutes, channel } = req.body;

    let targetUser = null;
    if (userId) {
      targetUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(String(userId));
    } else if (studentId) {
      targetUser = db.prepare(`SELECT * FROM users WHERE student_id = ? AND role = 'STUDENT'`).get(String(studentId));
    }

    if (!targetUser) {
      return res.status(404).json({ message: "접속 링크를 발급할 사용자를 찾을 수 없습니다." });
    }

    const student = targetUser.student_id
      ? db.prepare(`SELECT id, student_code, name FROM students WHERE id = ?`).get(targetUser.student_id)
      : null;

    const result = await createLoginAccessLink({
      userId: targetUser.id,
      createdByUserId: req.user.sub,
      createdByRole: req.user.role,
      label: label || (student ? `${student.name} 빠른 로그인` : "빠른 로그인"),
      channel: channel === "QR" ? "QR" : "LINK",
      expiresInMinutes: Number(expiresInMinutes || 30),
      metadata: {
        issuedFrom: "teacher-board",
        studentId: student?.id || null,
      },
      baseUrl: buildBaseUrl(req),
    });

    return res.status(201).json({
      ...result,
      target: student
        ? {
            studentId: student.id,
            studentCode: student.student_code,
            name: student.name,
          }
        : null,
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.get("/students/me/dashboard", authRequired(["STUDENT"]), (req, res) => {
  const rows = db
    .prepare(
      `SELECT ha.*, ts.id AS test_session_id, ts.status AS test_session_status, ts.score
       FROM homework_assignments ha
       LEFT JOIN test_sessions ts ON ts.assignment_id = ha.id
       WHERE ha.student_id = ?
         AND ha.status IN ('SCHEDULED','PUBLISHED','IN_PROGRESS','MISSED')
       ORDER BY ha.due_at ASC`
    )
    .all(req.user.studentId);

  res.json({ items: rows });
});

app.get("/students/test-sessions/:id/questions", authRequired(["STUDENT"]), (req, res) => {
  const session = db.prepare(`SELECT * FROM test_sessions WHERE id = ?`).get(req.params.id);
  if (!session) return res.status(404).json({ message: "세션을 찾을 수 없습니다." });
  if (session.student_id !== req.user.studentId) return res.status(403).json({ message: "권한이 없습니다." });

  const questions = db
    .prepare(
      `SELECT id, order_no, type, prompt, blank_sentence
       FROM test_questions
       WHERE test_session_id = ?
       ORDER BY order_no ASC`
    )
    .all(req.params.id);

  return res.json({
    session: {
      id: session.id,
      status: session.status,
      startedAt: session.started_at,
      completedAt: session.completed_at,
      score: session.score,
      outOf: session.out_of,
    },
    questions,
  });
});

app.post("/teacher/assignments", authRequired(PRIVILEGED_ROLES), (req, res) => {
  const { studentId, sourceId, rangeStartLesson, rangeEndLesson, questionCount, publishAt, dueAt, teacherId } = req.body;
  if (!studentId || !sourceId || !rangeStartLesson || !rangeEndLesson || !questionCount || !publishAt) {
    return res.status(400).json({ message: "필수 값이 누락되었습니다." });
  }

  const availableCount = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM vocab_items vi
       JOIN vocab_lessons vl ON vl.id = vi.lesson_id
       WHERE vi.source_id = ?
         AND vl.lesson_no BETWEEN ? AND ?`
    )
    .get(sourceId, Number(rangeStartLesson), Number(rangeEndLesson)).c;

  if (availableCount < Number(questionCount)) {
    return res.status(400).json({
      message: `해당 단원 범위의 단어가 부족합니다. 요청 문항=${Number(questionCount)}, 가능 단어=${availableCount}`,
    });
  }

  const id = uid();
  const ownerTeacherId = resolveTeacherOwnerId(req.user, teacherId);
  const settings = getResolvedSettings({ ownerTeacherId });
  const publishIso = new Date(publishAt).toISOString();
  const defaultDueHours = Math.max(1, coerceNumber(settings.default_assignment_due_hours, 2));
  const dueIso = dueAt
    ? new Date(dueAt).toISOString()
    : new Date(new Date(publishIso).getTime() + defaultDueHours * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO homework_assignments
     (id, student_id, teacher_id, source_id, range_start_lesson, range_end_lesson, question_count, publish_at, due_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`
  ).run(
    id,
    studentId,
    ownerTeacherId,
    sourceId,
    Number(rangeStartLesson),
    Number(rangeEndLesson),
    Number(questionCount),
    publishIso,
    dueIso,
    nowIso(),
    nowIso()
  );

  res.status(201).json({ assignmentId: id });
});

app.get("/teacher/meta", authRequired(PRIVILEGED_ROLES), (req, res) => {
  const students = db
    .prepare(
      `SELECT s.id, s.student_code, s.name, s.timezone, u.id AS user_id
       FROM students s
       LEFT JOIN users u ON u.student_id = s.id AND u.role = 'STUDENT'
       ORDER BY s.name ASC`
    )
    .all();
  const teachers = db.prepare(`SELECT id, name FROM teachers ORDER BY name ASC`).all();
  const sources = db
    .prepare(
      `SELECT vs.id, vs.name, vs.source_type,
              COUNT(vi.id) AS word_count,
              MIN(vl.lesson_no) AS min_lesson,
              MAX(vl.lesson_no) AS max_lesson
       FROM vocab_sources vs
       LEFT JOIN vocab_items vi ON vi.source_id = vs.id
       LEFT JOIN vocab_lessons vl ON vl.id = vi.lesson_id
       GROUP BY vs.id
       ORDER BY vs.created_at DESC`
    )
    .all();

  res.json({
    students,
    teachers,
    sources,
    currentTeacherId: req.user.teacherId || null,
    canChooseTeacher: isAdmin(req.user),
  });
});

app.get("/teacher/settings", authRequired(PRIVILEGED_ROLES), (req, res) => {
  try {
    const ownerTeacherId = resolveTeacherOwnerId(req.user, req.query.teacherId || req.user.teacherId);
    return res.json({
      ownerTeacherId,
      definitions: getSettingDefinitions(),
      values: getResolvedSettings({ ownerTeacherId }),
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.put("/teacher/settings", authRequired(PRIVILEGED_ROLES), (req, res) => {
  try {
    const ownerTeacherId = resolveTeacherOwnerId(req.user, req.body?.teacherId || req.user.teacherId);
    const values = upsertTeacherSettings({
      ownerTeacherId,
      settings: req.body?.settings || {},
      updatedByUserId: req.user.sub,
    });

    return res.json({
      ok: true,
      ownerTeacherId,
      definitions: getSettingDefinitions(),
      values,
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.get("/teacher/assignments", authRequired(PRIVILEGED_ROLES), (req, res) => {
  const studentId = req.query.studentId ? String(req.query.studentId) : null;
  const teacherId = req.query.teacherId ? String(req.query.teacherId) : null;
  const whereClauses = [];
  const params = [];

  if (!isAdmin(req.user)) {
    whereClauses.push("ha.teacher_id = ?");
    params.push(req.user.teacherId);
  } else if (teacherId) {
    whereClauses.push("ha.teacher_id = ?");
    params.push(teacherId);
  }

  if (studentId) {
    whereClauses.push("ha.student_id = ?");
    params.push(studentId);
  }

  const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT ha.*, s.name AS student_name, vs.name AS source_name,
              ts.id AS test_session_id, ts.status AS test_session_status, ts.score AS test_score
       FROM homework_assignments ha
       JOIN students s ON s.id = ha.student_id
       JOIN vocab_sources vs ON vs.id = ha.source_id
       LEFT JOIN test_sessions ts ON ts.assignment_id = ha.id
       ${where}
       ORDER BY ha.created_at DESC`
    )
    .all(...params);

  res.json({ items: rows });
});

app.post("/teacher/assignments/:id/generate", authRequired(PRIVILEGED_ROLES), (req, res) => {
  try {
    const assignment = db.prepare(`SELECT * FROM homework_assignments WHERE id = ?`).get(req.params.id);
    if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
    if (!canManageTeacherResource(req.user, assignment.teacher_id)) return res.status(403).json({ message: "권한이 없습니다." });

    const sessionId = generateTestForAssignment(req.params.id);
    const questions = getSessionQuestions(sessionId);
    return res.json({ sessionId, questions });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.post("/teacher/assignments/:id/publish-now", authRequired(PRIVILEGED_ROLES), (req, res) => {
  try {
    const assignment = db.prepare(`SELECT * FROM homework_assignments WHERE id = ?`).get(req.params.id);
    if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
    if (!canManageTeacherResource(req.user, assignment.teacher_id)) return res.status(403).json({ message: "권한이 없습니다." });

    db.prepare(`UPDATE homework_assignments SET publish_at = ?, updated_at = ? WHERE id = ?`).run(nowIso(), nowIso(), req.params.id);
    const sessionId = generateTestForAssignment(req.params.id);
    return res.json({ ok: true, sessionId });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.get("/teacher/assignments/:id/export.xlsx", authRequired(PRIVILEGED_ROLES), async (req, res) => {
  try {
    const assignment = db.prepare(`SELECT * FROM homework_assignments WHERE id = ?`).get(req.params.id);
    if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
    if (!canManageTeacherResource(req.user, assignment.teacher_id)) return res.status(403).json({ message: "권한이 없습니다." });

    const session = db.prepare(`SELECT * FROM test_sessions WHERE assignment_id = ?`).get(req.params.id);
    const sessionId = session ? session.id : generateTestForAssignment(req.params.id);
    const xlsx = await exportSessionWorkbook(sessionId);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=assignment_${req.params.id}.xlsx`);
    return res.send(Buffer.from(xlsx));
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.post("/teacher/assignments/:id/import.xlsx", authRequired(PRIVILEGED_ROLES), upload.single("file"), async (req, res) => {
  try {
    const assignment = db.prepare(`SELECT * FROM homework_assignments WHERE id = ?`).get(req.params.id);
    if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
    if (!canManageTeacherResource(req.user, assignment.teacher_id)) return res.status(403).json({ message: "권한이 없습니다." });
    if (!req.file) return res.status(400).json({ message: "xlsx 파일이 필요합니다. field name=file" });

    const session = db.prepare(`SELECT * FROM test_sessions WHERE assignment_id = ?`).get(req.params.id);
    if (!session) return res.status(400).json({ message: "먼저 시험을 생성하세요." });

    await importSessionWorkbook(session.id, req.file.buffer);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.post("/teacher/test-sessions/:id/override", authRequired(PRIVILEGED_ROLES), (req, res) => {
  try {
    const session = db.prepare(
      `SELECT ts.*, ha.teacher_id
       FROM test_sessions ts
       JOIN homework_assignments ha ON ha.id = ts.assignment_id
       WHERE ts.id = ?`
    ).get(req.params.id);

    if (!session) return res.status(404).json({ message: "세션을 찾을 수 없습니다." });
    if (!canManageTeacherResource(req.user, session.teacher_id)) return res.status(403).json({ message: "권한이 없습니다." });

    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: "questions 배열이 필요합니다." });
    }

    applyQuestionOverrides(req.params.id, questions);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.get("/teacher/test-sessions/:id/questions", authRequired(PRIVILEGED_ROLES), (req, res) => {
  const session = db.prepare(
    `SELECT ts.*, ha.teacher_id
     FROM test_sessions ts
     JOIN homework_assignments ha ON ha.id = ts.assignment_id
     WHERE ts.id = ?`
  ).get(req.params.id);

  if (!session) return res.status(404).json({ message: "세션을 찾을 수 없습니다." });
  if (!canManageTeacherResource(req.user, session.teacher_id)) return res.status(403).json({ message: "권한이 없습니다." });

  return res.json({
    session: {
      id: session.id,
      assignmentId: session.assignment_id,
      studentId: session.student_id,
      status: session.status,
      startedAt: session.started_at,
      completedAt: session.completed_at,
      score: session.score,
    },
    questions: getSessionQuestions(req.params.id),
  });
});

app.post("/teacher/test-sessions/:id/supplement", authRequired(PRIVILEGED_ROLES), (req, res) => {
  try {
    const session = db.prepare(
      `SELECT ts.*, ha.teacher_id
       FROM test_sessions ts
       JOIN homework_assignments ha ON ha.id = ts.assignment_id
       WHERE ts.id = ?`
    ).get(req.params.id);

    if (!session) return res.status(404).json({ message: "세션을 찾을 수 없습니다." });
    if (!canManageTeacherResource(req.user, session.teacher_id)) return res.status(403).json({ message: "권한이 없습니다." });

    const result = createSupplementalAssignmentFromSession(req.params.id, {
      questionCount: req.body?.questionCount,
      dueHours: req.body?.dueHours,
    });

    return res.status(result.alreadyExists ? 200 : 201).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.post("/teacher/test-sessions/:id/offline-submit", authRequired(PRIVILEGED_ROLES), (req, res) => {
  try {
    const session = db.prepare(
      `SELECT ts.*, ha.teacher_id
       FROM test_sessions ts
       JOIN homework_assignments ha ON ha.id = ts.assignment_id
       WHERE ts.id = ?`
    ).get(req.params.id);

    if (!session) return res.status(404).json({ message: "세션을 찾을 수 없습니다." });
    if (!canManageTeacherResource(req.user, session.teacher_id)) return res.status(403).json({ message: "권한이 없습니다." });

    const result = finalizeSessionSubmission({
      sessionId: req.params.id,
      answers: req.body?.answers,
      actor: {
        userId: req.user.sub,
        role: req.user.role,
        mode: "OFFLINE_PROXY",
      },
      note: req.body?.note || null,
    });

    return res.json({ ok: true, ...result, submittedByProxy: true });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.post("/students/test-sessions/:id/start", authRequired(["STUDENT"]), (req, res) => {
  const session = db.prepare(`SELECT * FROM test_sessions WHERE id = ?`).get(req.params.id);
  if (!session) return res.status(404).json({ message: "세션을 찾을 수 없습니다." });
  if (session.student_id !== req.user.studentId) return res.status(403).json({ message: "권한이 없습니다." });

  db.prepare(
    `UPDATE test_sessions
     SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?), updated_at = ?
     WHERE id = ?`
  ).run(nowIso(), nowIso(), req.params.id);

  db.prepare(`UPDATE homework_assignments SET status = 'IN_PROGRESS', updated_at = ? WHERE id = ?`).run(nowIso(), session.assignment_id);

  res.json({ ok: true });
});

app.post("/students/test-sessions/:id/submit", authRequired(["STUDENT"]), (req, res) => {
  const { answers } = req.body;
  if (!Array.isArray(answers)) {
    return res.status(400).json({ message: "answers 배열이 필요합니다." });
  }

  const session = db.prepare(`SELECT * FROM test_sessions WHERE id = ?`).get(req.params.id);
  if (!session) return res.status(404).json({ message: "세션을 찾을 수 없습니다." });
  if (session.student_id !== req.user.studentId) return res.status(403).json({ message: "권한이 없습니다." });

  try {
    const result = finalizeSessionSubmission({
      sessionId: req.params.id,
      answers,
      actor: {
        userId: req.user.sub,
        role: req.user.role,
        mode: "STUDENT_SELF",
      },
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.get("/parents/me/reports", authRequired(["PARENT"]), (req, res) => {
  const rows = db
    .prepare(
      `SELECT nl.*
       FROM notification_log nl
       WHERE nl.parent_id = ?
         AND nl.tier = 'TIER3_PARENT_REPORT'
       ORDER BY nl.created_at DESC`
    )
    .all(req.user.parentId)
    .map((r) => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : null }));

  res.json({ reports: rows });
});

app.post("/teacher/vocab/import/json", authRequired(PRIVILEGED_ROLES), (req, res) => {
  const { name, sourceType, rows, teacherId } = req.body;
  if (!name || !sourceType || !Array.isArray(rows)) {
    return res.status(400).json({ message: "name, sourceType, rows가 필요합니다." });
  }

  try {
    const ownerTeacherId = resolveTeacherOwnerId(req.user, teacherId);
    const result = importFromJson(rows, {
      name,
      sourceType,
      ownerTeacherId,
      metadata: { importedVia: "json-api" },
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.post("/teacher/vocab/import/csv", authRequired(PRIVILEGED_ROLES), upload.single("file"), (req, res) => {
  const { name, sourceType, teacherId } = req.body;
  if (!req.file || !name || !sourceType) {
    return res.status(400).json({ message: "file, name, sourceType이 필요합니다." });
  }

  try {
    const ownerTeacherId = resolveTeacherOwnerId(req.user, teacherId);
    const fs = require("fs");
    const tempDir = path.resolve(process.cwd(), "data", "imports");
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `${uid()}.csv`);
    fs.writeFileSync(tempFile, req.file.buffer);

    const result = importFromCsv(tempFile, {
      name,
      sourceType,
      ownerTeacherId,
      metadata: { importedVia: "csv-api" },
    });

    fs.unlinkSync(tempFile);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.get("/*path", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "public", "index.html"));
});

cron.schedule("* * * * *", () => {
  runAutomationCycle();
});

runAutomationCycle();

const port = Number(process.env.PORT || 4002);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
