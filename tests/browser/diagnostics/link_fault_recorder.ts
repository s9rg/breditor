import { snapshotProjectionChild } from "./projection_child_snapshot";
import { snapshotRequiredProperty } from "./required_property_snapshot";

/** Diagnostic fixture only. Retain static locations, never errors or payloads. */
export function createLinkFaultRecorder(emit?: (stage: string) => void, emitPoint?: (point: unknown) => void, emitLoop?: (loop: unknown) => void, emitNumeric?: (numeric: unknown) => void, emitChild?: (child: unknown) => void, emitRequired?: (state: unknown) => void) {
  const events: string[] = [];
  const points: unknown[] = [];
  const loops: unknown[] = [];
  const numeric: unknown[] = [];
  const children: (ReturnType<typeof snapshotProjectionChild> & { stage: string })[] = [];
  const requiredProperties: string[] = [];
  let omitted = 0;
  function record<T>(stage: string, original: T): T {
    try {
      if (/^(wasm_(command|projection|selection|action_state)_adapter:(throw|failure)|wasm_projection_adapter:impact|(browser_editor|browser_event_router|command_queue):(throw|failure)|wasm_(document_json|session_checkpoint):(result|failure)|projection:reject):[0-9]+$/.test(stage)) {
        if (events.length < 32) {
          events.push(stage);
          emit?.(stage);
        }
        else omitted = Math.min(omitted + 1, 1_000_000);
      }
    } catch { /* Instrumentation must not replace the original exception. */ }
    return original;
  }
  function point(stage: string, kind: unknown, nodeIndex: unknown, offset: unknown, affinity: unknown): null {
    try {
      if (/^wasm_selection_adapter:point:[0-9]+$/.test(stage) && points.length < 32) {
        const snapshot = Object.freeze({ stage,
          kind: kind === "text" || kind === "children" ? kind : typeof kind,
          nodeIndex: numberSnapshot(nodeIndex), offset: numberSnapshot(offset),
          affinity: affinity === "before" || affinity === "after" ? affinity : typeof affinity,
        });
        points.push(snapshot);
        emitPoint?.(snapshot);
      }
    } catch { /* Diagnostic failures never replace the original null result. */ }
    return null;
  }
  function contentResult<T>(stage: string, original: T): T {
    return original === null || original === false ? record(stage, original) : original;
  }
  function loop(value: unknown): void {
    try {
      if (loops.length < 8) {
        const snapshot = numberSnapshot(value);
        loops.push(snapshot);
        emitLoop?.(snapshot);
      }
    } catch { /* Observe only; never replace the original loop result. */ }
  }
  function numericPredicate<T>(stage: string, original: T, value: unknown): T {
    try {
      if (original === false && /^wasm_(document_json|session_checkpoint|selection_adapter|projection_adapter):numeric:[0-9]+(?::operand:[0-9]+)?$/.test(stage) && numeric.length < 32) {
        const snapshot = Object.freeze({ stage, originalResult: false, value: numberSnapshot(value) });
        numeric.push(snapshot);
        emitNumeric?.(snapshot);
      }
    } catch { /* Retain the original predicate result even if observation fails. */ }
    return original;
  }
  function childResult<T>(stage: string, original: T, child: unknown): T {
    record(stage, original);
    try {
      if (children.length < 8 && /^wasm_projection_adapter:failure:[0-9]+$/.test(stage)) {
        const snapshot = { stage, ...snapshotProjectionChild(child) };
        children.push(snapshot);
        emitChild?.({ ...snapshot });
      }
    } catch { /* Preserve the original rejection result. */ }
    return original;
  }
  function requiredProperty<T>(stage: string, original: T, format: unknown, contractIndex: unknown,
    contract: unknown, propertyArray: unknown, accepted: unknown): T {
    record(stage, original);
    try {
      if (requiredProperties.length < 8 && /^projection:reject:[0-9]+$/.test(stage)) {
        const snapshot = JSON.stringify({ stage, ...snapshotRequiredProperty(format, contractIndex, contract, propertyArray, accepted) });
        requiredProperties.push(snapshot);
        emitRequired?.(JSON.parse(snapshot));
      }
    } catch { /* Preserve the original rejection even when observation fails. */ }
    return original;
  }
  return { record, point, contentResult, loop, numericPredicate, childResult, requiredProperty, snapshot: () => ({ format: "breditor/link-faults", version: 1,
    events: [...events], points: [...points], loops: [...loops], numeric: [...numeric],
    children: children.map(child => ({ ...child })), requiredProperties: requiredProperties.map(value => JSON.parse(value) as unknown), omitted }) };
}

/** These are subsequent observations, not the original predicate's results. */
function numberSnapshot(value: unknown) {
  if (typeof value !== "number") return Object.freeze({ type: typeof value });
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, value, false);
  return Object.freeze({ type: "number", decimal: String(value),
    bits: bits.getBigUint64(0, false).toString(16).padStart(16, "0"),
    recheck: Object.freeze({ safeInteger: Number.isSafeInteger(value), nonnegative: value >= 0, withinU32: value <= 4_294_967_295 }),
  });
}
// Playwright traces retain these bounded static labels even when an earlier
// non-Link case fails before the Link test's attachment hook can run.
const recorder = createLinkFaultRecorder(stage => console.debug(`BREDITOR_LINK_THROW=${stage}`),
  point => console.debug(`BREDITOR_SELECTION_POINT=${JSON.stringify(point)}`),
  loop => console.debug(`BREDITOR_LOOP_RESULT=${JSON.stringify(loop)}`),
  numeric => console.debug(`BREDITOR_NUMERIC_PREDICATE=${JSON.stringify(numeric)}`),
  child => console.debug(`BREDITOR_PROJECTION_CHILD=${JSON.stringify(child)}`),
  state => console.debug(`BREDITOR_REQUIRED_PROPERTY=${JSON.stringify(state)}`));
export const recordLinkThrow = recorder.record;
export const recordSelectionPoint = recorder.point;
export const recordContentResult = recorder.contentResult;
export const recordLoopResult = recorder.loop;
export const recordNumericPredicate = recorder.numericPredicate;
export const recordProjectionChild = recorder.childResult;
export const recordRequiredProperty = recorder.requiredProperty;
export const readLinkFaults = recorder.snapshot;
