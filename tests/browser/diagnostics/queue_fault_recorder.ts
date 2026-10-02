/** Test-only failure recorder. Never retains error objects or arbitrary messages. */
const messages = new Set([
  "Wasm semantic selection is invalid",
  "Wasm projection update is invalid",
  "Wasm selection read violated its exact shape",
  "command delivery token is stale or foreign",
  "command selection could not be converted exactly",
  "projection update and successor observation disagree",
  "current render must be restored before token issuance",
  "command queue executors must be synchronous",
  "command queue observers must be synchronous",
]);

export function createQueueFaultRecorder(emit?: (event: unknown) => void) {
  const events: { stage: string; reason: string; frames: string[] }[] = [];
  function record(stage: string, error: unknown): void {
    try {
      if (!/^command_queue:(executor|observer|stop):[0-9]+$/.test(stage) || events.length >= 8) return;
      let reason = "unclassified";
      const frames: string[] = [];
      if (error === "command_queue.executor_threw" || error === "command_queue.observer_threw") reason = error;
      if (typeof error === "object" && error !== null) {
        const message = Object.getOwnPropertyDescriptor(error, "message");
        if (message && "value" in message && typeof message.value === "string" && messages.has(message.value)) reason = message.value;
        const stack = Object.getOwnPropertyDescriptor(error, "stack");
        if (stack && "value" in stack && typeof stack.value === "string") {
          // Retain only bounded package module/line/column coordinates, never
          // function names, URLs, full paths, arbitrary stack text or payloads.
          for (const match of stack.value.slice(0, 8192).matchAll(/\/breditor-browser\/dist\/([a-z_]+\.js)(?:\?[^\s:@]*)?:(\d{1,7}):(\d{1,7})/g)) {
            frames.push(`${match[1]}:${match[2]}:${match[3]}`);
            if (frames.length === 8) break;
          }
        }
      }
      const event = { stage, reason, frames };
      events.push(event);
      emit?.({ ...event, frames: [...frames] });
    } catch { /* Observation must never replace the queue's original fail-stop. */ }
  }
  return { record, snapshot: () => ({ format: "breditor/queue-faults", version: 1,
    events: events.map(event => ({ ...event, frames: [...event.frames] })) }) };
}

const recorder = createQueueFaultRecorder(event => console.debug(`BREDITOR_QUEUE_FAULT=${JSON.stringify(event)}`));
export const recordQueueFault = recorder.record;
export const readQueueFaults = recorder.snapshot;
if (typeof window !== "undefined") Object.assign(window, { breditorLinkDiagnostics: recorder.snapshot });
