export const DEFAULT_CONCURRENCY = 6;

export function normalizeConcurrency(
  rawConcurrency: number,
  fallbackConcurrency = DEFAULT_CONCURRENCY,
): number {
  if (!Number.isInteger(rawConcurrency) || rawConcurrency < 1) {
    return fallbackConcurrency;
  }
  return rawConcurrency;
}
