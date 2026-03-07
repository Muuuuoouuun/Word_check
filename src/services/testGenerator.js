const ExcelJS = require("exceljs");
const db = require("../db");
const { uid, nowIso, hashSeed, mulberry32 } = require("../utils");

function makeBlank(sentence, lemma) {
  if (!sentence) return null;
  const escaped = String(lemma || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "i");
  return sentence.replace(pattern, "____");
}

function sampleWithoutReplacement(items, count, rng) {
  const copy = items.slice();
  const out = [];
  for (let i = 0; i < count && copy.length > 0; i += 1) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

function buildQuestion(word, orderNo, rng) {
  let type = "DIRECT_TRANSLATION";
  let prompt = `다음을 영어로 쓰세요: ${word.meaning_primary}`;
  let blankSentence = null;

  if (word.example_sentence && rng() < 0.4) {
    const blank = makeBlank(word.example_sentence, word.lemma);
    if (blank && blank !== word.example_sentence) {
      type = "FILL_IN_BLANK";
      prompt = `빈칸에 알맞은 단어를 쓰세요: ${blank}`;
      blankSentence = blank;
    }
  }

  return {
    id: uid(),
    vocabItemId: word.id,
    orderNo,
    type,
    prompt,
    expectedAnswer: word.lemma,
    blankSentence,
  };
}

function createSessionWithWords(assignment, selectedWords, seedText) {
  const seed = hashSeed(seedText);
  const rng = mulberry32(seed);
  const sessionId = uid();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO test_sessions (id, assignment_id, student_id, status, generated_seed, created_at, updated_at)
       VALUES (?, ?, ?, 'PUBLISHED', ?, ?, ?)`
    ).run(sessionId, assignment.id, assignment.student_id, String(seed), nowIso(), nowIso());

    const insertQuestion = db.prepare(
      `INSERT INTO test_questions
       (id, test_session_id, vocab_item_id, order_no, type, prompt, expected_answer, blank_sentence, is_teacher_edited)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
    );

    selectedWords.forEach((word, idx) => {
      const q = buildQuestion(word, idx + 1, rng);
      insertQuestion.run(q.id, sessionId, q.vocabItemId, q.orderNo, q.type, q.prompt, q.expectedAnswer, q.blankSentence);
    });

    db.prepare(`UPDATE homework_assignments SET status = 'PUBLISHED', updated_at = ? WHERE id = ?`).run(nowIso(), assignment.id);

    db.prepare(
      `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, created_at)
       VALUES (?, 'ASSIGNMENT_PUBLISHED', 'homework_assignment', ?, ?, ?)`
    ).run(uid(), assignment.id, JSON.stringify({ assignmentId: assignment.id }), nowIso());
  });

  tx();
  return sessionId;
}

function generateTestForAssignment(assignmentId) {
  const assignment = db.prepare(`SELECT * FROM homework_assignments WHERE id = ?`).get(assignmentId);
  if (!assignment) {
    throw new Error("Assignment not found");
  }

  const existingSession = db.prepare(`SELECT * FROM test_sessions WHERE assignment_id = ?`).get(assignmentId);
  if (existingSession) {
    return existingSession.id;
  }

  const words = db
    .prepare(
      `SELECT vi.*
       FROM vocab_items vi
       JOIN vocab_lessons vl ON vl.id = vi.lesson_id
       WHERE vi.source_id = ?
         AND vl.lesson_no BETWEEN ? AND ?`
    )
    .all(assignment.source_id, assignment.range_start_lesson, assignment.range_end_lesson);

  if (words.length < assignment.question_count) {
    throw new Error(`Not enough words in range. need=${assignment.question_count}, got=${words.length}`);
  }

  const dateText = String(assignment.publish_at || "").slice(0, 10);
  const seedText = `${assignment.student_id}:${assignment.id}:${dateText}`;
  const rng = mulberry32(hashSeed(seedText));
  const selected = sampleWithoutReplacement(words, assignment.question_count, rng);

  return createSessionWithWords(assignment, selected, seedText);
}

function createSupplementalAssignmentFromSession(testSessionId, options = {}) {
  const existingEvent = db
    .prepare(
      `SELECT payload
       FROM outbox_events
       WHERE event_type = 'SUPPLEMENT_CREATED'
         AND aggregate_type = 'test_session'
         AND aggregate_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(testSessionId);

  if (existingEvent) {
    try {
      const parsed = JSON.parse(existingEvent.payload || "{}");
      if (parsed.assignmentId && parsed.sessionId) {
        return {
          assignmentId: parsed.assignmentId,
          sessionId: parsed.sessionId,
          questionCount: parsed.questionCount || 0,
          dueAt: parsed.dueAt || null,
          wrongWordCount: parsed.wrongWordCount || 0,
          alreadyExists: true,
        };
      }
    } catch {
      // no-op
    }
  }

  const session = db
    .prepare(
      `SELECT ts.*, ha.source_id, ha.teacher_id, ha.range_start_lesson, ha.range_end_lesson
       FROM test_sessions ts
       JOIN homework_assignments ha ON ha.id = ts.assignment_id
       WHERE ts.id = ?`
    )
    .get(testSessionId);

  if (!session) throw new Error("원본 시험 세션을 찾을 수 없습니다.");
  if (session.status !== "COMPLETED") throw new Error("보충 문제는 완료된 시험에서만 생성할 수 있습니다.");

  const wrongRows = db
    .prepare(
      `SELECT DISTINCT tq.vocab_item_id
       FROM student_answers sa
       JOIN test_questions tq ON tq.id = sa.question_id
       WHERE sa.test_session_id = ? AND sa.is_correct = 0`
    )
    .all(testSessionId);

  if (wrongRows.length === 0) {
    throw new Error("오답이 없어 보충 문제를 생성할 수 없습니다.");
  }

  const vocabIds = wrongRows.map((r) => r.vocab_item_id);
  const placeholders = vocabIds.map(() => "?").join(",");
  const words = db
    .prepare(
      `SELECT vi.*, COALESCE(vl.lesson_no, 1) AS lesson_no
       FROM vocab_items vi
       LEFT JOIN vocab_lessons vl ON vl.id = vi.lesson_id
       WHERE vi.id IN (${placeholders})`
    )
    .all(...vocabIds);

  const questionCount = Math.max(1, Math.min(Number(options.questionCount || words.length), words.length));
  const dueHours = Math.max(1, Number(options.dueHours || 24));

  const seedText = `${session.student_id}:${testSessionId}:supplement:${nowIso().slice(0, 10)}`;
  const selected = sampleWithoutReplacement(words, questionCount, mulberry32(hashSeed(seedText)));

  const lessonNos = selected.map((w) => Number(w.lesson_no || 1));
  const rangeStart = Math.min(...lessonNos);
  const rangeEnd = Math.max(...lessonNos);

  const assignment = {
    id: uid(),
    student_id: session.student_id,
    teacher_id: session.teacher_id,
    source_id: session.source_id,
    range_start_lesson: rangeStart,
    range_end_lesson: rangeEnd,
    question_count: questionCount,
    publish_at: nowIso(),
    due_at: new Date(Date.now() + dueHours * 60 * 60 * 1000).toISOString(),
  };

  db.prepare(
    `INSERT INTO homework_assignments
     (id, student_id, teacher_id, source_id, range_start_lesson, range_end_lesson, question_count, publish_at, due_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', ?, ?)`
  ).run(
    assignment.id,
    assignment.student_id,
    assignment.teacher_id,
    assignment.source_id,
    assignment.range_start_lesson,
    assignment.range_end_lesson,
    assignment.question_count,
    assignment.publish_at,
    assignment.due_at,
    nowIso(),
    nowIso()
  );

  const sessionId = createSessionWithWords(assignment, selected, seedText);

  db.prepare(
    `INSERT OR IGNORE INTO notification_log
     (id, assignment_id, student_id, parent_id, tier, channel, status, scheduled_at, payload, idempotency_key, created_at)
     VALUES (?, ?, ?, NULL, 'TIER1_STUDENT_ASSIGN', 'PUSH', 'PENDING', ?, ?, ?, ?)`
  ).run(
    uid(),
    assignment.id,
    assignment.student_id,
    nowIso(),
    JSON.stringify({ message: "오늘 보충 단어 시험이 배정되었습니다. 지금 시작하세요." }),
    `A:${assignment.id}:T1:S:${assignment.student_id}`,
    nowIso()
  );

  db.prepare(
    `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, created_at)
     VALUES (?, 'SUPPLEMENT_CREATED', 'test_session', ?, ?, ?)`
  ).run(
    uid(),
    testSessionId,
    JSON.stringify({
      sourceSessionId: testSessionId,
      assignmentId: assignment.id,
      sessionId,
      questionCount,
      dueAt: assignment.due_at,
      wrongWordCount: words.length,
    }),
    nowIso()
  );

  return {
    assignmentId: assignment.id,
    sessionId,
    questionCount,
    dueAt: assignment.due_at,
    wrongWordCount: words.length,
  };
}

async function exportSessionWorkbook(testSessionId) {
  const rows = db
    .prepare(
      `SELECT tq.id, tq.order_no, tq.type, tq.prompt, tq.expected_answer, tq.blank_sentence, tq.is_teacher_edited
       FROM test_questions tq
       WHERE tq.test_session_id = ?
       ORDER BY tq.order_no ASC`
    )
    .all(testSessionId);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("questions");
  ws.columns = [
    { header: "question_id", key: "id", width: 40 },
    { header: "order_no", key: "order_no", width: 10 },
    { header: "type", key: "type", width: 20 },
    { header: "prompt", key: "prompt", width: 80 },
    { header: "expected_answer", key: "expected_answer", width: 25 },
    { header: "blank_sentence", key: "blank_sentence", width: 80 },
    { header: "is_teacher_edited", key: "is_teacher_edited", width: 20 },
  ];

  rows.forEach((r) => ws.addRow(r));
  return wb.xlsx.writeBuffer();
}

async function importSessionWorkbook(testSessionId, buffer) {
  const session = db.prepare(`SELECT * FROM test_sessions WHERE id = ?`).get(testSessionId);
  if (!session) throw new Error("Session not found");
  if (session.started_at) throw new Error("시험 시작 후에는 수정할 수 없습니다.");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("questions") || wb.worksheets[0];
  if (!ws) throw new Error("questions 시트를 찾을 수 없습니다.");

  const update = db.prepare(
    `UPDATE test_questions
     SET type = ?, prompt = ?, expected_answer = ?, blank_sentence = ?, is_teacher_edited = 1
     WHERE id = ? AND test_session_id = ?`
  );

  const tx = db.transaction(() => {
    ws.eachRow((row, rowNo) => {
      if (rowNo === 1) return;
      const qid = row.getCell(1).value ? String(row.getCell(1).value) : null;
      if (!qid) return;
      const type = String(row.getCell(3).value || "DIRECT_TRANSLATION");
      const prompt = String(row.getCell(4).value || "");
      const answer = String(row.getCell(5).value || "");
      const blankSentence = row.getCell(6).value ? String(row.getCell(6).value) : null;
      if (!prompt || !answer) return;
      update.run(type, prompt, answer, blankSentence, qid, testSessionId);
    });
  });

  tx();
}

function applyQuestionOverrides(testSessionId, questions) {
  const session = db.prepare(`SELECT * FROM test_sessions WHERE id = ?`).get(testSessionId);
  if (!session) throw new Error("Session not found");
  if (session.started_at) throw new Error("시험 시작 후에는 수정할 수 없습니다.");

  const update = db.prepare(
    `UPDATE test_questions
     SET type = ?, prompt = ?, expected_answer = ?, blank_sentence = ?, is_teacher_edited = 1
     WHERE id = ? AND test_session_id = ?`
  );

  const tx = db.transaction(() => {
    for (const q of questions) {
      update.run(
        q.type || "DIRECT_TRANSLATION",
        q.prompt,
        q.expectedAnswer,
        q.blankSentence || null,
        q.id,
        testSessionId
      );
    }
  });

  tx();
}

function getSessionQuestions(testSessionId) {
  return db.prepare(
    `SELECT id, order_no, type, prompt, expected_answer, blank_sentence, is_teacher_edited
     FROM test_questions WHERE test_session_id = ? ORDER BY order_no ASC`
  ).all(testSessionId);
}

module.exports = {
  generateTestForAssignment,
  createSupplementalAssignmentFromSession,
  exportSessionWorkbook,
  importSessionWorkbook,
  applyQuestionOverrides,
  getSessionQuestions,
};
