// Pure, boundary-safe domain error. `@wtw/core` never formats terminal output
// or sets exit codes; it only raises `WtwError` carrying a stable `code` and a
// human-readable message. `@wtw/cli` renders these into the CLI failure
// envelope (see `formatCliError`).

/**
 * Stable machine-readable error codes raised by the `wtw` domain and CLI.
 * Later tasks extend this union as new failure modes are introduced.
 */
export type WtwErrorCode = "invalid_command" | "not_implemented";

/** Structured, serializable context attached to a `WtwError`. */
export type WtwErrorDetails = Record<
  string,
  string | number | boolean | string[] | undefined
>;

export class WtwError extends Error {
  readonly code: WtwErrorCode;
  readonly details?: WtwErrorDetails;

  constructor(code: WtwErrorCode, message: string, details?: WtwErrorDetails) {
    super(message);
    this.name = "WtwError";
    this.code = code;
    this.details = details;
  }
}
