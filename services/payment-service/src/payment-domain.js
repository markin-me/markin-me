"use strict";

const PAYMENT_TRANSITIONS = Object.freeze({
  created: Object.freeze(["pending", "waiting_for_confirmation", "paid", "cancelled", "failed"]),
  pending: Object.freeze(["waiting_for_confirmation", "paid", "cancelled", "failed"]),
  waiting_for_confirmation: Object.freeze(["paid", "cancelled", "failed"]),
  paid: Object.freeze(["partially_refunded", "refunded"]),
  partially_refunded: Object.freeze(["partially_refunded", "refunded"]),
  refunded: Object.freeze([]), cancelled: Object.freeze([]), failed: Object.freeze([]),
});
const REFUND_TRANSITIONS = Object.freeze({
  created: Object.freeze(["pending", "succeeded", "failed", "cancelled"]),
  pending: Object.freeze(["succeeded", "failed", "cancelled"]),
  succeeded: Object.freeze([]), failed: Object.freeze([]), cancelled: Object.freeze([]),
});
const ERROR_CODES = Object.freeze([
  "PAYMENT_INVALID_STATE", "PAYMENT_NOT_FOUND", "PAYMENT_AMOUNT_INVALID", "PAYMENT_ALREADY_PAID",
  "PAYMENT_PROVIDER_UNAVAILABLE", "PAYMENT_PROVIDER_AUTH_FAILED", "PAYMENT_PROVIDER_REQUEST_FAILED",
  "PAYMENT_REFUND_EXCEEDS_AVAILABLE_AMOUNT", "PAYMENT_METHOD_NOT_SUPPORTED",
  "PAYMENT_INPUT_INVALID", "PAYMENT_IDEMPOTENCY_CONFLICT", "PAYMENT_CONNECTION_INVALID",
  "PAYMENT_PROVIDER_NOT_CONFIGURED",
  "PAYMENT_PROVIDER_RECOVERY_EXPIRED", "PAYMENT_PROVIDER_NOT_FOUND",
  "PAYMENT_CONNECTION_VERSION_CONFLICT", "PAYMENT_CONNECTION_HISTORY_LOCKED", "PAYMENT_CONNECTION_STORE_CONFLICT",
  "PAYMENT_CREDENTIALS_KEY_UNAVAILABLE", "PAYMENT_CREDENTIALS_ENCRYPTION_FAILED",
  "PAYMENT_PROVIDER_TIMEOUT", "PAYMENT_PROVIDER_INVALID_RESPONSE", "PAYMENT_PROVIDER_REQUEST_INVALID",
  "PAYMENT_PROVIDER_IDENTITY_MISMATCH", "PAYMENT_PROVIDER_ACCESS_DENIED", "PAYMENT_PROVIDER_RATE_LIMITED",
  "PAYMENT_CONNECTION_NOT_OPERATIONAL", "PAYMENT_OPERATION_IN_PROGRESS", "PAYMENT_TEST_OPERATION_NOT_ALLOWED",
  "PAYMENT_PROVIDER_RECOVERY_REQUIRED", "PAYMENT_RECEIPT_CONFIGURATION_REQUIRED",
]);
class PaymentError extends Error {
  constructor(code) { super(code); this.name = "PaymentError"; this.code = code; }
}
function fail(code) { throw new PaymentError(code); }
function identifier(value) {
  const s = String(value ?? "");
  if (!/^[1-9]\d*$/.test(s) || BigInt(s) > 2147483647n) fail("PAYMENT_INPUT_INVALID");
  return s;
}
// DECIMAL(10,2) on disk and decimal strings at module boundaries. BigInt only for arithmetic.
function minor(value, allowZero = false) {
  if (typeof value !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(value)) fail("PAYMENT_AMOUNT_INVALID");
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (!allowZero && result === 0n) fail("PAYMENT_AMOUNT_INVALID");
  return result;
}
function decimal(value) { return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`; }
function amount(value, allowZero = false) { return decimal(minor(value, allowZero)); }
function currency(value) {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) fail("PAYMENT_INPUT_INVALID");
  return value;
}
function text(value, max = 64) {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value || value.length > max) fail("PAYMENT_INPUT_INVALID");
  return value;
}
function token(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(value)) fail("PAYMENT_INPUT_INVALID");
  return value;
}
function transition(machine, previous, next) {
  if (!Object.hasOwn(machine, previous) || !machine[previous].includes(next)) fail("PAYMENT_INVALID_STATE");
}
// Explicit allowlist: never persist an arbitrary provider response or arbitrary metadata strings.
function metadata(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("PAYMENT_INPUT_INVALID");
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "refund_id" || key === "actor_user_id") result[key] = identifier(value);
    else if(key==='webhook_inbox_id' && typeof value==='string' && /^[1-9][0-9]{0,19}$/.test(value))result[key]=value;
    else if(key==='recovery_operation_id' && typeof value==='string' && /^[1-9][0-9]{0,19}$/.test(value))result[key]=value;
    else if(key==='error_code' && typeof value==='string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value))result[key]=value;
    else if(key==='external_refund' && typeof value==='boolean')result[key]=value;
    else if(key==='webhook_event' && ['payment.succeeded','payment.canceled','payment.waiting_for_capture','refund.succeeded'].includes(value))result[key]=value;
    else if(key==='request_id' && typeof value==='string' && /^[0-9a-f-]{36}$/.test(value))result[key]=value;
    else if (key === "operation" && ["create", "get", "capture", "cancel", "refund"].includes(value)) result[key] = value;
    else if (["provider_status", "provider_reason_code"].includes(key) && typeof value === "string" && /^[a-z_]{1,64}$/.test(value)) result[key] = value;
    else fail("PAYMENT_INPUT_INVALID");
  }
  return JSON.stringify(result);
}
function confirmationUrl(value) {
  if (value == null) return null;
  text(value, 2048);
  let url;
  try { url = new URL(value); } catch { fail("PAYMENT_INPUT_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password) fail("PAYMENT_INPUT_INVALID");
  return value;
}
function returnUrl(value,allowLocal=false) {
  if(!allowLocal)return confirmationUrl(value);
  text(value,2048);
  let url;try{url=new URL(value);}catch{fail("PAYMENT_INPUT_INVALID");}
  if(url.username || url.password || (url.protocol!=="https:" && !(url.protocol==="http:" && ["localhost","127.0.0.1","[::1]"].includes(url.hostname))))fail("PAYMENT_INPUT_INVALID");
  return value;
}
module.exports = { PAYMENT_TRANSITIONS, REFUND_TRANSITIONS, ERROR_CODES, PaymentError, fail,
  identifier, minor, decimal, amount, currency, text, token, transition, metadata, confirmationUrl,returnUrl };
