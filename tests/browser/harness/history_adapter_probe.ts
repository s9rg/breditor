import initialize, * as wasm from "@breditor/wasm";
import { bootstrapWasmEngine, consumeSemanticProjectionUpdate, consumeSemanticSelection,
  semanticRangeSelectionScalars, type WasmCommandResultView, type WasmIntentResultView } from "@breditor/browser/advanced";
import { REFERENCE_FORMATTING_IDS as ids, REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  createReferenceFormattingDocumentJson } from "@breditor/reference-highlight";

/** The failing cut/caret/type/history sequence without DOM, clipboard or queue.
 * A single real Wasm owner crosses its history capacity. Production adapters own
 * every view read and cleanup; no generated getter is pre-read for diagnostics.
 * This reduction does not replace the full browser reproduction.
 */
export async function probeAdaptedHistory(iterations: number, schedule: "sync" | "task"): Promise<string> {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1_000 ||
      (schedule !== "sync" && schedule !== "task")) throw new Error("invalid history probe request");
  await initialize();
  const text = "Hello 🙂 world";
  const remaining = text.slice(5);
  const firstHref = "https://example.test/reference";
  const owner = bootstrapWasmEngine(wasm, { kind: "document", lineageId: "adapted-history-probe",
    documentJson: createReferenceFormattingDocumentJson(text, { highlighted: true,
      link: { href: firstHref, openInNewWindow: false } }), historyCapacity: 20,
    semanticProfile: { bootstrapJson: REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON, formatVersion: 2 } });
  if (!owner.ok) throw new Error(`history bootstrap: ${owner.error.code}`);
  const { engine, profileGeneration, profileDescriptor } = owner;
  let observation = owner.observation;
  let projection = owner.projection;
  let cycle = -1;
  let stage = "setup";
  let updates = 0;
  let selections = 0;
  type Expected = { text: string; href: string; offsets: readonly [number, number] };

  function accept(command: WasmCommandResultView | WasmIntentResultView, changed: boolean, expected: Expected) {
    try {
      if (command.status !== "committed") throw new Error(`command status ${command.status}`);
      const view = command.projectionUpdate();
      if (!view) throw new Error("missing projection update");
      const result = consumeSemanticProjectionUpdate(projection, view, profileGeneration, profileDescriptor);
      if (!result.ok) throw new Error(`projection rejected: ${result.error.code}`);
      if ((result.value.impact.kind !== "none") !== changed) throw new Error("projection impact differs");
      projection = result.value.result;
      updates++;
      const next = command.observation();
      if (!next) throw new Error("successor unavailable");
      observation.free(); observation = next;
      const paragraphs = projection.paragraphs;
      const runs = paragraphs[0]?.runs;
      if (paragraphs.length !== 1 || runs?.length !== 1 || runs[0]?.text !== expected.text) throw new Error("projected text differs");
      const formats = runs[0].formatDetails;
      const link = formats.find(format => format.kind === ids.linkFormatKind);
      if (link?.properties.length !== 2 ||
          link.properties.find(property => property.name === ids.linkHrefProperty)?.value !== expected.href ||
          link.properties.find(property => property.name === ids.linkOpenInNewWindowProperty)?.value !== false ||
          !formats.some(format => format.kind === ids.highlightFormatKind)) throw new Error("projected formatting differs");
      const read = engine.selection(observation);
      let selectionView: ReturnType<typeof read.takeSelection>;
      try { selectionView = read.takeSelection(); } finally { read.free(); }
      if (!selectionView) throw new Error("selection unavailable");
      const selected = consumeSemanticSelection(projection, selectionView, profileGeneration);
      if (!selected.ok) throw new Error(`selection rejected: ${selected.error.code}`);
      if (!selected.value) throw new Error("selection absent");
      const scalars = semanticRangeSelectionScalars(selected.value);
      if (!scalars.ok || scalars.value.anchorPointKind !== "text" || scalars.value.focusPointKind !== "text" ||
          scalars.value.anchorNodeIndex !== 2 || scalars.value.focusNodeIndex !== 2 ||
          scalars.value.anchorOffset !== expected.offsets[0] || scalars.value.focusOffset !== expected.offsets[1]) {
        throw new Error(`restored selection coordinates differ expected=${expected.offsets.join(",")} actual=${scalars.ok
          ? `${scalars.value.anchorPointKind}:${String(scalars.value.anchorNodeIndex)}:${String(scalars.value.anchorOffset)},${scalars.value.focusPointKind}:${String(scalars.value.focusNodeIndex)}:${String(scalars.value.focusOffset)}`
          : scalars.error.code}`);
      }
      selections++;
    } finally { command.free(); }
  }
  function select(expected: Expected) {
    accept(engine.setRangeSelection(observation, "text", 2, expected.offsets[0], "before",
      "text", 2, expected.offsets[1], "after"), false, expected);
  }
  try {
    let priorHref = firstHref;
    for (cycle = 0; cycle < iterations; cycle++) {
      const href = `https://example.test/step/${cycle}`;
      const full: Expected = { text, href, offsets: [0, text.length] };
      stage = "select full"; select({ ...full, href: priorHref });
      stage = "Link apply";
      accept(engine.executeTypedIntentJson(observation, ids.linkIntentId, JSON.stringify({ operation: "set", properties: [
        { name: ids.linkHrefProperty, value: href }, { name: ids.linkOpenInNewWindowProperty, value: false },
      ] }), true), true, full);
      stage = "Link undo"; accept(engine.undo(observation, false), true, { ...full, href: priorHref });
      stage = "Link redo"; accept(engine.redo(observation, false), true, full);
      const beforeCut: Expected = { text, href, offsets: cycle % 2 === 0 ? [0, 5] : [5, 0] };
      stage = "select cut"; select(beforeCut);
      const cut: Expected = { text: remaining, href, offsets: [0, 0] };
      stage = "cut"; accept(engine.executeNoInputAction(observation, "breditor/delete-selection", true), true, cut);
      const caret: Expected = { ...cut, offsets: [remaining.length, remaining.length] };
      stage = "move caret"; select(caret);
      const typed: Expected = { text: `${remaining}!`, href, offsets: [remaining.length + 1, remaining.length + 1] };
      stage = "type"; accept(engine.executeStringAction(observation, "breditor/insert-text", "!", true), true, typed);
      stage = "undo typing"; accept(engine.undo(observation, false), true, caret);
      stage = "undo cut"; accept(engine.undo(observation, false), true, beforeCut);
      // The state-only caret move updates the cut history entry's after-boundary
      // (History::observe_state_only); redo restores that latest caret, not zero.
      stage = "redo cut"; accept(engine.redo(observation, false), true, caret);
      stage = "redo typing"; accept(engine.redo(observation, false), true, typed);
      stage = "undo typing again"; accept(engine.undo(observation, false), true, caret);
      stage = "undo cut again"; accept(engine.undo(observation, false), true, beforeCut);
      priorHref = href;
      if (schedule === "task") await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return JSON.stringify({ format: "breditor/adapted-history-probe", schedule,
      cycles: String(cycle), updates: String(updates), selections: String(selections) });
  } catch (error) {
    throw new Error(`adapted history cycle=${cycle} stage=${stage}: ${error instanceof Error ? error.message : "unknown failure"}`, { cause: error });
  } finally {
    try { observation.free(); } finally { try { engine.free(); } finally { profileGeneration.free(); } }
  }
}
