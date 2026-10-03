import initialize, * as wasm from "@breditor/wasm";
import { consumeWasmCompiledProfileDescriptor, consumeSemanticProjection, consumeSemanticProjectionUpdate,
  type BaseDocumentProjection, type BrowserCompiledProfileDescriptor } from "@breditor/browser/advanced";
import { REFERENCE_FORMATTING_IDS, REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  createReferenceFormattingDocumentJson } from "@breditor/reference-highlight";

/** Exercise the production descriptor/projection validators without a DOM owner.
 * Unlike the raw control, this does not pre-read the generated update metadata:
 * the production adapter owns its reads and cleanup exactly as in the editor.
 */
export async function probeAdaptedProjectionImpacts(iterations: number): Promise<string> {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1_000) throw new Error("invalid probe length");
  await initialize();
  const compiled = wasm.BreditorCompiledProfile.fromBootstrapJsonV2(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON);
  let profile: wasm.BreditorCompiledProfile | undefined;
  try { profile = compiled.takeProfile(); } finally { compiled.free(); }
  if (!profile) throw new Error("profile unavailable");
  let generation: wasm.BreditorProfileGeneration | undefined;
  let engine: wasm.BreditorEngine | undefined;
  let observation: wasm.BreditorObservation | undefined;
  let descriptor: BrowserCompiledProfileDescriptor | undefined;
  let base: BaseDocumentProjection | undefined;
  let cycle = -1;
  let stage = "setup";
  let updates = 0;
  function accept(command: wasm.BreditorCommandResult | wasm.BreditorIntentResult, href?: string) {
    try {
      if (command.status !== "committed") throw new Error("command did not commit");
      if (href !== undefined) {
        const view = command.projectionUpdate();
        if (!view) throw new Error("update unavailable");
        // Consuming the view transfers cleanup to the production adapter.
        const result = consumeSemanticProjectionUpdate(base!, view, generation!, descriptor!);
        if (!result.ok) throw new Error(`adapter rejected update: ${result.error.code}`);
        base = result.value.result;
        if (result.value.impact.kind !== "textContainers") throw new Error("unexpected impact");
        const runs = base.paragraphs[0]?.runs;
        const link = runs?.[0]?.formatDetails.find(format => format.kind === REFERENCE_FORMATTING_IDS.linkFormatKind);
        if (runs?.length !== 1 || runs[0]?.text !== "Hello" ||
            link?.properties.find(property => property.name === REFERENCE_FORMATTING_IDS.linkHrefProperty)?.value !== href ||
            !runs[0]?.formatDetails.some(format => format.kind === REFERENCE_FORMATTING_IDS.highlightFormatKind)) {
          throw new Error("projected text, Link history, or Highlight differs");
        }
        updates++;
      }
      const next = command.observation();
      if (!next) throw new Error("successor unavailable");
      observation?.free(); observation = next;
    } finally { command.free(); }
  }
  try {
    generation = profile.generation();
    const admitted = consumeWasmCompiledProfileDescriptor(generation, profile.descriptor());
    if (!admitted.ok) throw new Error("descriptor rejected");
    descriptor = admitted.descriptor;
    const initialHref = "https://example.test/reference";
    const factory = profile.createEngineFromDocumentJsonV3("adapted-impact-probe",
      createReferenceFormattingDocumentJson("Hello", { highlighted: true,
        link: { href: initialHref, openInNewWindow: false } }), 20);
    try { engine = factory.takeEngine(); } finally { factory.free(); }
    if (!engine) throw new Error("engine unavailable");
    observation = engine.observation();
    accept(engine.setRangeSelection(observation, "text", 2, 0, "before", "text", 2, 5, "after"));
    const initial = engine.projection(observation);
    let view: wasm.BreditorProjection | undefined;
    try { view = initial.takeProjection(); } finally { initial.free(); }
    if (!view) throw new Error("initial projection unavailable");
    const projected = consumeSemanticProjection(view, generation, descriptor);
    if (!projected.ok) throw new Error(`initial projection rejected: ${projected.error.code}`);
    base = projected.value;
    let priorHref = initialHref;
    for (cycle = 0; cycle < iterations; cycle++) {
      const href = `https://example.test/step/${cycle}`;
      stage = "apply";
      accept(engine.executeTypedIntentJson(observation!, REFERENCE_FORMATTING_IDS.linkIntentId,
        JSON.stringify({ operation: "set", properties: [
          { name: REFERENCE_FORMATTING_IDS.linkHrefProperty, value: href },
          { name: REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty, value: false },
        ] }), true), href);
      stage = "undo";
      accept(engine.undo(observation!, false), priorHref);
      stage = "redo";
      accept(engine.redo(observation!, false), href);
      priorHref = href;
    }
    return JSON.stringify({ format: "breditor/adapted-impact-probe", cycles: String(cycle), updates: String(updates) });
  } catch (error) {
    throw new Error(`adapted impact cycle=${cycle} stage=${stage}: ${error instanceof Error ? error.message : "unknown failure"}`, { cause: error });
  } finally {
    try { observation?.free(); } finally {
      try { engine?.free(); } finally {
        try { generation?.free(); } finally { profile.free(); }
      }
    }
  }
}
