function own(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
function tag(value: unknown, choices: readonly string[]): string {
  return typeof value === "string" && choices.includes(value) ? value : "unknown";
}

/** Test-only bounded route results. Never retain events, clipboard data or document content. */
export function createClipboardRouteRecorder(emit?: (event: unknown) => void) {
  const events: Record<string, string>[] = [];
  let omitted = 0;
  let emitted = 0;
  function record(disposition: unknown, route: unknown): void {
    try {
      const partial = own(disposition, "partial");
      const prevented = own(disposition, "defaultPrevented");
      const event = {
        route: tag(route, ["beforeinput", "input", "copy", "cut", "paste"]),
        kind: tag(own(disposition, "kind"), ["handled", "ignored", "blocked", "reconcileRequired", "beforeinputEcho", "inputPostcondition", "disposed"]),
        operation: tag(own(disposition, "operation"), ["copy", "cut", "paste"]),
        reason: tag(own(disposition, "reason"), ["outsideHost", "nestedControl", "alreadyDefaultPrevented", "notClipboardInput",
          "adapterUnavailable", "queueUnavailable", "invalidEvent", "selectionUnavailable", "invalidSelection",
          "clipboardUnavailable", "clipboardReadFailed", "clipboardWriteFailed", "unsupportedClipboardPayload",
          "invalidPlainText", "invalidHtml", "cancellationFailed", "staleBase", "queueRejected", "queueFailure",
          "commandRejected", "receiptUnavailable", "echoWithoutReceipt", "unexpectedInput", "leaseReleaseFailed", "disposed"]),
        clipboard: tag(own(partial, "clipboard"), ["untouched", "readAttempted", "cleared", "plainWritten", "representationsWritten", "writeUncertain"]),
        command: tag(own(partial, "command"), ["notApplicable", "notAttempted", "completed", "uncertain"]),
        cancellation: tag(own(partial, "cancellation"), ["notAttempted", "confirmed", "failed"]),
        defaultPrevented: prevented === true ? "true" : prevented === false ? "false" : "unknown",
      };
      if (events.length === 16) { events.shift(); omitted = Math.min(omitted + 1, 1_000_000); }
      events.push(event);
      if (emitted < 16 && (event.kind === "blocked" || event.kind === "reconcileRequired" || event.kind === "ignored")) {
        emitted++;
        emit?.({ ...event });
      }
    } catch { /* Inspection and logging must not change the original routing decision. */ }
  }
  return { record, snapshot: () => ({ format: "breditor/clipboard-routes", version: 1,
    events: events.map(event => ({ ...event })), omitted }) };
}
const recorder = createClipboardRouteRecorder(event => console.debug(`BREDITOR_CLIPBOARD_ROUTE=${JSON.stringify(event)}`));
export const recordClipboardRoute = recorder.record;
export const readClipboardRoutes = recorder.snapshot;
