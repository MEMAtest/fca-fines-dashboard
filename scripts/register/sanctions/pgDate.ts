/**
 * node-postgres parses a SQL DATE column into a JS Date at LOCAL midnight
 * (not UTC) for the intended calendar day. Reading it back with UTC getters
 * (or toISOString()) silently rolls the date back a day for any timezone
 * west of UTC — a real bug caught while building the sanctions change-log
 * generator (BST: 2026-10-02 DATE came back as "2026-10-01" via
 * toUTCDate()). Always use this helper for a register_change_log /
 * register_sanctions_snapshots date column.
 */
export function toIsoDateString(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}
