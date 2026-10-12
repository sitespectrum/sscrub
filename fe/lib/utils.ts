export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  maxRetries: number = 3,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || signal?.aborted) throw err;
      await new Promise((r) =>
        setTimeout(
          r,
          Math.min(1000 * 2 ** attempt, 15_000) + Math.random() * 500,
        ),
      );
    }
  }
}
