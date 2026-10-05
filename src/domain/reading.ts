/**
 * After this long without a page turn the reader is treated as away: the reading session stops
 * counting time and the screen may sleep again. One value for both, so they agree.
 */
export const IDLE_MS = 5 * 60_000
