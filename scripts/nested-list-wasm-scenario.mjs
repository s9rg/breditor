// Real generated-Wasm scenario shared by Node and browser qualification.
// It does not establish native clipboard, IME or assistive-technology support.
export function runNestedListWasmScenario(api) {
  const handles = [];
  const check = (value, message) => { if (!value) throw new Error(message); };
  const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message);
  const own = value => { check(value, "missing generated owner"); handles.push(value); return value; };
  const json = result => { own(result); check(result.status === "value", "JSON result rejected"); return JSON.parse(result.takeValue()); };
  const observe = engine => own(engine.observation());
  const state = engine => json(engine.stateJson());
  const commit = result => {
    own(result); check(result.status === "committed", `command status: ${result.status}`);
    const value = json(result.commitJson());
    check(value.formatVersion === 7 && value.before.formatVersion === 3, "wrong commit/state codec");
    return value;
  };
  const bootstrap = {format: "breditor/profile-bootstrap", formatVersion: 5,
    schema: {name: "example/nested-list-smoke", version: 1}, extensions: []};
  const compile = () => {
    const result = own(api.BreditorCompiledProfile.fromBootstrapJsonV5(JSON.stringify(bootstrap)));
    check(result.status === "profile", "nested profile rejected"); return own(result.takeProfile());
  };
  const element = (type, children, properties = {}) => ({kind: "element", type: `breditor/${type}`, entityId: null, properties, children});
  const paragraph = text => element("paragraph", [{kind: "text", text, formats: []}]);
  const selectText = (engine, text, offset) => {
    const read = own(engine.projection(observe(engine))), projection = own(read.takeProjection());
    let index = -1;
    for (let i = 0; i < projection.nodeCount; i++) if (projection.text(i) === text) { index = i; break; }
    check(index >= 0, `text missing: ${text}`);
    commit(engine.setRangeSelection(observe(engine), "text", index, offset, "after", "text", index, offset, "after"));
  };
  const intent = (engine, id) => commit(engine.executeNoInputIntent(observe(engine), `breditor/${id}`, true));
  try {
    const profile = compile(), descriptor = own(profile.descriptor());
    check(descriptor.intentCount === 14 && descriptor.actionStateCount === 16, "nested profile catalog changed");
    const initial = {format: "breditor/document", formatVersion: 2, schema: bootstrap.schema,
      schemaFingerprint: descriptor.schemaFingerprint,
      root: element("document", [element("bullet-list", [element("list-item", [paragraph("one")]),
        element("list-item", [paragraph("two"), element("ordered-list", [element("list-item", [paragraph("child")])], {"breditor/start": 8})])])])};
    const created = own(profile.createEngineFromDocumentJsonV7("nested-smoke", JSON.stringify(initial), 50));
    check(created.status === "engine", "engine rejected"); const engine = own(created.takeEngine());
    selectText(engine, "two", 1);
    const before = state(engine);
    intent(engine, "indent-list-items");
    const indented = state(engine);
    check(indented.document.root.children[0].children.length === 1, "indent did not nest sibling");
    check(indented.selection.anchor.textPath.length > before.selection.anchor.textPath.length, "selection did not follow nesting");
    commit(engine.undo(observe(engine), false));
    same(state(engine).document, before.document, "indent undo document mismatch");
    same(state(engine).selection, before.selection, "indent undo selection mismatch");
    const saved = json(engine.sessionCheckpointJson()); check(saved.formatVersion === 7, "wrong session codec");
    check(own(profile.createEngineFromSessionCheckpointJsonV6(JSON.stringify(saved))).status === "error", "V6 admitted V7 session");
    const independent = compile(), restoredResult = own(independent.createEngineFromSessionCheckpointJsonV7(JSON.stringify(saved)));
    check(restoredResult.status === "engine", "restore rejected"); const restored = own(restoredResult.takeEngine());
    same(json(restored.sessionCheckpointJson()), saved, "checkpoint roundtrip mismatch");
    commit(restored.redo(observe(restored), false));
    same(state(restored).document, indented.document, "restored redo document mismatch");
    same(state(restored).selection, indented.selection, "restored redo selection mismatch");
    intent(restored, "outdent-list-items");
    same(state(restored).document, before.document, "outdent document mismatch");
    selectText(restored, "child", 5);
    commit(restored.executeStringAction(observe(restored), "breditor/insert-nested-list-text", "🙂", true));
    const typed = state(restored);
    commit(restored.executeStringAction(observe(restored), "breditor/insert-nested-list-plain-text", "日本\r\nnext", true));
    const pasted = state(restored);
    commit(restored.undo(observe(restored), false));
    same(state(restored).document, typed.document, "paste undo document mismatch");
    same(state(restored).selection, typed.selection, "paste undo selection mismatch");
    commit(restored.redo(observe(restored), false));
    same(state(restored).document, pasted.document, "paste redo document mismatch");
    same(state(restored).selection, pasted.selection, "paste redo selection mismatch");
    return {status: "passed", scope: "real generated nested Wasm: indent/outdent, deep typing/paste, V7 commit export, exact undo/redo selection and fresh-owner redo recovery"};
  } finally {
    for (const handle of handles.reverse()) handle.free();
  }
}
