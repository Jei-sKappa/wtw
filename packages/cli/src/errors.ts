import { WtwError } from "@wtw/core";

/**
 * Render any thrown value as the CLI's single-line failure envelope. A
 * `WtwError` or any `Error` with a non-empty message renders as
 * `Error: <message>`; an empty message or a non-`Error` value falls back to a
 * stable `Error: Unexpected failure.`.
 */
export function formatCliError(error: unknown): string {
  if (error instanceof WtwError && error.message.trim() !== "") {
    return `Error: ${error.message}`;
  }

  if (error instanceof Error && error.message.trim() !== "") {
    return `Error: ${error.message}`;
  }

  return "Error: Unexpected failure.";
}
