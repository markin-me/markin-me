"use strict";

const d = require("./payment-domain");
const PROVIDER_DEFINITIONS = Object.freeze([{ id: "yookassa", title: "ЮKassa", environments: ["test", "live"],
  configurationFields: ["shopId"], credentialFields: ["secretKey"], operational: false, supportsVerification: true }]);

/**
 * Provider-neutral adapter contract. All methods return Promises; no SDK objects cross this boundary.
 * createPayment({paymentId, amount, currency, channel, method, idempotencyKey, returnUrl})
 * getPayment({providerPaymentId})
 * capturePayment({providerPaymentId, amount, currency, idempotencyKey})
 * cancelPayment({providerPaymentId, idempotencyKey})
 * refundPayment({providerPaymentId, refundId, amount, currency, idempotencyKey})
 * Payment result: {providerPaymentId, status, amount, currency, capturedAmount,
 *   confirmation: null | {type: 'redirect', url}, rawMetadata: {operation?}}
 * Refund result: {providerRefundId, status, amount, currency, rawMetadata: {operation?}}
 * Adapters explicitly map external statuses and throw PaymentError with ERROR_CODES.
 * Timeouts are uncertain outcomes, never proof of failed/cancelled financial operations.
 */
function paymentResult(result) {
  if (!result || !Object.hasOwn(d.PAYMENT_TRANSITIONS, result.status)) d.fail("PAYMENT_INVALID_STATE");
  const normalized = {
    providerPaymentId: d.text(result.providerPaymentId, 128), status: result.status,
    amount: d.amount(result.amount), currency: d.currency(result.currency),
    capturedAmount: d.amount(result.capturedAmount, true),
    confirmation: null, refundable: result.refundable === true, rawMetadata: JSON.parse(d.metadata(result.rawMetadata)),
  };
  if (d.minor(normalized.capturedAmount, true) > d.minor(normalized.amount)) d.fail("PAYMENT_AMOUNT_INVALID");
  if(result.references){
    normalized.references={};
    for(const key of ['internalPaymentId','tenantReference','storeReference','orderReference'])
      if(result.references[key]!==undefined)normalized.references[key]=d.identifier(result.references[key]);
  }
  if (result.confirmation != null) {
    if (result.confirmation.type !== "redirect" || !result.confirmation.url) d.fail("PAYMENT_INPUT_INVALID");
    normalized.confirmation = { type: "redirect", url: d.confirmationUrl(result.confirmation.url) };
  }
  return normalized;
}
function refundResult(result) {
  if (!result || !Object.hasOwn(d.REFUND_TRANSITIONS, result.status)) d.fail("PAYMENT_INVALID_STATE");
  return { providerRefundId: d.text(result.providerRefundId, 128), status: result.status,
    amount: d.amount(result.amount), currency: d.currency(result.currency),
    rawMetadata: JSON.parse(d.metadata(result.rawMetadata)) };
}
function createProviderRegistry() {
  const providers = new Map();
  return Object.freeze({
    register(provider, adapter) {
      d.token(provider);
      if (providers.has(provider) || !adapter || !adapter.capabilities) d.fail("PAYMENT_INPUT_INVALID");
      const caps = adapter.capabilities;
      for (const name of ["supportsCapture", "supportsCancel", "supportsRefund", "supportsPartialRefund"])
        if (typeof caps[name] !== "boolean") d.fail("PAYMENT_INPUT_INVALID");
      for (const name of ["supportedChannels", "supportedMethods"]) {
        if (!Array.isArray(caps[name]) || !caps[name].length) d.fail("PAYMENT_INPUT_INVALID");
        caps[name].forEach(d.token);
      }
      if (caps.supportsPartialRefund && !caps.supportsRefund) d.fail("PAYMENT_INPUT_INVALID");
      const methods = ["createPayment", "getPayment"];
      if (typeof adapter.verifyConnection === "function") methods.push("verifyConnection");
      if (typeof adapter.getRefund === "function") methods.push("getRefund");
      if (caps.supportsCapture) methods.push("capturePayment");
      if (caps.supportsCancel) methods.push("cancelPayment");
      if (caps.supportsRefund) methods.push("refundPayment");
      methods.forEach(name => { if (typeof adapter[name] !== "function") d.fail("PAYMENT_INPUT_INVALID"); });
      const entry = { capabilities: Object.freeze({ ...caps,
        supportedChannels: Object.freeze([...caps.supportedChannels]),
        supportedMethods: Object.freeze([...caps.supportedMethods]) }) };
      methods.forEach(name => {
        entry[name] = async input => {
          const result = await adapter[name](input);
          return name === "verifyConnection" ? result : ["refundPayment", "getRefund"].includes(name) ? refundResult(result) : paymentResult(result);
        };
      });
      providers.set(provider, Object.freeze(entry));
    },
    get(provider) {
      const adapter = providers.get(provider);
      if (!adapter) d.fail("PAYMENT_PROVIDER_UNAVAILABLE");
      return adapter;
    },
    supports(provider, channel, method, capability) {
      const caps = this.get(provider).capabilities;
      return caps.supportedChannels.includes(channel) && caps.supportedMethods.includes(method)
        && (capability == null || caps[capability] === true);
    },
  });
}
module.exports = { createProviderRegistry, paymentResult, refundResult, PROVIDER_DEFINITIONS };
