// Pure, boundary-safe domain error. `@wtw/core` never formats terminal output
// or sets exit codes; it only raises `WtwError` carrying a stable `code` and a
// human-readable message. `@wtw/cli` renders these into the CLI failure
// envelope (see `formatCliError`).

/**
 * Stable machine-readable error codes raised by the `wtw` domain and CLI.
 * Later tasks extend this union as new failure modes are introduced.
 *
 * The repository-resolution codes distinguish two failure classes fixed by the
 * spec's "Compatibility and safety constraints": `unsupported_platform` and
 * `unsupported_repository` are predictable, non-mutating errors raised before or
 * during read-only discovery (the OS is unsupported, or the primary worktree
 * fails the support predicate); `git_command_failed` is an ordinary command
 * failure — a Git subprocess exiting non-zero or a post-discovery read/write
 * permission failure — not a support-boundary verdict.
 */
export type WtwErrorCode =
  | "invalid_command"
  | "not_implemented"
  | "unsupported_platform"
  | "unsupported_repository"
  | "git_command_failed"
  | "lock_unavailable"
  | "workspace_invalid"
  | "sync_failed";

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
