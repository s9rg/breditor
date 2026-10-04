// Real Wasm -> browser projection qualification, deliberately without editor DOM.
import { consumeFlatListSemanticProjection } from "../packages/breditor-browser/src/wasm_projection_adapter.ts";
import { consumeWasmCompiledProfileDescriptor } from "../packages/breditor-browser/src/wasm_profile_descriptor.ts";

const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`projection mismatch: ${JSON.stringify(actual)}`);
};

export function runFlatListBrowserProjectionScenario(api) {
  const handles = [];
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
  const project = (engine, owner) => {
    const result = own(engine.projection(observation(engine)));
    const projected = consumeFlatListSemanticProjection(result.takeProjection(), owner.generation, owner.descriptor);
    if (!projected.ok) throw new Error(`projection rejected: ${projected.error.code}`);
    if (!projected.value.matchesProfile(owner.generation, owner.descriptor)) throw new Error("owner mismatch");
    return projected.value;
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
    committed(engine.setRangeSelection(observation(engine), "text", 6, 1, "before", "text", 6, 1, "before"));
    committed(engine.executeStringAction(observation(engine), "breditor/insert-flat-list-plain-text", "x\ny", true));
    const after = project(engine, owner);
    equal(after.blocks[1].items.length, 3);
    equal(after.textBlocks.map(entry => entry.path), [[0], [1, 0, 0], [1, 1, 0], [1, 2, 0], [2, 0, 0]]);
    equal(after.textBlocks.map(entry => entry.block.runs.map(run => run.text).join("")), ["Intro", "Ax", "y🙂", "B", ""]);
    committed(engine.undo(observation(engine), false));
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
    return {status: "passed", scope: "real Wasm to hierarchical browser projection, list paste/undo and fresh-owner redo; no DOM/native input"};
  } finally {
    for (const handle of handles.reverse()) handle.free();
  }
}
