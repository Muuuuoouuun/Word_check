const db = require("../db");
const { uid, nowIso } = require("../utils");

const SETTING_DEFS = {
  default_assignment_due_hours: {
    type: "number",
    defaultValue: 2,
    label: "기본 과제 마감 시간",
    description: "새 과제를 만들 때 기본 마감 시간을 몇 시간 뒤로 잡을지 정합니다.",
    min: 1,
  },
  adaptive_learning_enabled: {
    type: "boolean",
    defaultValue: true,
    label: "적응형 단어 선택",
    description: "오답, 복습 예정일, 숙련도, 미노출 단어를 섞어 시험 단어를 자동 선별합니다.",
  },
  supplement_min_wrong: {
    type: "number",
    defaultValue: 1,
    label: "보충 생성 최소 오답 수",
    description: "학생 제출 후 이 개수 이상 틀리면 보충 과제를 자동 생성합니다.",
    min: 1,
  },
  supplement_max_questions: {
    type: "number",
    defaultValue: 10,
    label: "보충 문제 최대 수",
    description: "자동 생성되는 보충 과제의 최대 문항 수입니다.",
    min: 1,
  },
  supplement_due_hours: {
    type: "number",
    defaultValue: 24,
    label: "보충 과제 마감 시간",
    description: "보충 과제 생성 후 마감까지 허용할 시간입니다.",
    min: 1,
  },
  notify_student_on_publish: {
    type: "boolean",
    defaultValue: true,
    label: "학생 배정 알림",
    description: "과제가 게시되면 학생에게 시작 알림을 보냅니다.",
  },
  notify_student_on_reminder: {
    type: "boolean",
    defaultValue: true,
    label: "학생 미완료 리마인드",
    description: "마감 뒤 아직 제출하지 않은 학생에게 리마인드 알림을 보냅니다.",
  },
  student_reminder_delay_minutes: {
    type: "number",
    defaultValue: 0,
    label: "미완료 확정 지연(분)",
    description: "마감 후 몇 분이 지나면 미완료 처리와 보고를 진행할지 정합니다.",
    min: 0,
  },
  notify_parent_on_completed: {
    type: "boolean",
    defaultValue: true,
    label: "학부모 완료 보고",
    description: "학생이 시험을 완료하면 점수 보고를 학부모에게 보냅니다.",
  },
  notify_parent_on_missed: {
    type: "boolean",
    defaultValue: true,
    label: "학부모 미완료 보고",
    description: "학생이 마감까지 제출하지 않으면 학부모에게 보고를 보냅니다.",
  },
  default_preview_enabled: {
    type: "boolean",
    defaultValue: false,
    label: "시험 전 미리보기 기본값",
    description: "새 과제를 만들 때 시험 전 미리보기를 기본으로 켜 둘지 정합니다.",
  },
  default_preview_duration_sec: {
    type: "number",
    defaultValue: 60,
    label: "미리보기 기본 시간(초)",
    description: "미리보기가 켜진 과제에서 시험 시작 전 기다리는 기본 시간입니다.",
    min: 0,
  },
  default_preview_scope: {
    type: "string",
    defaultValue: "ALL",
    label: "미리보기 범위",
    description: "미리보기 카드에 어떤 단어를 먼저 보여줄지 정합니다.",
    options: [
      { value: "ALL", label: "전체 단어" },
      { value: "KEYWORDS", label: "핵심 단어 5개" },
      { value: "WRONG_ONLY", label: "지난 오답 우선" },
    ],
  },
  default_gamification_enabled: {
    type: "boolean",
    defaultValue: true,
    label: "게이밍 요소 기본값",
    description: "경험치, 연속 학습, 배지 보상을 과제에 표시할지 정합니다.",
  },
};

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on"].includes(text);
}

function parseValue(type, rawValue) {
  if (type === "number") {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (type === "boolean") {
    return normalizeBoolean(rawValue);
  }

  return rawValue == null ? "" : String(rawValue);
}

function serializeValue(type, value) {
  if (type === "number") {
    return String(Number(value));
  }

  if (type === "boolean") {
    return normalizeBoolean(value) ? "1" : "0";
  }

  return String(value == null ? "" : value);
}

function getDefaultSettings() {
  const values = {};
  for (const [key, definition] of Object.entries(SETTING_DEFS)) {
    values[key] = definition.defaultValue;
  }
  return values;
}

function getSettingsRows({ scope = "TEACHER", ownerTeacherId = null } = {}) {
  if (scope === "GLOBAL") {
    return db
      .prepare(
        `SELECT setting_key, setting_value, value_type
         FROM app_settings
         WHERE scope = 'GLOBAL'
         ORDER BY setting_key ASC`
      )
      .all();
  }

  if (!ownerTeacherId) {
    return [];
  }

  return db
    .prepare(
      `SELECT setting_key, setting_value, value_type
       FROM app_settings
       WHERE scope = 'TEACHER' AND owner_teacher_id = ?
       ORDER BY setting_key ASC`
    )
    .all(ownerTeacherId);
}

function getResolvedSettings({ ownerTeacherId = null } = {}) {
  const values = getDefaultSettings();

  for (const row of getSettingsRows({ scope: "GLOBAL" })) {
    const definition = SETTING_DEFS[row.setting_key];
    if (!definition) continue;
    values[row.setting_key] = parseValue(definition.type, row.setting_value);
  }

  for (const row of getSettingsRows({ scope: "TEACHER", ownerTeacherId })) {
    const definition = SETTING_DEFS[row.setting_key];
    if (!definition) continue;
    values[row.setting_key] = parseValue(definition.type, row.setting_value);
  }

  return values;
}

function upsertTeacherSettings({ ownerTeacherId, settings, updatedByUserId = null }) {
  if (!ownerTeacherId) {
    throw new Error("ownerTeacherId가 필요합니다.");
  }

  if (!settings || typeof settings !== "object") {
    throw new Error("settings 객체가 필요합니다.");
  }

  const knownKeys = Object.keys(settings).filter((key) => Object.prototype.hasOwnProperty.call(SETTING_DEFS, key));
  if (knownKeys.length === 0) {
    throw new Error("저장할 설정 값이 없습니다.");
  }

  const upsert = db.prepare(
    `INSERT INTO app_settings
       (id, scope, owner_teacher_id, setting_key, setting_value, value_type, updated_by_user_id, updated_at)
     VALUES (?, 'TEACHER', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope, owner_teacher_id, setting_key)
     DO UPDATE SET
       setting_value = excluded.setting_value,
       value_type = excluded.value_type,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = excluded.updated_at`
  );

  const tx = db.transaction(() => {
    for (const key of knownKeys) {
      const definition = SETTING_DEFS[key];
      const serialized = serializeValue(definition.type, settings[key]);
      upsert.run(uid(), ownerTeacherId, key, serialized, definition.type, updatedByUserId, nowIso());
    }
  });

  tx();
  return getResolvedSettings({ ownerTeacherId });
}

function getSettingDefinitions() {
  const defs = {};

  for (const [key, definition] of Object.entries(SETTING_DEFS)) {
    defs[key] = {
      label: definition.label,
      description: definition.description,
      type: definition.type,
      min: definition.min ?? null,
      options: definition.options ?? null,
    };
  }

  return defs;
}

module.exports = {
  SETTING_DEFS,
  getDefaultSettings,
  getResolvedSettings,
  upsertTeacherSettings,
  getSettingDefinitions,
};
