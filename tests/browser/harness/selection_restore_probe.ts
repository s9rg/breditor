import initialize, * as wasm from "@breditor/wasm";
import {
  bootstrapWasmEngine,
  consumeSemanticSelection,
  semanticRangeSelectionScalars,
} from "@breditor/browser/advanced";
import {
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  createReferenceFormattingDocumentJson,
} from "@breditor/reference-highlight";

/**
 * Exercises real generated selection getters without DOM selection or React.
 * Each restored owner alternates absent, forward, collapsed, and backward
 * selections; zero and nonzero offsets must remain distinct from absence.
 * Reads are validated against the original requested coordinates, not another
 * getter read, and each view is consumed/freed exactly once.
 */
export async function probeRestoredSelections(iterations: number): Promise<{
  iterations: number;
  reads: number;
}> {
  await initialize();
  const semanticProfile = {
    bootstrapJson: REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
    formatVersion: 2 as const,
  };
  const initial = bootstrapWasmEngine(wasm, {
    kind: "document", lineageId: "selection-restore-probe",
    documentJson: createReferenceFormattingDocumentJson("Hello 🙂 world"),
    historyCapacity: 20, semanticProfile,
  });
  if (!initial.ok) throw new Error(`selection seed: ${initial.error.code}`);
  const engine = initial.engine;
  let observation = initial.observation;
  const seeds: { checkpoint: string; offsets: readonly [number, number] | undefined }[] = [];
  const save = (offsets: readonly [number, number] | undefined) => {
    const encoded = engine.sessionCheckpointJson();
    try {
      const checkpoint = encoded.takeValue();
      if (typeof checkpoint !== "string") throw new Error("selection checkpoint unavailable");
      seeds.push({ checkpoint, offsets });
    } finally { encoded.free(); }
  };
  try {
    save(undefined);
    for (const offsets of [[0, 14], [14, 14], [14, 0]] as const) {
      const command = engine.setRangeSelection(observation,
        "text", 2, offsets[0], "before", "text", 2, offsets[1], "after");
      try {
        if (command.status !== "committed") throw new Error("selection seed did not commit");
        const next = command.observation();
        if (next === undefined) throw new Error("selection successor unavailable");
        observation.free();
        observation = next;
      } finally { command.free(); }
      save(offsets);
    }
  } finally {
    observation.free();
    engine.free();
    initial.profileGeneration.free();
  }

  let reads = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const seed = seeds[iteration % seeds.length]!;
    const restored = bootstrapWasmEngine(wasm, {
      kind: "sessionCheckpoint", checkpointJson: seed.checkpoint, semanticProfile,
    });
    if (!restored.ok) throw new Error(`selection bootstrap ${iteration}: ${restored.error.code}`);
    try {
      for (let read = 0; read < 3; read += 1) {
        const result = restored.engine.selection(restored.observation);
        let view: ReturnType<typeof result.takeSelection>;
        try { view = result.takeSelection(); } finally { result.free(); }
        if (view === undefined) throw new Error("selection view unavailable");
        const consumed = consumeSemanticSelection(restored.projection, view, restored.profileGeneration);
        if (!consumed.ok) {
          throw new Error(`selection rejected at ${iteration}/${read}: ${consumed.error.code}`);
        }
        if (seed.offsets === undefined) {
          if (consumed.value !== null) throw new Error(`unexpected range at ${iteration}/${read}`);
        } else {
          if (consumed.value === null) throw new Error(`missing range at ${iteration}/${read}`);
          const scalars = semanticRangeSelectionScalars(consumed.value);
          const expected = {
            anchorPointKind: "text", anchorNodeIndex: 2, anchorOffset: seed.offsets[0], anchorAffinity: "before",
            focusPointKind: "text", focusNodeIndex: 2, focusOffset: seed.offsets[1], focusAffinity: "after",
          };
          if (!scalars.ok || JSON.stringify(scalars.value) !== JSON.stringify(expected)) {
            // Only bounded coordinate metadata; never document or checkpoint data.
            throw new Error(`selection coordinates differ at ${iteration}/${read}: ${JSON.stringify({
              expected, actual: scalars.ok ? scalars.value : scalars.error.code,
            })}`);
          }
        }
        reads += 1;
      }
    } finally {
      restored.observation.free();
      restored.engine.free();
      restored.profileGeneration.free();
    }
    if (iteration % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { iterations, reads };
}
