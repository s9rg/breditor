/**
 * Consume hook rejections without awaiting or changing a completed operation.
 * Returns true for thenables (or unreadable `then` properties), so synchronous
 * scheduling contracts can also reject them and revoke retained callbacks.
 */
export function containAsyncRejection(value: unknown): boolean {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    return false;
  }
  try {
    const then = (value as Readonly<{ then?: unknown }>).then;
    if (typeof then === "function") {
      void Promise.resolve(value).catch(() => {});
      return true;
    }
    return false;
  } catch {
    return true;
  }
}
