/**
 * Input sanitization & validation middleware for REST and Socket.IO payloads
 */

export function isValidNumber(val) {
  return typeof val === 'number' && !isNaN(val) && isFinite(val);
}

export function validateCoordinates(x, y) {
  return isValidNumber(x) && isValidNumber(y);
}

export function validateString(str, minLength = 1, maxLength = 100) {
  return typeof str === 'string' && str.trim().length >= minLength && str.trim().length <= maxLength;
}

export function validateSignalingPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!validateString(payload.targetPeerId, 1, 100)) return false;
  return true;
}
