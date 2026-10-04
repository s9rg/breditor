// Shared real-Wasm scenario for Node and browser engines; no DOM dependency.
const assert = {
  ok(value) { if (!value) throw new Error("missing owned value"); },
  equal(actual, expected) { if (!Object.is(actual, expected)) throw new Error(`expected ${String(expected)}, got ${String(actual)}`); },
  deepEqual(actual, expected) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("structured values differ"); },
};

export function runFlatListWasmScenario(api) {
  const handles = [];
  const own = value => { assert.ok(value); handles.push(value); return value; };
  const json = result => { own(result); assert.equal(result.status, "value"); return JSON.parse(result.takeValue()); };
  const observe = e => own(e.observation());
  const state = e => json(e.stateJson());
  const commit = result => {
    own(result); assert.equal(result.status, "committed");
    const value = json(result.commitJson());
    assert.equal(value.formatVersion, 6); assert.equal(value.before.formatVersion, 3);
    return result;
  };
  const projection = e => own(own(e.projection(observe(e))).takeProjection());
  const compile = bootstrap => {
    const result = own(api.BreditorCompiledProfile.fromBootstrapJsonV4(JSON.stringify(bootstrap)));
    assert.equal(result.status, "profile"); return own(result.takeProfile());
  };
  try {
    const bootstrap = { format: "breditor/profile-bootstrap", formatVersion: 4,
      schema: {name: "example/list-wasm-smoke", version: 1}, extensions: [] };
    assert.equal(own(api.BreditorCompiledProfile.fromBootstrapJsonV3(JSON.stringify(bootstrap))).status, "error");
    const profile = compile(bootstrap);
    const descriptor = own(profile.descriptor());
    assert.equal(descriptor.intentCount, 12); assert.equal(descriptor.actionStateCount, 14);
    const initial = { format: "breditor/document", formatVersion: 2, schema: bootstrap.schema,
      schemaFingerprint: descriptor.schemaFingerprint,
      root: {kind: "element", type: "breditor/document", entityId: null, properties: {}, children: [
        {kind: "element", type: "breditor/ordered-list", entityId: null, properties: {"breditor/start": 8}, children: [
          {kind: "element", type: "breditor/list-item", entityId: null, properties: {}, children: [
            {kind: "element", type: "breditor/heading", entityId: null, properties: {"breditor/level": 2}, children: [
              {kind: "text", text: "abc", formats: []}]}]}]}]} };
    const created = own(profile.createEngineFromDocumentJsonV6("list-smoke", JSON.stringify(initial), 20));
    assert.equal(created.status, "engine"); const e = own(created.takeEngine());
    const held = projection(e);
    for (let repeat = 0; repeat < 1000; repeat++) {
      assert.equal(held.listKind(1), "ordered"); assert.equal(held.orderedListStart(1), 8);
      assert.equal(held.headingLevel(3), 2);
      for (const index of [0, 2, 3, 4, 5, 0xffffffff]) {
        assert.equal(held.listKind(index), undefined); assert.equal(held.orderedListStart(index), undefined);
      }
    }
    commit(e.setRangeSelection(observe(e), "text", 4, 1, "before", "text", 4, 1, "before"));
    commit(e.executeStringAction(observe(e), "breditor/insert-flat-list-text", "🙂", false));
    const typed = state(e);
    commit(e.executeStringAction(observe(e), "breditor/insert-flat-list-plain-text", "x\r\ny", true));
    const pasted = state(e);
    assert.equal(pasted.document.root.children[0].children.length, 2);
    assert.equal(pasted.document.root.children[0].properties["breditor/start"], 8);
    commit(e.undo(observe(e), false));
    assert.deepEqual(state(e).selection, typed.selection);
    const saved = json(e.sessionCheckpointJson()); assert.equal(saved.formatVersion, 6);
    assert.equal(own(profile.createEngineFromSessionCheckpointJsonV5(JSON.stringify(saved))).status, "error");
    const independent = compile(bootstrap);
    const restoredResult = own(independent.createEngineFromSessionCheckpointJsonV6(JSON.stringify(saved)));
    assert.equal(restoredResult.status, "engine"); const restored = own(restoredResult.takeEngine());
    assert.deepEqual(json(restored.sessionCheckpointJson()), saved);
    assert.equal(own(restored.redo(observe(e), false)).status, "error");
    commit(restored.redo(observe(restored), false));
    assert.deepEqual(state(restored).document, pasted.document);
    assert.deepEqual(state(restored).selection, pasted.selection);
    commit(restored.executeNoInputAction(observe(restored), "breditor/wrap-bullet-list", false));
    const bullet = projection(restored);
    assert.equal(bullet.listKind(1), "ordered"); // Untouched first item retains numbering.
    assert.equal(bullet.orderedListStart(1), 8);
    const types = [];
    for (let index = 0; index < bullet.nodeCount; index++) if (bullet.listKind(index)) types.push([bullet.listKind(index), bullet.orderedListStart(index)]);
    assert.deepEqual(types, [["ordered", 8], ["bullet", undefined]]);
    commit(restored.executeNoInputAction(observe(restored), "breditor/unwrap-list", false));
    commit(restored.executeNoInputAction(observe(restored), "breditor/toggle-flat-list-strong", false));
    assert.ok(state(restored).pendingFormats.length > 0);
    assert.equal(held.listKind(1), "ordered"); assert.equal(held.orderedListStart(1), 8);
    assert.deepEqual(json(e.documentJson(observe(e))).root, typed.document.root);
    return { status: "passed", scope: "raw Wasm list commands, metadata and recovery; not DOM or native input" };
  } finally {
    for (const handle of handles.reverse()) handle.free();
  }
}
