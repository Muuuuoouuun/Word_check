const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { uid, nowIso } = require("../utils");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      studentId: user.student_id,
      parentId: user.parent_id,
      teacherId: user.teacher_id,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function getAuthPayload(user) {
  return {
    role: user.role,
    studentId: user.student_id || null,
    teacherId: user.teacher_id || null,
    parentId: user.parent_id || null,
  };
}

function createSession(userId, deviceId) {
  const sessionId = uid();
  const refreshHash = uid();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  db.prepare(
    `INSERT INTO auth_sessions (id, user_id, device_id, refresh_token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sessionId, userId, deviceId, refreshHash, expires, nowIso());
  return { sessionId, refreshHash, expires };
}

function ensureDevice(deviceFingerprint, pushToken) {
  if (!deviceFingerprint) {
    throw new Error("deviceFingerprint이 필요합니다.");
  }

  let device = db.prepare(`SELECT * FROM devices WHERE fingerprint = ?`).get(deviceFingerprint);
  if (!device) {
    const newDeviceId = uid();
    db.prepare(`INSERT INTO devices (id, fingerprint, push_token) VALUES (?, ?, ?)`).run(newDeviceId, deviceFingerprint, pushToken || null);
    device = db.prepare(`SELECT * FROM devices WHERE id = ?`).get(newDeviceId);
  } else if (pushToken) {
    db.prepare(`UPDATE devices SET push_token = ? WHERE id = ?`).run(pushToken, device.id);
    device = { ...device, push_token: pushToken };
  }

  return device;
}

function attachStudentDevice(user, deviceId) {
  if (user.role !== "STUDENT" || !user.student_id || !deviceId) return;

  db.prepare(
    `INSERT OR IGNORE INTO student_devices (id, student_id, device_id, is_primary, assigned_at)
     VALUES (?, ?, ?, 1, ?)`
  ).run(uid(), user.student_id, deviceId, nowIso());
}

function issueAuthForUser(user, { deviceFingerprint, pushToken } = {}) {
  const device = ensureDevice(deviceFingerprint, pushToken);
  attachStudentDevice(user, device.id);
  createSession(user.id, device.id);

  return {
    accessToken: createToken(user),
    ...getAuthPayload(user),
  };
}

module.exports = {
  createToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  createSession,
  getAuthPayload,
  issueAuthForUser,
};
