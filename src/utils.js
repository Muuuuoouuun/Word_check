const crypto = require("crypto");

function uid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function hashSeed(input) {
  const hex = crypto.createHash("sha256").update(input).digest("hex");
  return Number.parseInt(hex.slice(0, 8), 16);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = {
  uid,
  nowIso,
  hashSeed,
  mulberry32,
};
