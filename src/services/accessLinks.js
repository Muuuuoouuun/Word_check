const crypto = require("crypto");
const QRCode = require("qrcode");

const db = require("../db");
const { uid, nowIso } = require("../utils");
const { issueAuthForUser } = require("./auth");

function hashAccessToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function createRawAccessToken() {
  return crypto.randomBytes(24).toString("hex");
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function getUserById(userId) {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user) {
    throw new Error("링크 대상 사용자를 찾을 수 없습니다.");
  }
  return user;
}

async function createLoginAccessLink({
  userId,
  createdByUserId = null,
  createdByRole = null,
  label = null,
  channel = "LINK",
  metadata = null,
  expiresInMinutes = 30,
  allowReuse = false,
  baseUrl,
}) {
  const user = getUserById(userId);
  const rawToken = createRawAccessToken();
  const tokenHash = hashAccessToken(rawToken);
  const id = uid();
  const expiresAt = new Date(Date.now() + Math.max(1, Number(expiresInMinutes || 30)) * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO login_access_links
     (id, token_hash, user_id, student_id, created_by_user_id, created_by_role, label, channel, metadata, expires_at, allow_reuse, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    tokenHash,
    user.id,
    user.student_id || null,
    createdByUserId,
    createdByRole,
    label || null,
    channel,
    metadata ? JSON.stringify(metadata) : null,
    expiresAt,
    allowReuse ? 1 : 0,
    nowIso()
  );

  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const loginUrl = `${normalizedBaseUrl}/?loginToken=${encodeURIComponent(rawToken)}`;
  const qrSvg = await QRCode.toString(loginUrl, {
    type: "svg",
    margin: 1,
    color: {
      dark: "#2f6f4f",
      light: "#0000",
    },
  });

  return {
    id,
    loginUrl,
    qrSvg,
    expiresAt,
    user: {
      id: user.id,
      role: user.role,
      studentId: user.student_id || null,
      teacherId: user.teacher_id || null,
      parentId: user.parent_id || null,
    },
  };
}

function exchangeLoginAccessLink({ loginToken, deviceFingerprint, pushToken = null }) {
  if (!loginToken) {
    throw new Error("loginToken이 필요합니다.");
  }

  const row = db
    .prepare(
      `SELECT lal.*, u.id AS auth_user_id, u.role, u.email, u.password_hash, u.student_id, u.teacher_id, u.parent_id
       FROM login_access_links lal
       JOIN users u ON u.id = lal.user_id
       WHERE lal.token_hash = ?`
    )
    .get(hashAccessToken(loginToken));

  if (!row) {
    throw new Error("유효하지 않은 접속 링크입니다.");
  }
  if (row.revoked_at) {
    throw new Error("취소된 접속 링크입니다.");
  }
  if (row.expires_at <= nowIso()) {
    throw new Error("만료된 접속 링크입니다.");
  }
  if (!row.allow_reuse && row.used_at) {
    throw new Error("이미 사용된 접속 링크입니다.");
  }

  const user = {
    id: row.auth_user_id,
    role: row.role,
    email: row.email,
    password_hash: row.password_hash,
    student_id: row.student_id,
    teacher_id: row.teacher_id,
    parent_id: row.parent_id,
  };

  let authPayload = null;
  db.transaction(() => {
    if (!row.allow_reuse) {
      db.prepare(`UPDATE login_access_links SET used_at = ? WHERE id = ?`).run(nowIso(), row.id);
    } else {
      db.prepare(`UPDATE login_access_links SET used_at = COALESCE(used_at, ?) WHERE id = ?`).run(nowIso(), row.id);
    }

    authPayload = issueAuthForUser(user, {
      deviceFingerprint,
      pushToken,
    });
  })();

  return {
    ...authPayload,
    loginLinkId: row.id,
  };
}

module.exports = {
  createLoginAccessLink,
  exchangeLoginAccessLink,
};
