/** Own data fields only: no getters, identifiers, payloads or document snapshots. */
function own(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function tag(value: unknown, choices: readonly string[]): string {
  return typeof value === "string" && choices.includes(value) ? value : "unknown";
}

export function createDeliveryFaultRecorder(emit?: (event: unknown) => void) {
  const events: Record<string, string>[] = [];
  function record(stage: string, delivery?: unknown, invocation?: unknown): void {
    try {
      if (typeof stage !== "string" || !/^browser_editor:(delivery|toolbar):[0-9]+$/.test(stage) || events.length >= 16) return;
      const event: Record<string, string> = { stage };
      if (stage.includes(":toolbar:")) {
        const submission = own(delivery, "submission");
        const sequence = own(submission, "result");
        const outcome = own(sequence, "command");
        const command = own(invocation, "command");
        event["delivery"] = tag(own(delivery, "status"), ["completed", "busy", "unavailable", "failed"]);
        event["submission"] = tag(own(submission, "status"), ["completed", "failed", "rejected"]);
        event["sequence"] = tag(own(sequence, "status"), ["delivered"]);
        event["outcome"] = tag(own(outcome, "status"), ["committed", "unchanged", "rejected", "blocked", "unhandled", "disabled"]);
        event["eventKind"] = tag(own(outcome, "eventKind"), ["undo", "redo", "action", "intent"]);
        event["command"] = tag(own(command, "kind"), ["history", "action", "intent", "intentJson"]);
        event["operation"] = tag(own(command, "operation"), ["undo", "redo"]);
      }
      events.push(event);
      emit?.({ ...event });
    } catch { /* Preserve the original failure if diagnostic inspection fails. */ }
  }
  return { record, snapshot: () => events.map(event => ({ ...event })) };
}

const recorder = createDeliveryFaultRecorder(event => console.debug(`BREDITOR_DELIVERY_FAULT=${JSON.stringify(event)}`));
export const recordDeliveryFault = recorder.record;
export const readDeliveryFaults = recorder.snapshot;
