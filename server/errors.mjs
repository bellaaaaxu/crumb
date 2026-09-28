/* One error shape for everything the API refuses on purpose.
 * `code` is stable and machine-readable; `message` is safe to show a person.
 * `field` names the input at fault; `headers` are added to the response
 * (Retry-After, for example). Anything that is not an AppError becomes a
 * generic 500 in app.mjs. */
export class AppError extends Error {
  constructor(status, code, message, { field, headers } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (field) this.field = field;
    if (headers) this.headers = headers;
  }
}
