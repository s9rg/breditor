/**
 * Dispatch a synthetic InputEvent with requested native target-range evidence.
 * WebKit's constructor omits targetRanges. Override the platform method for
 * this exact fixture event only; delegate all others and restore in finally.
 * This is a test capability fixture, not OS-input qualification or product code.
 */
export function withSyntheticTargetRanges(event, ranges, dispatch) {
  if (!ranges || event.getTargetRanges().length === ranges.length) return dispatch();
  const descriptor = Object.getOwnPropertyDescriptor(InputEvent.prototype, "getTargetRanges");
  if (!descriptor?.configurable || typeof descriptor.value !== "function") throw new Error("target-range fixture unavailable");
  Object.defineProperty(InputEvent.prototype, "getTargetRanges", {...descriptor, value() {
    return this === event ? ranges : Reflect.apply(descriptor.value, this, []);
  }});
  try { return dispatch(); }
  finally { Object.defineProperty(InputEvent.prototype, "getTargetRanges", descriptor); }
}
