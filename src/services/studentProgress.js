const db = require("../db");
const { uid, nowIso } = require("../utils");
const { getStudentLearningSummary } = require("./learningEngine");

const BADGE_LIBRARY = {
  FIRST_3_DAYS: {
    title: "3-Day Streak",
    description: "3일 연속으로 학습을 이어갔어요.",
  },
  WRONG_ANSWER_RECOVERER: {
    title: "Recovery Note",
    description: "오답 복습을 끝까지 마무리했어요.",
  },
  WEEKLY_FINISHER: {
    title: "Weekly Finisher",
    description: "최근 7일 동안 5회 이상 시험을 완료했어요.",
  },
  SUPPLEMENT_CLEARED: {
    title: "Supplement Cleared",
    description: "보충 시험까지 완료해서 회복 루프를 닫았어요.",
  },
};

function levelForXp(totalXp) {
  return Math.max(1, Math.floor(Math.max(0, Number(totalXp || 0)) / 40) + 1);
}

function dateKey(value) {
  return String(value || nowIso()).slice(0, 10);
}

function dayDiff(leftDateText, rightDateText) {
  const left = new Date(`${leftDateText}T00:00:00Z`);
  const right = new Date(`${rightDateText}T00:00:00Z`);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return null;
  return Math.round((right.getTime() - left.getTime()) / (24 * 60 * 60 * 1000));
}

function ensureGameProfile(studentId) {
  let profile = db.prepare(`SELECT * FROM student_game_profiles WHERE student_id = ?`).get(studentId);
  if (profile) return profile;

  db.prepare(
    `INSERT OR IGNORE INTO student_game_profiles
     (id, student_id, current_streak, longest_streak, total_xp, level, last_activity_date, updated_at)
     VALUES (?, ?, 0, 0, 0, 1, NULL, ?)`
  ).run(uid(), studentId, nowIso());

  profile = db.prepare(`SELECT * FROM student_game_profiles WHERE student_id = ?`).get(studentId);
  return profile;
}

function getRecentBadges(studentId, limit = 4) {
  return db
    .prepare(
      `SELECT badge_code, badge_title, badge_description, granted_at
       FROM student_badge_grants
       WHERE student_id = ?
       ORDER BY granted_at DESC
       LIMIT ?`
    )
    .all(studentId, limit);
}

function getGameProfileSummary(studentId, profileRow = null) {
  const profile = profileRow || ensureGameProfile(studentId);
  return {
    currentStreak: Number(profile.current_streak || 0),
    longestStreak: Number(profile.longest_streak || 0),
    totalXp: Number(profile.total_xp || 0),
    level: Number(profile.level || levelForXp(profile.total_xp)),
    lastActivityDate: profile.last_activity_date || null,
    recentBadges: getRecentBadges(studentId),
  };
}

function awardXp({ studentId, eventType, sourceType = null, sourceId = null, xpDelta = 0, payload = null }) {
  const profile = ensureGameProfile(studentId);
  const normalizedXp = Number(xpDelta || 0);
  const nextTotalXp = Number(profile.total_xp || 0) + normalizedXp;
  const awardedAt = nowIso();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO student_xp_events
       (id, student_id, event_type, source_type, source_id, xp_delta, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uid(), studentId, eventType, sourceType, sourceId, normalizedXp, payload ? JSON.stringify(payload) : null, awardedAt);

    db.prepare(
      `UPDATE student_game_profiles
       SET total_xp = ?,
           level = ?,
           updated_at = ?
       WHERE student_id = ?`
    ).run(nextTotalXp, levelForXp(nextTotalXp), awardedAt, studentId);
  });

  tx();
  return getGameProfileSummary(studentId);
}

function grantBadge(studentId, badgeCode) {
  const badge = BADGE_LIBRARY[badgeCode];
  if (!badge) return null;

  const existing = db
    .prepare(`SELECT badge_code, badge_title, badge_description, granted_at FROM student_badge_grants WHERE student_id = ? AND badge_code = ?`)
    .get(studentId, badgeCode);
  if (existing) {
    return null;
  }

  const grantedAt = nowIso();
  db.prepare(
    `INSERT INTO student_badge_grants
     (id, student_id, badge_code, badge_title, badge_description, granted_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(uid(), studentId, badgeCode, badge.title, badge.description, grantedAt);

  return {
    badge_code: badgeCode,
    badge_title: badge.title,
    badge_description: badge.description,
    granted_at: grantedAt,
  };
}

function recordDailyStudy(studentId, activityAt = nowIso()) {
  const profile = ensureGameProfile(studentId);
  const todayKey = dateKey(activityAt);

  if (profile.last_activity_date === todayKey) {
    return profile;
  }

  let nextStreak = 1;
  if (profile.last_activity_date) {
    const diff = dayDiff(profile.last_activity_date, todayKey);
    nextStreak = diff === 1 ? Number(profile.current_streak || 0) + 1 : 1;
  }

  const longest = Math.max(nextStreak, Number(profile.longest_streak || 0));
  const updatedAt = nowIso();
  db.prepare(
    `UPDATE student_game_profiles
     SET current_streak = ?,
         longest_streak = ?,
         last_activity_date = ?,
         updated_at = ?
     WHERE student_id = ?`
  ).run(nextStreak, longest, todayKey, updatedAt, studentId);

  return {
    ...profile,
    current_streak: nextStreak,
    longest_streak: longest,
    last_activity_date: todayKey,
    updated_at: updatedAt,
  };
}

function completedSessionsInLastDays(studentId, days = 7) {
  const safeDays = Math.max(1, Number(days || 7));
  const cutoffIso = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  return db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM test_sessions
       WHERE student_id = ?
         AND status = 'COMPLETED'
         AND completed_at >= ?`
    )
    .get(studentId, cutoffIso).count;
}

function applyExamCompletionRewards({ studentId, sessionId, assignmentKind = "REGULAR", gamificationEnabled = true, completedAt = nowIso() }) {
  if (!gamificationEnabled) {
    return {
      profile: getGameProfileSummary(studentId),
      earnedXp: 0,
      newlyGrantedBadges: [],
    };
  }

  const newlyGrantedBadges = [];
  recordDailyStudy(studentId, completedAt);

  const earnedXp = assignmentKind === "SUPPLEMENT" ? 12 : 10;
  const eventType = assignmentKind === "SUPPLEMENT" ? "SUPPLEMENT_COMPLETED" : "EXAM_COMPLETED";
  const profile = awardXp({
    studentId,
    eventType,
    sourceType: "test_session",
    sourceId: sessionId,
    xpDelta: earnedXp,
    payload: { assignmentKind },
  });

  if (profile.currentStreak >= 3) {
    const badge = grantBadge(studentId, "FIRST_3_DAYS");
    if (badge) newlyGrantedBadges.push(badge);
  }

  if (completedSessionsInLastDays(studentId, 7) >= 5) {
    const badge = grantBadge(studentId, "WEEKLY_FINISHER");
    if (badge) newlyGrantedBadges.push(badge);
  }

  if (assignmentKind === "SUPPLEMENT") {
    const badge = grantBadge(studentId, "SUPPLEMENT_CLEARED");
    if (badge) newlyGrantedBadges.push(badge);
  }

  return {
    profile: newlyGrantedBadges.length > 0 ? getGameProfileSummary(studentId) : profile,
    earnedXp,
    newlyGrantedBadges,
  };
}

function createReviewSetFromWrongItems({ studentId, assignmentId, sourceSessionId, wrongItems = [] }) {
  if (!Array.isArray(wrongItems) || wrongItems.length === 0) return null;

  const existing = db
    .prepare(`SELECT id FROM review_sets WHERE source_session_id = ?`)
    .get(sourceSessionId);

  if (existing) {
    return getReviewSet(existing.id, studentId);
  }

  const reviewSetId = uid();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO review_sets
       (id, student_id, assignment_id, source_session_id, status, item_count, recovered_count, created_at)
       VALUES (?, ?, ?, ?, 'OPEN', ?, 0, ?)`
    ).run(reviewSetId, studentId, assignmentId, sourceSessionId, wrongItems.length, nowIso());

    const insertItem = db.prepare(
      `INSERT INTO review_set_items
       (id, review_set_id, question_id, vocab_item_id, prompt, blank_sentence, meaning_primary, expected_answer, response, order_no, is_recovered, recovered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`
    );

    wrongItems.forEach((item, index) => {
      insertItem.run(
        uid(),
        reviewSetId,
        item.questionId,
        item.vocabItemId,
        item.prompt,
        item.blankSentence || null,
        item.meaningPrimary || null,
        item.expectedAnswer,
        item.response || "",
        index + 1
      );
    });
  });

  tx();
  return getReviewSet(reviewSetId, studentId);
}

function getReviewSet(reviewSetId, studentId) {
  const reviewSet = db
    .prepare(
      `SELECT rs.*, ha.gamification_enabled, ha.assignment_kind, vs.name AS source_name
       FROM review_sets rs
       JOIN homework_assignments ha ON ha.id = rs.assignment_id
       JOIN vocab_sources vs ON vs.id = ha.source_id
       WHERE rs.id = ? AND rs.student_id = ?`
    )
    .get(reviewSetId, studentId);

  if (!reviewSet) return null;

  const items = db
    .prepare(
      `SELECT id, question_id, vocab_item_id, prompt, blank_sentence, meaning_primary, expected_answer, response, order_no, is_recovered, recovered_at
       FROM review_set_items
       WHERE review_set_id = ?
       ORDER BY order_no ASC`
    )
    .all(reviewSetId)
    .map((item) => ({
      id: item.id,
      questionId: item.question_id,
      vocabItemId: item.vocab_item_id,
      prompt: item.prompt,
      blankSentence: item.blank_sentence,
      meaningPrimary: item.meaning_primary,
      expectedAnswer: item.expected_answer,
      response: item.response,
      orderNo: item.order_no,
      isRecovered: Boolean(item.is_recovered),
      recoveredAt: item.recovered_at,
    }));

  return {
    id: reviewSet.id,
    assignmentId: reviewSet.assignment_id,
    sourceSessionId: reviewSet.source_session_id,
    status: reviewSet.status,
    itemCount: Number(reviewSet.item_count || items.length),
    recoveredCount: Number(reviewSet.recovered_count || 0),
    createdAt: reviewSet.created_at,
    completedAt: reviewSet.completed_at,
    gamificationEnabled: Boolean(reviewSet.gamification_enabled),
    assignmentKind: reviewSet.assignment_kind,
    sourceName: reviewSet.source_name,
    items,
  };
}

function getLatestOpenReviewSet(studentId) {
  const row = db
    .prepare(
      `SELECT rs.id
       FROM review_sets rs
       WHERE rs.student_id = ?
         AND rs.status = 'OPEN'
       ORDER BY rs.created_at DESC
       LIMIT 1`
    )
    .get(studentId);

  if (!row) return null;
  return getReviewSet(row.id, studentId);
}

function completeReviewSet(reviewSetId, studentId) {
  const current = getReviewSet(reviewSetId, studentId);
  if (!current) {
    throw new Error("오답 복습 세트를 찾을 수 없습니다.");
  }

  if (current.status === "COMPLETED") {
    return {
      reviewSet: current,
      rewards: {
        profile: getGameProfileSummary(studentId),
        earnedXp: 0,
        newlyGrantedBadges: [],
      },
    };
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE review_sets
       SET status = 'COMPLETED',
           recovered_count = item_count,
           completed_at = ?
       WHERE id = ? AND student_id = ?`
    ).run(nowIso(), reviewSetId, studentId);

    db.prepare(
      `UPDATE review_set_items
       SET is_recovered = 1,
           recovered_at = COALESCE(recovered_at, ?)
       WHERE review_set_id = ?`
    ).run(nowIso(), reviewSetId);
  });

  tx();

  const rewards = current.gamificationEnabled
    ? (() => {
        const earnedXp = 8;
        const profile = awardXp({
          studentId,
          eventType: "REVIEW_COMPLETED",
          sourceType: "review_set",
          sourceId: reviewSetId,
          xpDelta: earnedXp,
          payload: { itemCount: current.itemCount },
        });
        const newlyGrantedBadges = [];
        if (current.itemCount >= 3) {
          const badge = grantBadge(studentId, "WRONG_ANSWER_RECOVERER");
          if (badge) newlyGrantedBadges.push(badge);
        }
        return {
          profile: newlyGrantedBadges.length > 0 ? getGameProfileSummary(studentId) : profile,
          earnedXp,
          newlyGrantedBadges,
        };
      })()
    : {
        profile: getGameProfileSummary(studentId),
        earnedXp: 0,
        newlyGrantedBadges: [],
      };

  return {
    reviewSet: getReviewSet(reviewSetId, studentId),
    rewards,
  };
}

function getRecentGrowth(studentId) {
  const recentSessions = db
    .prepare(
      `SELECT ts.score, ts.completed_at, vs.name AS source_name
       FROM test_sessions ts
       JOIN homework_assignments ha ON ha.id = ts.assignment_id
       JOIN vocab_sources vs ON vs.id = ha.source_id
       WHERE ts.student_id = ?
         AND ts.status = 'COMPLETED'
       ORDER BY ts.completed_at DESC
       LIMIT 2`
    )
    .all(studentId);

  const openReviewCount = db
    .prepare(`SELECT COUNT(*) AS count FROM review_sets WHERE student_id = ? AND status = 'OPEN'`)
    .get(studentId).count;

  if (recentSessions.length === 0) {
    return {
      message: "첫 시험을 마치면 여기서 성장 흐름을 볼 수 있어요.",
      delta: null,
      trend: "neutral",
      openReviewCount,
    };
  }

  if (recentSessions.length === 1) {
    return {
      message: "첫 결과가 기록됐어요. 오답 복습까지 하면 루틴이 완성됩니다.",
      delta: null,
      trend: "up",
      openReviewCount,
    };
  }

  const delta = Number(recentSessions[0].score || 0) - Number(recentSessions[1].score || 0);
  if (delta > 0) {
    return {
      message: `지난 시험보다 ${delta}점 올랐어요.`,
      delta,
      trend: "up",
      openReviewCount,
    };
  }

  if (delta < 0) {
    return {
      message: `지난 시험보다 ${Math.abs(delta)}점 내려갔어요. 오답 복습으로 바로 회복해봐요.`,
      delta,
      trend: "down",
      openReviewCount,
    };
  }

  return {
    message: "지난 시험과 비슷한 흐름을 유지하고 있어요.",
    delta: 0,
    trend: "steady",
    openReviewCount,
  };
}

function buildStudentDashboard(studentId) {
  const items = db
    .prepare(
      `SELECT ha.*, vs.name AS source_name,
              ts.id AS test_session_id,
              ts.status AS test_session_status,
              ts.score,
              ts.started_at,
              ts.completed_at,
              ts.preview_started_at,
              ts.preview_completed_at
       FROM homework_assignments ha
       JOIN vocab_sources vs ON vs.id = ha.source_id
       LEFT JOIN test_sessions ts ON ts.assignment_id = ha.id
       WHERE ha.student_id = ?
         AND ha.status != 'CANCELED'
       ORDER BY
         CASE
           WHEN ha.status IN ('PUBLISHED','IN_PROGRESS') THEN 0
           WHEN ha.status = 'SCHEDULED' THEN 1
           WHEN ha.status = 'MISSED' THEN 2
           WHEN ha.status = 'COMPLETED' THEN 3
           ELSE 4
         END,
         ha.due_at ASC,
         ha.created_at DESC
       LIMIT 16`
    )
    .all(studentId);

  return {
    items,
    reviewTask: getLatestOpenReviewSet(studentId),
    gameProfile: getGameProfileSummary(studentId),
    learningSummary: getStudentLearningSummary(studentId),
    recentGrowth: getRecentGrowth(studentId),
  };
}

module.exports = {
  applyExamCompletionRewards,
  buildStudentDashboard,
  completeReviewSet,
  createReviewSetFromWrongItems,
  getGameProfileSummary,
  getLatestOpenReviewSet,
  getRecentGrowth,
  getReviewSet,
};
