const crypto = require("crypto");

const ITERATIONS = 120_000;
const KEYLEN = 64;
const DIGEST = "sha512";

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(plain, salt, ITERATIONS, KEYLEN, DIGEST).toString("hex");
  return { salt, hash };
}

function verifyPassword(plain, saltHex, hashHex) {
  const derived = crypto.pbkdf2Sync(plain, saltHex, ITERATIONS, KEYLEN, DIGEST);
  const expected = Buffer.from(hashHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

module.exports = { hashPassword, verifyPassword };
