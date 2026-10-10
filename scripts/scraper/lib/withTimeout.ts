/** Reject if `promise` has not settled within `ms`. The underlying work is not cancelled. */
export class TimeoutError extends Error {}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function loadTimeoutMs(env = process.env.REPAIR_LOAD_TIMEOUT_MS, fallback = 8 * 60 * 1000): number {
  const parsed = Number.parseInt(env ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
