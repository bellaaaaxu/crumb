/* Request-body readers. Every route reads its body through readObject, which
 * refuses unknown keys, so a forged `role` or `userId` cannot ride along. */
import { AppError } from './errors.mjs';

const MULTILINE_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const SINGLE_LINE_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const invalid = (field, message) => new AppError(422, 'INVALID_INPUT', message, { field });

export function readObject(value, shape, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new AppError(422, 'INVALID_INPUT', 'The request body must be a JSON object.', prefix ? { field: prefix.slice(0, -1) } : {});
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(shape, key))
      throw new AppError(422, 'UNKNOWN_FIELD', `Unknown field: ${prefix}${key}.`, { field: `${prefix}${key}` });
  }
  const result = {};
  for (const [key, read] of Object.entries(shape)) {
    const parsed = read(value[key], `${prefix}${key}`);
    if (parsed !== undefined) result[key] = parsed;
  }
  return result;
}

const missing = value => value === undefined || value === null;

export const text = ({ min = 0, max, optional = false, multiline = false } = {}) => (value, field) => {
  if (missing(value)) {
    if (optional) return undefined;
    throw invalid(field, `${field} is required.`);
  }
  if (typeof value !== 'string' || !value.isWellFormed()) throw invalid(field, `${field} must be text.`);
  const trimmed = value.trim();
  if ((multiline ? MULTILINE_CONTROL : SINGLE_LINE_CONTROL).test(trimmed))
    throw invalid(field, `${field} contains characters that cannot be shown.`);
  const length = [...trimmed].length;
  if (length < min || length > max) throw invalid(field, `${field} must be ${min} to ${max} characters.`);
  return trimmed;
};

/* Passwords and tokens: checked for type and size only, never trimmed. */
export const secret = ({ max }) => (value, field) => {
  if (typeof value !== 'string' || value.length === 0) throw invalid(field, `${field} is required.`);
  if (value.length > max || !value.isWellFormed()) throw invalid(field, `${field} is too long.`);
  return value;
};

export const oneOf = (values, { optional = false } = {}) => (value, field) => {
  if (missing(value)) {
    if (optional) return undefined;
    throw invalid(field, `${field} is required.`);
  }
  if (!values.includes(value)) throw invalid(field, `${field} must be one of: ${values.join(', ')}.`);
  return value;
};

export const bool = ({ optional = false } = {}) => (value, field) => {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'boolean') throw invalid(field, `${field} must be true or false.`);
  return value;
};

/* Amounts stay strings here; parseUnits turns them into units with the organization's mode. */
export const amount = ({ optional = false } = {}) => (value, field) => {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string')
    throw new AppError(422, 'INVALID_AMOUNT', 'Enter the amount as text, for example "12.50".', { field });
  return value;
};

export const id = ({ optional = false } = {}) => (value, field) => {
  if (missing(value) && optional) return undefined;
  if (typeof value !== 'string' || !UUID.test(value)) throw invalid(field, `${field} is not a valid id.`);
  return value;
};

export const object = () => (value, field) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw invalid(field, `${field} is required.`);
  return value;
};

export const isUuid = value => typeof value === 'string' && UUID.test(value);

export function normalizeUsername(value, field = 'username') {
  if (typeof value !== 'string') throw invalid(field, 'Enter a username.');
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,64}$/.test(username))
    throw invalid(field, 'Usernames are 3 to 64 lowercase letters, numbers, dots, dashes or underscores.');
  return username;
}

export const username = () => (value, field) => normalizeUsername(value, field);
