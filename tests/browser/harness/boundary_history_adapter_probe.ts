import initialize, * as wasm from "@breditor/wasm";
import { BaseRangeSelection, bootstrapWasmEngine, consumeSemanticProjectionUpdate,
  consumeSemanticSelection, semanticRangeSelectionScalars,
  type BaseSelectionPoint, type SemanticRangeSelectionScalars, type WasmCommandResultView } from "@breditor/browser/advanced";
import { REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON, REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON } from "@breditor/reference-highlight";

type Coordinate = readonly [paragraph: number, utf16Offset: number];
type Runs = readonly (readonly (readonly [text: string, strong: boolean])[])[];

/** Verify the optional Rust-side record against present zero and absent counts. */
export async function probeProjectionCountDiagnostic() {
  await initialize();
  const document = JSON.parse(REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON);
  document.root.children[0].children = [{ kind: "text", text: "x", formats: [] }];
  const owner = bootstrapWasmEngine(wasm, { kind: "document", lineageId: "projection-count-control",
    documentJson: JSON.stringify(document), historyCapacity: 20,
    semanticProfile: { bootstrapJson: REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON, formatVersion: 2 } });
  if (!owner.ok) throw new Error(owner.error.code);
  const read = owner.engine.projection(owner.observation);
  const projection = read.takeProjection();
  read.free();
  try {
    if (!projection) throw new Error("missing count control projection");
    return [2, 1, 99].map(index => {
      const value = projection.formatCount(index);
      const record = (wasm as unknown as { debugLastProjectionFormatCount(): string }).debugLastProjectionFormatCount();
      return { value: value ?? null, type: typeof value, rust: JSON.parse(record) };
    });
  } finally { projection?.free(); owner.observation.free(); owner.engine.free(); }
}

/** Deliberate invalid-input control. Errors must preserve both their public codes
 * and the engine's ability to accept the next valid command. */
export async function probeRejectedSelectionInputs(): Promise<string[]> {
  await initialize();
  const owner = bootstrapWasmEngine(wasm, { kind: "document", lineageId: "selection-input-control",
    documentJson: REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON, historyCapacity: 20,
    semanticProfile: { bootstrapJson: REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON, formatVersion: 2 } });
  if (!owner.ok) throw new Error(owner.error.code);
  const results: string[] = [];
  try {
    for (const [kind, index] of [["text", 1], ["children", 99], ["children", 1]] as const) {
      const command = owner.engine.setRangeSelection(owner.observation, kind, index, 0, "after",
        "children", 1, 0, "after");
      try {
        const error = command.error;
        try { results.push(error?.code ?? command.status); } finally { error?.free(); }
      } finally { command.free(); }
    }
    return results;
  } finally { owner.observation.free(); owner.engine.free(); }
}

/** Boundary-only clipboard history reduced to real core commands and production
 * adapters. Keeps four paragraphs, an empty block, split strong runs, backward
 * ranges and identical replacement; excludes DOM, clipboard, toolbar and queue.
 * Each cycle owns a fresh engine, matching the full test's fresh document.
 */
export async function probeBoundaryHistory(iterations: number, schedule: "sync" | "task"): Promise<string> {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1_000 ||
      (schedule !== "sync" && schedule !== "task")) throw new Error("invalid boundary history request");
  await initialize();
  const seed = ["Left🙂", "", "Right e\u0301 & <tag>", "尾"];
  const plain: Runs = [[[seed[0]!, false]], [], [[seed[2]!, false]], [[seed[3]!, false]]];
  const leftBold: Runs = [[["Left", true], ["🙂", false]], [], plain[2]!, plain[3]!];
  const bothBold: Runs = [leftBold[0]!, [], [["Right", true], [" e\u0301 & <tag>", false]], plain[3]!];
  const cut: Runs = [bothBold[0]!, bothBold[2]!, bothBold[3]!];
  const typed: Runs = [bothBold[0]!, [["!", false]], bothBold[2]!, bothBold[3]!];
  let commands = 0;
  let updates = 0;
  let selections = 0;
  let targetChecks = 0;
  for (let cycle = 0; cycle < iterations; cycle++) {
    let stage = "bootstrap";
    const owner = bootstrapWasmEngine(wasm, { kind: "document", lineageId: "boundary-history-probe",
      documentJson: REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON, historyCapacity: 20,
      semanticProfile: { bootstrapJson: REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON, formatVersion: 2 } });
    if (!owner.ok) throw new Error(`boundary history cycle=${cycle} bootstrap=${owner.error.code}`);
    const { engine, profileGeneration, profileDescriptor } = owner;
    let observation = owner.observation;
    let projection = owner.projection;

    function coordinate(point: BaseSelectionPoint): Coordinate {
      const path = point.kind === "text" ? point.textPath : point.parentPath;
      const runs = projection.paragraphs[path[0]!]!.runs;
      const runIndex = point.kind === "text" ? path[1]! : point.childIndex;
      const prefix = runs.slice(0, runIndex).reduce((sum, run) => sum + run.text.length, 0);
      return [path[0]!, prefix + (point.kind === "text" ? point.utf16Offset : 0)];
    }

    function accept(command: WasmCommandResultView, expected: Runs, anchor: Coordinate, focus = anchor,
      allowUnchanged = false, selectionInput?: SemanticRangeSelectionScalars) {
      try {
        const status = command.status;
        if (status !== "committed" && !(allowUnchanged && status === "unchanged")) {
          const error = command.error;
          let code: string | undefined;
          try { code = error?.code; } finally { error?.free(); }
          // This fixture's already-captured scalar object contains no document
          // text. Do not reread the engine or retry a rejected selection.
          throw new Error(`unexpected command status ${status} code=${code ?? "absent"} input=${JSON.stringify(selectionInput)}`);
        }
        const view = command.projectionUpdate();
        if (status === "committed") {
          if (!view) throw new Error("missing projection update");
          const result = consumeSemanticProjectionUpdate(projection, view, profileGeneration, profileDescriptor);
          if (!result.ok) throw new Error(`projection rejected ${result.error.code}`);
          projection = result.value.result;
          updates++;
        } else if (view !== undefined) {
          view.free();
          throw new Error("unchanged command supplied an update");
        }
        const next = command.observation();
        if (!next) throw new Error("missing successor observation");
        observation.free(); observation = next;
        const actual = projection.paragraphs.map(paragraph => paragraph.runs.map(run => [run.text, run.strong]));
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("paragraph text/strong runs differ");
        const read = engine.selection(observation);
        let selectionView: ReturnType<typeof read.takeSelection>;
        try { selectionView = read.takeSelection(); } finally { read.free(); }
        if (!selectionView) throw new Error("missing selection view");
        const result = consumeSemanticSelection(projection, selectionView, profileGeneration);
        if (!result.ok) throw new Error(`selection rejected ${result.error.code}`);
        if (!result.value) throw new Error("selection absent");
        const actualCoordinates = [coordinate(result.value.anchor), coordinate(result.value.focus)];
        if (JSON.stringify(actualCoordinates) !== JSON.stringify([anchor, focus])) {
          throw new Error(`selection coordinates differ expected=${JSON.stringify([anchor, focus])} actual=${JSON.stringify(actualCoordinates)}`);
        }
        if (stage === "undo second bold") {
          const scalars = semanticRangeSelectionScalars(result.value);
          if (!scalars.ok || scalars.value.anchorNodeIndex !== 6 || scalars.value.anchorOffset !== 0 ||
              scalars.value.anchorPointKind !== "text" || scalars.value.anchorAffinity !== "after") {
            throw new Error("target Undo point differs from captured (text,6,0,after)");
          }
          targetChecks++;
        }
        selections++;
        commands++;
      } finally { command.free(); }
    }

    function select(expected: Runs, anchor: Coordinate, focus = anchor) {
      const point = ([paragraphIndex, offset]: Coordinate) => {
        const paragraph = projection.paragraphs[paragraphIndex];
        if (!paragraph) throw new Error("selection paragraph absent");
        for (const [runIndex, run] of paragraph.runs.entries()) {
          if (offset <= run.text.length) return { kind: "text", textPath: [paragraphIndex, runIndex],
            utf16Offset: offset, affinity: offset === run.text.length ? "before" : "after" };
          offset -= run.text.length;
        }
        if (offset === 0 && paragraph.runs.length === 0) {
          return { kind: "children", parentPath: [paragraphIndex], childIndex: 0, affinity: "after" };
        }
        throw new Error("selection offset exceeds paragraph");
      };
      const range = BaseRangeSelection.create(projection, { kind: "range", anchor: point(anchor), focus: point(focus) });
      if (!range.ok) throw new Error(`fixture selection rejected ${range.error.code}`);
      const scalars = semanticRangeSelectionScalars(range.value);
      if (!scalars.ok) throw new Error("fixture scalar conversion failed");
      const value = scalars.value;
      accept(engine.setRangeSelection(observation, value.anchorPointKind, value.anchorNodeIndex, value.anchorOffset,
        value.anchorAffinity, value.focusPointKind, value.focusNodeIndex, value.focusOffset, value.focusAffinity),
      expected, anchor, focus, true, value);
    }

    try {
      stage = "select empty"; select([[]], [0, 0]);
      stage = "paste seed";
      accept(engine.executeStringAction(observation, "breditor/insert-plain-text", seed.join("\n"), true), plain, [3, 1]);
      stage = "select Left"; select(plain, [0, 0], [0, 4]);
      stage = "bold Left";
      accept(engine.executeNoInputAction(observation, "breditor/toggle-strong", true), leftBold, [0, 0], [0, 4]);
      stage = "select Right"; select(leftBold, [2, 0], [2, 5]);
      stage = "bold Right";
      accept(engine.executeNoInputAction(observation, "breditor/toggle-strong", true), bothBold, [2, 0], [2, 5]);
      // Preserve both selection changes preceding the original clipboard cut.
      stage = "select copy paragraph"; select(bothBold, [2, seed[2]!.length], [2, 0]);
      stage = "select backward boundary"; select(bothBold, [1, 0], [0, 6]);
      stage = "cut boundary";
      accept(engine.executeNoInputAction(observation, "breditor/delete-selection", true), cut, [0, 6]);
      stage = "undo cut"; accept(engine.undo(observation, false), bothBold, [1, 0], [0, 6]);
      stage = "redo cut"; accept(engine.redo(observation, false), cut, [0, 6]);
      stage = "undo cut again"; accept(engine.undo(observation, false), bothBold, [1, 0], [0, 6]);
      stage = "reselect backward boundary"; select(bothBold, [1, 0], [0, 6]);
      stage = "identical replacement";
      accept(engine.executeStringAction(observation, "breditor/insert-plain-text", "\r\n", true), bothBold, [1, 0]);
      stage = "type";
      accept(engine.executeStringAction(observation, "breditor/insert-text", "!", true), typed, [1, 1]);
      stage = "undo typing"; accept(engine.undo(observation, false), bothBold, [1, 0]);
      stage = "undo second bold"; accept(engine.undo(observation, false), leftBold, [2, 0], [2, 5]);
      stage = "redo second bold"; accept(engine.redo(observation, false), bothBold, [1, 0]);
      stage = "redo typing"; accept(engine.redo(observation, false), typed, [1, 1]);
    } catch (error) {
      throw new Error(`boundary history cycle=${cycle} stage=${stage}: ${error instanceof Error ? error.message : "unknown failure"}`, { cause: error });
    } finally {
      try { observation.free(); } finally { try { engine.free(); } finally { profileGeneration.free(); } }
    }
    if (schedule === "task") await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return JSON.stringify({ format: "breditor/boundary-history-adapter", schedule,
    cycles: String(iterations), commands: String(commands), updates: String(updates),
    selections: String(selections), targetChecks: String(targetChecks) });
}
