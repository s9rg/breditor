// Real Wasm -> browser projection qualification, deliberately without editor DOM.
import { consumeFlatListSemanticProjection, consumeFlatListSemanticProjectionUpdateWithCleanup } from "../packages/breditor-browser/src/wasm_projection_adapter.ts";
import { consumeWasmCompiledProfileDescriptor } from "../packages/breditor-browser/src/wasm_profile_descriptor.ts";
import { consumeFlatListSemanticSelectionWithCleanup, flatListSemanticRangeSelectionScalars } from "../packages/breditor-browser/src/wasm_selection_adapter.ts";
import { projectFlatListPlainText } from "../packages/breditor-browser/src/projection_plain_text.ts";
import { FlatListRangeSelection } from "../packages/breditor-browser/src/flat_list_selection.ts";
import { verifyFlatListCommandAdapter } from "./flat-list-command-adapter-scenario.mjs";
import { consumeWasmDocumentJson, documentJsonMatchesFlatListProjection } from "../packages/breditor-browser/src/wasm_document_json.ts";
import { consumeWasmSessionCheckpoint, sessionCheckpointJsonMatchesDurableContract } from "../packages/breditor-browser/src/wasm_session_checkpoint.ts";
import { bootstrapFlatListWasmEngine, preflightFlatListWasmSemanticProfile,
  isOwnedBrowserFlatListWasmEngineBootstrapResult, isOwnedBrowserWasmEngineBootstrapResult } from "../packages/breditor-browser/src/wasm_engine_bootstrap.ts";

const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`projection mismatch: ${JSON.stringify(actual)}`);
};

export function runFlatListBrowserProjectionScenario(api, verifyDom) {
  const handles = [];
  const selections = new WeakMap();
  const transitions = [];
  const own = value => { if (!value) throw new Error("missing handle"); handles.push(value); return value; };
  const observation = engine => own(engine.observation());
  const committed = result => { own(result); equal(result.status, "committed"); };
  const json = result => { own(result); equal(result.status, "value"); return result.takeValue(); };
  const bootstrap = {format: "breditor/profile-bootstrap", formatVersion: 4,
    schema: {name: "example/list-browser-projection", version: 1}, extensions: []};
  const compile = () => {
    const result = own(api.BreditorCompiledProfile.fromBootstrapJsonV4(JSON.stringify(bootstrap)));
    equal(result.status, "profile");
    const profile = own(result.takeProfile());
    const generation = own(profile.generation());
    // This consuming boundary owns descriptor cleanup; do not free it twice.
    const descriptor = consumeWasmCompiledProfileDescriptor(generation, profile.descriptor());
    if (!descriptor.ok) throw new Error("descriptor rejected");
    return {profile, generation, descriptor: descriptor.descriptor};
  };
  // Mirror the owning adapter's handoff: capture the generated destructor once,
  // then let the consuming boundary own it. Never add these views to handles.
  const consumeSelection = (projection, view, generation) => {
    const cleanup = view.free.bind(view);
    return consumeFlatListSemanticSelectionWithCleanup(projection, view, cleanup, generation);
  };
  const project = (engine, owner) => {
    const result = own(engine.projection(observation(engine)));
    const projected = consumeFlatListSemanticProjection(result.takeProjection(), owner.generation, owner.descriptor);
    if (!projected.ok) throw new Error(`projection rejected: ${projected.error.code}`);
    if (!projected.value.matchesProfile(owner.generation, owner.descriptor)) throw new Error("owner mismatch");
    const selected = own(engine.selection(observation(engine)));
    const selection = consumeSelection(projected.value, selected.takeSelection(), owner.generation);
    if (!selection.ok) throw new Error(`selection rejected: ${selection.error.code}`);
    selections.set(projected.value, selection.value);
    const contract = {mode: "v6", schema: owner.descriptor.schema, formats: owner.descriptor.formats};
    const captured = consumeWasmDocumentJson(projected.value.snapshot, engine.documentJson(observation(engine)),
      [engine, owner.profile], contract);
    if (!captured.ok || !documentJsonMatchesFlatListProjection(captured.document.documentJson, projected.value, contract)) {
      throw new Error("exported list document does not match its browser projection");
    }
    const checkpoint = consumeWasmSessionCheckpoint(projected.value.snapshot, engine.sessionCheckpointJson(),
      [engine, owner.profile], contract);
    if (!checkpoint.ok) throw new Error(`list checkpoint rejected: ${checkpoint.error.code}`);
    return projected.value;
  };
  const transition = (base, command, engine, owner) => {
    committed(command);
    const view = command.projectionUpdate();
    const cleanup = view.free.bind(view);
    const changed = consumeFlatListSemanticProjectionUpdateWithCleanup(base, view, cleanup, owner.generation, owner.descriptor, [engine, owner.profile, command]);
    if (!changed.ok) throw new Error(`update rejected: ${changed.error.code}`);
    const result = changed.value.result;
    const selected = own(engine.selection(observation(engine)));
    const selection = consumeSelection(result, selected.takeSelection(), owner.generation);
    if (!selection.ok) throw new Error(`updated selection rejected: ${selection.error.code}`);
    transitions.push({update: changed.value, selection: selection.value});
    return result;
  };
  try {
    const owner = compile();
    const element = (type, children, properties = {}) => ({kind: "element", type: `breditor/${type}`, entityId: null, properties, children});
    const block = (text, rank) => element(rank ? "heading" : "paragraph", text ? [{kind: "text", text, formats: []}] : [], rank ? {"breditor/level": rank} : {});
    const item = value => element("list-item", [value]);
    const initial = {format: "breditor/document", formatVersion: 2, schema: bootstrap.schema,
      schemaFingerprint: owner.descriptor.schema.fingerprint,
      root: element("document", [block("Intro"), element("ordered-list", [item(block("A🙂", 2)), item(block("B"))], {"breditor/start": 8}), element("bullet-list", [item(block(""))])])};
    const created = own(owner.profile.createEngineFromDocumentJsonV6("list-projection", JSON.stringify(initial), 20));
    equal(created.status, "engine"); const engine = own(created.takeEngine());
    const before = project(engine, owner);
    equal(before.textBlocks.map(entry => entry.path), [[0], [1, 0, 0], [1, 1, 0], [2, 0, 0]]);
    equal(before.blocks.map(entry => entry.kind), ["textBlock", "orderedList", "bulletList"]);
    equal(before.blocks[1].start, 8); equal(before.blocks[1].items[0].headingLevel, 2);
    equal(selections.get(before), null);
    const plain = projectFlatListPlainText(before);
    if (!plain.ok) throw new Error("list plain-text export rejected");
    equal(plain.content, {text: "Intro\nA🙂\nB\n", utf8Bytes: 14, snapshot: before.snapshot});
    const point = {kind: "text", textPath: [1, 0, 0, 0], utf16Offset: 1, affinity: "before"};
    const requested = FlatListRangeSelection.create(before, {kind: "range", anchor: point, focus: point});
    if (!requested.ok) throw new Error("requested selection rejected");
    const scalar = flatListSemanticRangeSelectionScalars(requested.value);
    if (!scalar.ok) throw new Error("selection serialization rejected");
    const s = scalar.value;
    equal(s.anchorNodeIndex, 6);
    let current = transition(before, engine.setRangeSelection(observation(engine), s.anchorPointKind, s.anchorNodeIndex, s.anchorOffset, s.anchorAffinity,
      s.focusPointKind, s.focusNodeIndex, s.focusOffset, s.focusAffinity), engine, owner);
    current = transition(current, engine.executeStringAction(observation(engine), "breditor/insert-flat-list-plain-text", "x\ny", true), engine, owner);
    const after = project(engine, owner);
    equal(after.blocks[1].items.length, 3);
    equal(after.textBlocks.map(entry => entry.path), [[0], [1, 0, 0], [1, 1, 0], [1, 2, 0], [2, 0, 0]]);
    equal(after.textBlocks.map(entry => entry.block.runs.map(run => run.text).join("")), ["Intro", "Ax", "y🙂", "B", ""]);
    equal(selections.get(after).focus.textPath, [1, 1, 0, 0]);
    equal(selections.get(after).focus.utf16Offset, 1);
    equal(current.blocks, after.blocks);
    current = transition(current, engine.undo(observation(engine), false), engine, owner);
    equal(current.blocks, before.blocks);
    equal(project(engine, owner).blocks, before.blocks);
    const saved = json(engine.sessionCheckpointJson());
    const freshOwner = compile();
    const restoredResult = own(freshOwner.profile.createEngineFromSessionCheckpointJsonV6(saved));
    equal(restoredResult.status, "engine"); const restored = own(restoredResult.takeEngine());
    equal(project(restored, freshOwner).blocks, before.blocks);
    committed(restored.redo(observation(restored), false));
    equal(project(restored, freshOwner).blocks, after.blocks);
    // Held JS projections are immutable values, not borrowed Wasm memory.
    equal(before.blocks[1].items.length, 2);
    equal(before.matchesProfile(freshOwner.generation, freshOwner.descriptor), false);
    if (verifyDom !== undefined) verifyDom(before, after, owner, transitions);
    // Exercise every new recipe through browser preflight and then authoritative
    // Rust restore, including an unapplied redo branch in the saved history.
    committed(restored.executeStringAction(observation(restored), "breditor/insert-flat-list-text", "!", false));
    project(restored, freshOwner);
    committed(restored.executeNoInputAction(observation(restored), "breditor/wrap-bullet-list", false));
    const final = project(restored, freshOwner);
    const allRecipes = json(restored.sessionCheckpointJson());
    const kinds = new Set(JSON.parse(allRecipes).entries.flatMap(entry => entry.forwardOperations.map(op => op.kind)));
    for (const kind of ["flatListReframe", "flatListTextSplice", "flatListTextReplace"]) {
      if (!kinds.has(kind)) throw new Error(`missing generated recipe coverage: ${kind}`);
    }
    committed(restored.undo(observation(restored), false));
    const withRedo = json(restored.sessionCheckpointJson());
    const restoreOwner = compile();
    const durableContract = {mode: "v6", schema: restoreOwner.descriptor.schema, formats: restoreOwner.descriptor.formats};
    if (sessionCheckpointJsonMatchesDurableContract(withRedo, durableContract) === null) throw new Error("redo checkpoint rejected");
    const mismatch = JSON.parse(withRedo);
    mismatch.historyBase.document.root.children[1].children[0].children[0].children[0].text = "guard mismatch";
    const mismatchJson = JSON.stringify(mismatch);
    // Static shape admission is deliberately not a claim of replay success.
    if (sessionCheckpointJsonMatchesDurableContract(mismatchJson, durableContract) === null) throw new Error("static mismatch fixture rejected too early");
    const rejected = own(restoreOwner.profile.createEngineFromSessionCheckpointJsonV6(mismatchJson));
    equal(rejected.status, "error"); equal(rejected.takeEngine(), undefined);
    const recoveredResult = own(restoreOwner.profile.createEngineFromSessionCheckpointJsonV6(withRedo));
    equal(recoveredResult.status, "engine"); const recovered = own(recoveredResult.takeEngine());
    const recoveredBefore = project(recovered, restoreOwner), originalBefore = project(restored, freshOwner);
    equal(recoveredBefore.blocks, originalBefore.blocks);
    const endpoints = projected => {
      const selection = selections.get(projected);
      return selection === null ? null : {anchor: selection.anchor, focus: selection.focus};
    };
    equal(endpoints(recoveredBefore), endpoints(originalBefore));
    committed(recovered.redo(observation(recovered), false));
    const recoveredAfter = project(recovered, restoreOwner);
    equal(recoveredAfter.blocks, final.blocks);
    equal(endpoints(recoveredAfter), endpoints(final));
    const semanticProfile = {bootstrapJson: JSON.stringify(bootstrap), formatVersion: 4};
    if (verifyDom !== undefined) verifyFlatListCommandAdapter(api, semanticProfile, JSON.stringify(initial));
    const metadata = preflightFlatListWasmSemanticProfile(api, semanticProfile);
    if (!metadata.ok) throw new Error(`list metadata preflight rejected: ${metadata.error.code}`);
    equal(metadata.profileDescriptor, owner.descriptor);
    const boot = source => {
      const result = bootstrapFlatListWasmEngine(api, {...source, semanticProfile});
      if (!result.ok) throw new Error(`list bootstrap rejected: ${result.error.code}`);
      own(result.engine); own(result.profileGeneration); own(result.observation);
      equal(result.durableMode, "v6");
      equal(isOwnedBrowserFlatListWasmEngineBootstrapResult(result), true);
      equal(isOwnedBrowserWasmEngineBootstrapResult(result), false);
      return {result, owner: {generation: result.profileGeneration, descriptor: result.profileDescriptor}};
    };
    const freshBoot = boot({kind: "document", lineageId: "list-bootstrap", documentJson: JSON.stringify(initial), historyCapacity: 20});
    equal(freshBoot.result.projection.blocks, before.blocks);
    equal(project(freshBoot.result.engine, freshBoot.owner).blocks, before.blocks);
    const restoredBoot = boot({kind: "sessionCheckpoint", checkpointJson: withRedo});
    equal(restoredBoot.result.projection.blocks, originalBefore.blocks);
    equal(endpoints(project(restoredBoot.result.engine, restoredBoot.owner)), endpoints(originalBefore));
    committed(restoredBoot.result.engine.redo(observation(restoredBoot.result.engine), false));
    const bootAfter = project(restoredBoot.result.engine, restoredBoot.owner);
    equal(bootAfter.blocks, final.blocks); equal(endpoints(bootAfter), endpoints(final));
    return {status: "passed", scope: verifyDom === undefined
      ? "real Wasm list projection/selection/document and Session V6 recipes, explicit bootstrap and redo recovery; no DOM/native input"
      : "production list toolbar/controller/queue/adapter, synthetic clicks/beforeinput/keyboard echoes, exact undo/redo and Session V6 recovery; no physical input/IME/clipboard"};
  } finally {
    for (const handle of handles.reverse()) handle.free();
  }
}
