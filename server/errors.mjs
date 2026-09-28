/* One error shape for everything the API refuses on purpose.
 * `code` is stable and machine-readable; `message` is safe to show a person.
 * Anything that is not an AppError becomes a generic 500 in app.mjs. */
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}
