/**
 * @file src/errors.ts
 * @desc TimeError: the one error class the package throws, with a code callers can switch on.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

/** Why a call refused its input. */
export type TimeErrorCode =
  | "invalid-zone"
  | "invalid-wall-time"
  | "nonexistent-time"
  | "ambiguous-time"
  | "invalid-instant"
  | "invalid-offset"
  | "invalid-slot-minutes"
  | "mismatched-slot-minutes"
  | "invalid-slot"
  | "invalid-window"
  | "invalid-query"
  | "invalid-region"
  | "invalid-event";

/** Thrown for input the package can't work with. `code` says which kind. */
export class TimeError extends Error {
  readonly code: TimeErrorCode;

  constructor(code: TimeErrorCode, message: string) {
    super(message);
    this.name = "TimeError";
    this.code = code;
  }
}
