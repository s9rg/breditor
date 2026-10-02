import initialize, * as wasm from "@breditor/wasm";
import { REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON, createReferenceFormattingDocumentJson } from "@breditor/reference-highlight";

// Preserve absence and value types: JSON alone would omit both undefined and a
// wrongly returned function, and would collapse non-finite numbers to null.
function encodeFields(fields: Record<string, unknown>): string {
  return JSON.stringify(Object.entries(fields).map(([key, value]) => [key, typeof value, value]));
}

/**
 * Isolates generated Rust/Wasm selection getters from browser validation and DOM.
 * A single compiled profile restores fresh owners with absent, forward, collapsed,
 * and backward selections. Every getter is read once into an exact JSON record;
 * expected coordinates are derived from the requested seed, not another read.
 * This complements, rather than replaces, the full bootstrap/consumer regression.
 */
export async function probeRawRestoredSelections(iterations: number) {
  await initialize();
  const compiled = wasm.BreditorCompiledProfile.fromBootstrapJsonV2(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON);
  let profile: wasm.BreditorCompiledProfile | undefined;
  try { profile = compiled.takeProfile(); } finally { compiled.free(); }
  if (!profile) throw new Error("profile unavailable");
  const seeds: { checkpoint: string; expected: string }[] = [];
  try {
    const factory = profile.createEngineFromDocumentJsonV3("raw-selection-probe", createReferenceFormattingDocumentJson("Hello 🙂 world"), 20);
    let engine: wasm.BreditorEngine | undefined;
    try { engine = factory.takeEngine(); } finally { factory.free(); }
    if (!engine) throw new Error("seed unavailable");
    let observation = engine.observation();
    try {
      for (const offsets of [undefined, [0, 14], [14, 14], [14, 0]] as const) {
        if (offsets !== undefined) {
          const command = engine.setRangeSelection(observation, "text", 2, offsets[0], "before", "text", 2, offsets[1], "after");
          try {
            if (command.status !== "committed") throw new Error("seed selection rejected");
            const next = command.observation();
            if (!next) throw new Error("successor unavailable");
            observation.free(); observation = next;
          } finally { command.free(); }
        }
        const encoded = engine.sessionCheckpointJson();
        try {
          const checkpoint = encoded.takeValue();
          if (typeof checkpoint !== "string") throw new Error("checkpoint unavailable");
          const expected = {
            kind: offsets === undefined ? "none" : "range",
            anchorPointKind: offsets === undefined ? undefined : "text",
            anchorNodeIndex: offsets === undefined ? undefined : 2,
            anchorOffset: offsets?.[0],
            anchorAffinity: offsets === undefined ? undefined : "before",
            focusPointKind: offsets === undefined ? undefined : "text",
            focusNodeIndex: offsets === undefined ? undefined : 2,
            focusOffset: offsets?.[1],
            focusAffinity: offsets === undefined ? undefined : "after",
            rangeOrder: offsets === undefined ? undefined
              : offsets[0] === offsets[1] ? "collapsed"
              : offsets[0] < offsets[1] ? "forward" : "backward",
          };
          seeds.push({checkpoint, expected:encodeFields(expected)});
        } finally { encoded.free(); }
      }
    } finally { observation.free(); engine.free(); }
    let reads = 0;
    for (let iteration = 0; iteration < iterations; iteration++) {
      const seed = seeds[iteration % seeds.length]!;
      const factory = profile.createEngineFromSessionCheckpointJsonV3(seed.checkpoint);
      let engine: wasm.BreditorEngine | undefined;
      try { engine = factory.takeEngine(); } finally { factory.free(); }
      if (!engine) throw new Error(`restore unavailable ${iteration}`);
      const observation = engine.observation();
      try {
        for (let read = 0; read < 3; read++) {
          const result = engine.selection(observation);
          let view: wasm.BreditorSelection | undefined;
          try { view = result.takeSelection(); } finally { result.free(); }
          if (!view) throw new Error(`view unavailable ${iteration}/${read}`);
          try {
            const actual = encodeFields({
              kind:view.kind, anchorPointKind:view.anchorPointKind, anchorNodeIndex:view.anchorNodeIndex,
              anchorOffset:view.anchorOffset, anchorAffinity:view.anchorAffinity,
              focusPointKind:view.focusPointKind, focusNodeIndex:view.focusNodeIndex,
              focusOffset:view.focusOffset, focusAffinity:view.focusAffinity, rangeOrder:view.rangeOrder,
            });
            if (actual !== seed.expected) throw new Error(`raw selection differs ${iteration}/${read}: ${actual} expected ${seed.expected}`);
          } finally { view.free(); }
          reads++;
        }
      } finally { observation.free(); engine.free(); }
      if (iteration % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return {iterations, reads};
  } finally { profile.free(); }
}
