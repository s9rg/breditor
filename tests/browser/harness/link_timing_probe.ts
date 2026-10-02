interface TimingPorts {
  monotonic: () => number;
  wall: () => number;
  visibility: () => string;
  focused: () => boolean;
  schedule: (callback: () => void) => void;
  emit?: (event: unknown) => void;
}

/** Test-only observation of existing yields. Never adds timers or reads editor content. */
export function createLinkTimingProbe(ports: TimingPorts) {
  const point = () => ({ monotonic: ports.monotonic(), wall: ports.wall(),
    visibility: ports.visibility(), focused: ports.focused() });
  let last = point();
  let pending: ReturnType<typeof point> | null = null;
  let scheduled = 0;
  let completed = 0;
  let omitted = 0;
  let timerMs = 0;
  let betweenYieldMs = 0;
  let maxTimerMs = 0;
  let maxBetweenYieldMs = 0;
  let terminal: "running" | "completed" | "failed" = "running";
  const events: unknown[] = [];
  function observe(kind: "timer" | "between-yields", start: ReturnType<typeof point>, end: ReturnType<typeof point>) {
    const elapsedMs = end.monotonic - start.monotonic;
    if (kind === "timer") {
      timerMs += elapsedMs;
      maxTimerMs = Math.max(maxTimerMs, elapsedMs);
    } else {
      betweenYieldMs += elapsedMs;
      maxBetweenYieldMs = Math.max(maxBetweenYieldMs, elapsedMs);
    }
    if (elapsedMs < 250) return;
    if (events.length >= 16) { omitted++; return; }
    const event = { kind, yieldIndex: scheduled, elapsedMs, wallElapsedMs: end.wall - start.wall,
      visibilityBefore: start.visibility, visibilityAfter: end.visibility,
      focusedBefore: start.focused, focusedAfter: end.focused };
    events.push(event);
    try { ports.emit?.(event); } catch { /* Logging cannot change the scheduled operation. */ }
  }
  return {
    nextTask: () => {
      const start = point();
      observe("between-yields", last, start);
      scheduled++;
      pending = start;
      return new Promise<void>(resolve => ports.schedule(() => {
        const end = point();
        observe("timer", start, end);
        completed++;
        pending = null;
        last = end;
        resolve();
      }));
    },
    finish: (status: "completed" | "failed") => {
      if (terminal !== "running") return;
      observe("between-yields", last, point());
      terminal = status;
    },
    snapshot: () => JSON.stringify({ format: "breditor/link-timing", version: 1,
      terminal, scheduled, completed, timerMs, betweenYieldMs, maxTimerMs,
      maxBetweenYieldMs, pending, events, omitted }),
  };
}

/** Opt-in only; preserves the fixture's existing setTimeout(..., 0) scheduler. */
export function installLinkTimingProbe() {
  const probe = createLinkTimingProbe({ monotonic: () => performance.now(), wall: () => Date.now(),
    visibility: () => document.visibilityState, focused: () => document.hasFocus(),
    schedule: callback => { setTimeout(callback, 0); },
    emit: event => console.debug(`BREDITOR_LINK_TIMING=${JSON.stringify(event)}`) });
  Object.assign(window, { breditorLinkTiming: probe.snapshot });
  return probe;
}
