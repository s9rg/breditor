import initialize, * as wasm from "@breditor/wasm";
import {
  consumeWasmActionStates,
  consumeWasmCompiledProfileDescriptor,
  correlateBrowserActionStatesWithProfileDescriptor,
} from "@breditor/browser/advanced";
import {
  REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
} from "@breditor/reference-highlight";

/**
 * Exercises real Wasm ownership and typed action-state reads after restoration,
 * independently of DOM selection, React, and page reload timing. A color removal
 * remains in the redo branch, so restoration also has to retain redo history.
 * Repetition intentionally warms the browser's optimizing JavaScript tiers.
 */
export async function probeRestoredActionStates(iterations: number): Promise<{
  iterations: number;
  reads: number;
}> {
  await initialize();
  const compiled = wasm.BreditorCompiledProfile.fromBootstrapJsonV2(
    REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  );
  let profile: wasm.BreditorCompiledProfile | undefined;
  try {
    profile = compiled.takeProfile();
  } finally {
    compiled.free();
  }
  if (profile === undefined) throw new Error("restore probe profile missing");
  let generation: wasm.BreditorProfileGeneration | undefined;
  try {
    generation = profile.generation();
    const descriptor = consumeWasmCompiledProfileDescriptor(generation, profile.descriptor());
    if (!descriptor.ok) throw new Error("restore probe descriptor rejected");
    const checkpoint = seedCheckpoint(profile);
    let reads = 0;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const factory = profile.createEngineFromSessionCheckpointJsonV3(checkpoint);
      let engine: wasm.BreditorEngine | undefined;
      try {
        engine = factory.takeEngine();
      } finally {
        factory.free();
      }
      if (engine === undefined) throw new Error(`restore rejected at ${iteration}`);
      let observation: wasm.BreditorObservation | undefined;
      try {
        observation = engine.observation();
        for (let readIndex = 0; readIndex < 3; readIndex += 1) {
          const result = consumeWasmActionStates(
            { lineage: observation.snapshotLineage, revision: observation.snapshotRevision },
            engine.actionStates(observation),
            generation,
            [engine, observation],
          );
          if (!result.ok) {
            throw new Error(`action-state read rejected at ${iteration}/${readIndex}: ${result.error.code}`);
          }
          const correlated = correlateBrowserActionStatesWithProfileDescriptor(descriptor.descriptor, result);
          if (!correlated.ok || correlated.kind !== (readIndex === 0 ? "full" : "unchanged")) {
            throw new Error(`action-state correlation/cache rejected at ${iteration}/${readIndex}`);
          }
          const color = correlated.snapshot.entries.find((entry) => entry.id === "example/text-color-presence");
          if (JSON.stringify(color?.value) !== JSON.stringify({
            status: "uniform",
            contract: { name: "breditor/set-inline-format-input", version: 1 },
            value: { operation: "set", properties: [{ name: "example/rgb24", value: 0x123456 }] },
          })) {
            throw new Error(`restored color state differs at ${iteration}/${readIndex}`);
          }
          const redo = correlated.snapshot.entries.find((entry) => entry.id === "breditor/control-redo");
          if (redo?.availability !== "enabled") throw new Error("restored redo branch is missing");
          reads += 1;
        }
      } finally {
        observation?.free();
        engine.free();
      }
      // Let background compilation finish without a large artificial delay.
      if (iteration % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return { iterations, reads };
  } finally {
    generation?.free();
    profile.free();
  }
}

function seedCheckpoint(profile: wasm.BreditorCompiledProfile): string {
  const factory = profile.createEngineFromDocumentJsonV3(
    "restore-action-state-probe", REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON, 100,
  );
  let engine: wasm.BreditorEngine | undefined;
  try {
    engine = factory.takeEngine();
  } finally {
    factory.free();
  }
  if (engine === undefined) throw new Error("restore probe seed missing");
  let observation: wasm.BreditorObservation | undefined;
  const advance = (result: wasm.BreditorCommandResult | wasm.BreditorIntentResult): wasm.BreditorObservation => {
    try {
      if (result.status !== "committed") throw new Error("restore probe command rejected");
      const next = result.observation();
      if (next === undefined) throw new Error("restore probe observation missing");
      observation?.free();
      observation = next;
      return next;
    } finally {
      result.free();
    }
  };
  try {
    observation = engine.observation();
    observation = advance(engine.setRangeSelection(observation, "text", 2, 8, "before", "text", 2, 16, "after"));
    observation = advance(engine.executeTypedIntentJson(observation, "example/set-link-intent",
      '{"operation":"set","properties":[{"name":"example/href","value":"https://example.test/a"},{"name":"example/open-in-new-window","value":true}]}', true));
    observation = advance(engine.executeTypedIntentJson(observation, "example/set-text-size-intent",
      '{"operation":"set","properties":[{"name":"example/text-size-step","value":1}]}', true));
    observation = advance(engine.executeTypedIntentJson(observation, "example/set-text-color-intent",
      '{"operation":"set","properties":[{"name":"example/rgb24","value":1193046}]}', true));
    observation = advance(engine.undo(observation, true));
    observation = advance(engine.redo(observation, true));
    observation = advance(engine.executeTypedIntentJson(observation, "example/set-text-color-intent",
      '{"operation":"remove"}', true));
    advance(engine.undo(observation, true));
    const result = engine.sessionCheckpointJson();
    try {
      const checkpoint = result.takeValue();
      if (typeof checkpoint !== "string") throw new Error("restore probe checkpoint missing");
      return checkpoint;
    } finally {
      result.free();
    }
  } finally {
    observation?.free();
    engine.free();
  }
}
