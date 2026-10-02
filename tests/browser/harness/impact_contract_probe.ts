import initialize, * as wasm from "@breditor/wasm";
import { REFERENCE_FORMATTING_IDS, REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  createReferenceFormattingDocumentJson } from "@breditor/reference-highlight";
import { snapshotImpactRejection } from "../diagnostics/impact_rejection_snapshot";

/** Isolate real Link Apply/Undo/Redo metadata from DOM, toolbar, queue and timers.
 * One owner stays warm beyond its history capacity. This deliberately different
 * workload complements the editor reproduction; passing it cannot close that bug.
 */
export async function probeRawProjectionImpacts(iterations: number): Promise<string> {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1_000) throw new Error("invalid probe length");
  await initialize();
  const compiled = wasm.BreditorCompiledProfile.fromBootstrapJsonV2(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON);
  let profile: wasm.BreditorCompiledProfile | undefined;
  try { profile = compiled.takeProfile(); } finally { compiled.free(); }
  if (!profile) throw new Error("profile unavailable");
  let engine: wasm.BreditorEngine | undefined;
  let observation: wasm.BreditorObservation | undefined;
  let updates = 0;
  let cycle = -1;
  let stage = "setup";
  function check(update: wasm.BreditorProjectionUpdate) {
    // Read every generated field once. Diagnostics inspect only this local copy.
    const snapshot = {
      impact: update.impact, affectedParagraphCount: update.affectedParagraphCount,
      oldChildStart: update.oldChildStart, oldChildEnd: update.oldChildEnd,
      newChildStart: update.newChildStart, newChildEnd: update.newChildEnd,
    };
    if (snapshot.impact !== "textContainers" || snapshot.affectedParagraphCount !== 1 ||
        snapshot.oldChildStart !== undefined || snapshot.oldChildEnd !== undefined ||
        snapshot.newChildStart !== undefined || snapshot.newChildEnd !== undefined) {
      throw new Error(`impact metadata: ${JSON.stringify(snapshotImpactRejection(snapshot, snapshot.affectedParagraphCount))}`);
    }
    const first = update.affectedParagraphIndex(0);
    const end = update.affectedParagraphIndex(1);
    if (first !== 0 || end !== undefined) throw new Error("affected paragraph index mismatch");
  }
  function accept(command: wasm.BreditorCommandResult | wasm.BreditorIntentResult, inspect: boolean) {
    try {
      if (command.status !== "committed") throw new Error("command did not commit");
      if (inspect) {
        const update = command.projectionUpdate();
        if (!update) throw new Error("update unavailable");
        let child: wasm.BreditorProjection | undefined;
        try {
          check(update);
          child = update.takeProjection();
          if (!child) throw new Error("child unavailable");
          if (update.takeProjection() !== undefined) throw new Error("child transferred twice");
          check(update);
          updates++;
        } finally {
          try { child?.free(); } finally { update.free(); }
        }
      }
      const next = command.observation();
      if (!next) throw new Error("successor unavailable");
      observation?.free();
      observation = next;
    } finally { command.free(); }
  }
  try {
    const factory = profile.createEngineFromDocumentJsonV3("raw-impact-probe",
      createReferenceFormattingDocumentJson("Hello", { highlighted: true,
        link: { href: "https://example.test/reference", openInNewWindow: false } }), 20);
    try { engine = factory.takeEngine(); } finally { factory.free(); }
    if (!engine) throw new Error("engine unavailable");
    observation = engine.observation();
    accept(engine.setRangeSelection(observation, "text", 2, 0, "before", "text", 2, 5, "after"), false);
    for (cycle = 0; cycle < iterations; cycle++) {
      stage = "apply";
      accept(engine.executeTypedIntentJson(observation!, REFERENCE_FORMATTING_IDS.linkIntentId,
        JSON.stringify({ operation: "set", properties: [
          { name: REFERENCE_FORMATTING_IDS.linkHrefProperty, value: `https://example.test/step/${cycle}` },
          { name: REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty, value: false },
        ] }), true), true);
      stage = "undo";
      accept(engine.undo(observation!, false), true);
      stage = "redo";
      accept(engine.redo(observation!, false), true);
    }
    // Text transport avoids the independently observed numeric serializer issue.
    return JSON.stringify({ format: "breditor/raw-impact-probe", cycles: String(cycle), updates: String(updates) });
  } catch (error) {
    throw new Error(`raw impact cycle=${cycle} stage=${stage}: ${error instanceof Error ? error.message : "unknown failure"}`, { cause: error });
  } finally {
    try { observation?.free(); } finally {
      try { engine?.free(); } finally { profile.free(); }
    }
  }
}
