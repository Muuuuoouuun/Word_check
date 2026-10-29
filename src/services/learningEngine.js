const db = require("../db");
const { uid, nowIso, hashSeed, mulberry32 } = require("../utils");

const MIN_EASE = 1.3;
const MAX_EASE = 2.8;
const MAX_INTERVAL_DAYS = 30;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toSafeDate(value) {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function addHours(value, hours) {
  const date = toSafeDate(value);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function addDays(value, days) {
  const date = toSafeDate(value);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function normalizeAnswer(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,!?;:"'`()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^to\s+/, "")
    .replace(/^(a|an|the)\s+/, "");
}

function isAnswerCorrect(response, expectedAnswer) {
  const user = normalizeAnswer(response);
  const expected = normalizeAnswer(expectedAnswer);
  if (!expected) return false;
  return user === expected;
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

function scoreWord(row, nowMs, rng) {
  const exposureCount = Number(row.exposure_count || 0);
  const wrongCount = Number(row.wrong_count || 0);
  const lapseCount = Number(row.lapse_count || 0);
  const masteryScore = Number(row.mastery_score || 0);
  const currentStreak = Number(row.current_streak || 0);
  const nextReviewMs = row.next_review_at ? new Date(row.next_review_at).getTime() : null;
  const due = Number.isFinite(nextReviewMs) && nextReviewMs <= nowMs;
  const overdueHours = due ? clamp((nowMs - nextReviewMs) / (60 * 60 * 1000), 0, 48) : 0;
  const unseenBoost = exposureCount === 0 ? 44 : 0;
  const reviewBoost = due ? 90 + overdueHours : 0;
  const weakBoost = (100 - masteryScore) * 0.55;
  const errorBoost = wrongCount * 13 + lapseCount * 8;
  const streakPenalty = currentStreak * 2;

  return reviewBoost + unseenBoost + weakBoost + errorBoost - streakPenalty + rng() * 8;
}

function takeUnique(target, candidates, count, pickedIds) {
  for (const item of candidates) {
    if (target.length >= count) break;
    if (pickedIds.has(item.word.id)) continue;
    pickedIds.add(item.word.id);
    target.push(item.word);
  }
}

function selectAdaptiveWords({
  studentId,
  sourceId,
  rangeStartLesson,
  rangeEndLesson,
  questionCount,
  seedText,
  enabled = true,
}) {
  const words = db
    .prepare(
      `SELECT vi.*, COALESCE(vl.lesson_no, 0) AS lesson_no,
              svs.exposure_count,
              svs.correct_count,
              svs.wrong_count,
              svs.current_streak,
              svs.mastery_score,
              svs.ease_factor,
              svs.interval_days,
              svs.lapse_count,
              svs.last_seen_at,
              svs.next_review_at,
              svs.last_result
       FROM vocab_items vi
       JOIN vocab_lessons vl ON vl.id = vi.lesson_id
       LEFT JOIN student_vocab_stats svs
         ON svs.vocab_item_id = vi.id
        AND svs.student_id = ?
       WHERE vi.source_id = ?
         AND vl.lesson_no BETWEEN ? AND ?`
    )
    .all(studentId, sourceId, Number(rangeStartLesson), Number(rangeEndLesson));

  const count = Math.max(1, Math.min(Number(questionCount || 1), words.length));
  const rng = mulberry32(hashSeed(seedText || `${studentId}:${sourceId}:${nowIso()}`));

  if (!enabled || !studentId) {
    return {
      words: sampleWithoutReplacement(words, count, rng),
      plan: {
        mode: "random",
        dueCount: 0,
        weakCount: 0,
        newCount: 0,
      },
    };
  }

  const nowMs = Date.now();
  const ranked = words
    .map((word) => ({
      word,
      score: scoreWord(word, nowMs, rng),
      exposureCount: Number(word.exposure_count || 0),
      masteryScore: Number(word.mastery_score || 0),
      wrongCount: Number(word.wrong_count || 0),
      due:
        word.next_review_at &&
        !Number.isNaN(new Date(word.next_review_at).getTime()) &&
        new Date(word.next_review_at).getTime() <= nowMs,
    }))
    .sort((left, right) => right.score - left.score);

  const dueOrWeak = ranked.filter((item) => item.due || item.masteryScore < 70 || item.wrongCount > 0);
  const unseen = ranked.filter((item) => item.exposureCount === 0);
  const selected = [];
  const pickedIds = new Set();

  takeUnique(selected, dueOrWeak, Math.ceil(count * 0.55), pickedIds);
  takeUnique(selected, unseen, Math.ceil(count * 0.85), pickedIds);
  takeUnique(selected, ranked, count, pickedIds);

  return {
    words: selected,
    plan: {
      mode: "adaptive",
      dueCount: selected.filter((word) => {
        if (!word.next_review_at) return false;
        const reviewMs = new Date(word.next_review_at).getTime();
        return Number.isFinite(reviewMs) && reviewMs <= nowMs;
      }).length,
      weakCount: selected.filter((word) => Number(word.mastery_score || 0) < 70 && Number(word.exposure_count || 0) > 0).length,
      newCount: selected.filter((word) => Number(word.exposure_count || 0) === 0).length,
    },
  };
}

function recordVocabularyAnswer({ studentId, vocabItemId, isCorrect, answeredAt = nowIso() }) {
  if (!studentId || !vocabItemId) return null;

  const existing = db
    .prepare(`SELECT * FROM student_vocab_stats WHERE student_id = ? AND vocab_item_id = ?`)
    .get(studentId, vocabItemId);

  const exposureCount = Number(existing?.exposure_count || 0) + 1;
  const correctCount = Number(existing?.correct_count || 0) + (isCorrect ? 1 : 0);
  const wrongCount = Number(existing?.wrong_count || 0) + (isCorrect ? 0 : 1);
  const lapseCount = Number(existing?.lapse_count || 0) + (isCorrect ? 0 : 1);
  const previousStreak = Number(existing?.current_streak || 0);
  const currentStreak = isCorrect ? previousStreak + 1 : 0;
  const previousMastery = Number(existing?.mastery_score || 0);
  const previousEase = Number(existing?.ease_factor || 2.0);
  const previousInterval = Number(existing?.interval_days || 0);
  const easeFactor = isCorrect ? clamp(previousEase + 0.08, MIN_EASE, MAX_EASE) : clamp(previousEase - 0.2, MIN_EASE, MAX_EASE);
  const masteryDelta = isCorrect ? 18 + Math.min(currentStreak, 4) * 3 - Math.min(lapseCount, 4) : -28;
  const masteryScore = clamp(previousMastery + masteryDelta, 0, 100);
  const intervalDays = isCorrect
    ? clamp(previousInterval <= 0 ? 1 : Math.ceil(previousInterval * easeFactor), 1, MAX_INTERVAL_DAYS)
    : 0;
  const nextReviewAt = isCorrect ? addDays(answeredAt, intervalDays) : addHours(answeredAt, 6);
  const updatedAt = nowIso();

  db.prepare(
    `INSERT INTO student_vocab_stats
     (id, student_id, vocab_item_id, exposure_count, correct_count, wrong_count, current_streak,
      mastery_score, ease_factor, interval_days, lapse_count, last_seen_at, next_review_at, last_result, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id, vocab_item_id)
     DO UPDATE SET
       exposure_count = excluded.exposure_count,
       correct_count = excluded.correct_count,
       wrong_count = excluded.wrong_count,
       current_streak = excluded.current_streak,
       mastery_score = excluded.mastery_score,
       ease_factor = excluded.ease_factor,
       interval_days = excluded.interval_days,
       lapse_count = excluded.lapse_count,
       last_seen_at = excluded.last_seen_at,
       next_review_at = excluded.next_review_at,
       last_result = excluded.last_result,
       updated_at = excluded.updated_at`
  ).run(
    existing?.id || uid(),
    studentId,
    vocabItemId,
    exposureCount,
    correctCount,
    wrongCount,
    currentStreak,
    masteryScore,
    easeFactor,
    intervalDays,
    lapseCount,
    answeredAt,
    nextReviewAt,
    isCorrect ? "CORRECT" : "WRONG",
    updatedAt
  );

  return db.prepare(`SELECT * FROM student_vocab_stats WHERE student_id = ? AND vocab_item_id = ?`).get(studentId, vocabItemId);
}

function learningMessage({ trackedCount, dueNow, weakCount, avgMastery }) {
  if (trackedCount === 0) {
    return "첫 시험을 마치면 단어별 숙련도와 복습 시간이 자동으로 쌓입니다.";
  }
  if (dueNow > 0) {
    return `지금 복습하면 좋은 단어가 ${dueNow}개 있습니다. 오늘 시험에는 이 단어들이 우선 섞입니다.`;
  }
  if (weakCount > 0) {
    return `숙련도 60 미만 단어 ${weakCount}개를 먼저 회복하면 다음 점수가 안정됩니다.`;
  }
  if (avgMastery >= 80) {
    return "최근 단어 흐름이 안정적입니다. 새 단어 비중을 조금 늘려도 좋습니다.";
  }
  return "새 단어와 약한 단어를 섞어 부담 없이 끌어올리는 구간입니다.";
}

function getStudentLearningSummary(studentId) {
  const now = nowIso();
  const aggregate = db
    .prepare(
      `SELECT COUNT(*) AS tracked_count,
              COALESCE(ROUND(AVG(mastery_score)), 0) AS avg_mastery,
              SUM(CASE WHEN next_review_at IS NOT NULL AND next_review_at <= ? THEN 1 ELSE 0 END) AS due_now,
              SUM(CASE WHEN mastery_score < 60 AND exposure_count > 0 THEN 1 ELSE 0 END) AS weak_count
       FROM student_vocab_stats
       WHERE student_id = ?`
    )
    .get(now, studentId);

  const weakWords = db
    .prepare(
      `SELECT vi.lemma, vi.meaning_primary, svs.mastery_score, svs.wrong_count, svs.next_review_at, svs.last_result
       FROM student_vocab_stats svs
       JOIN vocab_items vi ON vi.id = svs.vocab_item_id
       WHERE svs.student_id = ?
         AND (svs.mastery_score < 75 OR svs.next_review_at <= ? OR svs.last_result = 'WRONG')
       ORDER BY
         CASE WHEN svs.next_review_at <= ? THEN 0 ELSE 1 END,
         svs.mastery_score ASC,
         svs.wrong_count DESC,
         svs.updated_at DESC
       LIMIT 5`
    )
    .all(studentId, now, now);

  const trackedCount = Number(aggregate.tracked_count || 0);
  const avgMastery = Number(aggregate.avg_mastery || 0);
  const dueNow = Number(aggregate.due_now || 0);
  const weakCount = Number(aggregate.weak_count || 0);

  return {
    trackedCount,
    avgMastery,
    dueNow,
    weakCount,
    weakWords: weakWords.map((word) => ({
      lemma: word.lemma,
      meaning: word.meaning_primary,
      masteryScore: Number(word.mastery_score || 0),
      wrongCount: Number(word.wrong_count || 0),
      nextReviewAt: word.next_review_at,
      lastResult: word.last_result,
    })),
    message: learningMessage({ trackedCount, dueNow, weakCount, avgMastery }),
  };
}

function getTeacherLearningOverview({ teacherId = null } = {}) {
  const now = nowIso();
  const teacherFilter = teacherId
    ? `WHERE EXISTS (
         SELECT 1 FROM homework_assignments ha
         WHERE ha.student_id = s.id AND ha.teacher_id = ?
       )`
    : "";
  const studentParams = teacherId ? [now, teacherId] : [now];
  const studentRows = db
    .prepare(
      `SELECT s.id, s.name,
              COUNT(svs.id) AS tracked_count,
              COALESCE(ROUND(AVG(svs.mastery_score)), 0) AS avg_mastery,
              SUM(CASE WHEN svs.next_review_at IS NOT NULL AND svs.next_review_at <= ? THEN 1 ELSE 0 END) AS due_count,
              SUM(CASE WHEN svs.mastery_score < 60 AND svs.exposure_count > 0 THEN 1 ELSE 0 END) AS weak_count,
              SUM(CASE WHEN svs.last_result = 'WRONG' THEN 1 ELSE 0 END) AS last_wrong_count
       FROM students s
       LEFT JOIN student_vocab_stats svs ON svs.student_id = s.id
       ${teacherFilter}
       GROUP BY s.id
       ORDER BY due_count DESC, weak_count DESC, avg_mastery ASC, s.name ASC
       LIMIT 8`
    )
    .all(...studentParams);

  const weakWordFilter = teacherId
    ? `AND EXISTS (
         SELECT 1 FROM homework_assignments ha
         WHERE ha.student_id = svs.student_id AND ha.teacher_id = ?
       )`
    : "";
  const weakWordParams = teacherId ? [now, teacherId] : [now];
  const weakWords = db
    .prepare(
      `SELECT s.name AS student_name, vi.lemma, vi.meaning_primary, svs.mastery_score, svs.wrong_count
       FROM student_vocab_stats svs
       JOIN students s ON s.id = svs.student_id
       JOIN vocab_items vi ON vi.id = svs.vocab_item_id
       WHERE (svs.mastery_score < 70 OR svs.next_review_at <= ? OR svs.last_result = 'WRONG')
       ${weakWordFilter}
       ORDER BY
         CASE WHEN svs.next_review_at <= ? THEN 0 ELSE 1 END,
         svs.mastery_score ASC,
         svs.wrong_count DESC,
         svs.updated_at DESC
       LIMIT 6`
    )
    .all(...weakWordParams, now);

  const activeStudents = studentRows.filter((row) => Number(row.tracked_count || 0) > 0);
  const dueCount = studentRows.reduce((sum, row) => sum + Number(row.due_count || 0), 0);
  const weakCount = studentRows.reduce((sum, row) => sum + Number(row.weak_count || 0), 0);
  const avgMastery = activeStudents.length
    ? Math.round(activeStudents.reduce((sum, row) => sum + Number(row.avg_mastery || 0), 0) / activeStudents.length)
    : 0;
  const riskStudents = studentRows
    .filter((row) => Number(row.due_count || 0) > 0 || Number(row.weak_count || 0) > 0 || (Number(row.tracked_count || 0) > 0 && Number(row.avg_mastery || 0) < 65))
    .slice(0, 5)
    .map((row) => ({
      studentId: row.id,
      name: row.name,
      avgMastery: Number(row.avg_mastery || 0),
      dueCount: Number(row.due_count || 0),
      weakCount: Number(row.weak_count || 0),
      lastWrongCount: Number(row.last_wrong_count || 0),
    }));

  return {
    trackedStudentCount: activeStudents.length,
    avgMastery,
    dueCount,
    weakCount,
    riskStudents,
    weakWords: weakWords.map((word) => ({
      studentName: word.student_name,
      lemma: word.lemma,
      meaning: word.meaning_primary,
      masteryScore: Number(word.mastery_score || 0),
      wrongCount: Number(word.wrong_count || 0),
    })),
    message:
      activeStudents.length === 0
        ? "시험 제출이 쌓이면 학생별 약점 단어와 복습 예정 단어를 자동으로 보여줍니다."
        : dueCount > 0
          ? `오늘 복습 우선 단어가 ${dueCount}개 있습니다. 생성되는 시험에는 이 단어가 먼저 섞입니다.`
          : "현재 복습 대기 단어는 안정적입니다. 약점 단어만 짧게 확인하면 됩니다.",
  };
}

module.exports = {
  getStudentLearningSummary,
  getTeacherLearningOverview,
  isAnswerCorrect,
  normalizeAnswer,
  recordVocabularyAnswer,
  selectAdaptiveWords,
};
