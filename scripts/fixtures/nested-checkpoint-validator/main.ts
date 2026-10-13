// Source-only diagnostic: no editor, DOM editing, Wasm or generated bindings.
import {sessionCheckpointJsonMatchesDurableContract} from "../../../packages/breditor-browser/src/wasm_session_checkpoint.ts";
import type {WasmDurableJsonContract} from "../../../packages/breditor-browser/src/wasm_document_json.ts";

const output = document.getElementById("result")!;
const schema = {name: "example/validator-probe", version: 1};
const fingerprint = `sha256:${"4".repeat(64)}`;
const contract: WasmDurableJsonContract = {mode: "v7", schema: {...schema, fingerprint}, formats: [
  {kind: "breditor/strong", revision: 1, properties: []},
  {kind: "example/link", revision: 1, properties: [
    {name: "example/href", presence: "required", valueType: {kind: "string", minimumUtf8Bytes: 1, maximumUtf8Bytes: 2048}},
    {name: "example/open-in-new-window", presence: "required", valueType: {kind: "boolean"}},
  ]},
  {kind: "example/text-color", revision: 1, properties: [
    {name: "example/rgb24", presence: "required", valueType: {kind: "integer", minimum: 0, maximum: 16777215}},
  ]},
]};
const formats = [
  {type: "breditor/strong", properties: {}},
  {type: "example/link", properties: {"example/href": "https://example.test/", "example/open-in-new-window": false}},
  {type: "example/text-color", properties: {"example/rgb24": 0x123456}},
];
const element = (type: string, children: unknown[], properties = {}) =>
  ({kind: "element", type: `breditor/${type}`, entityId: null, properties, children});
const text = (value: string) => ({kind: "text", text: value, formats});

function sample(items: number, cursor: number) {
  const root = element("document", [element("ordered-list", Array.from({length: items}, (_, i) => element("list-item", [
    element(i % 10 === 0 ? "heading" : "paragraph", [text(`Item ${i}: A🙂`)], i % 10 === 0 ? {"breditor/level": 2} : {}),
    ...(i % 10 === 0 ? [element("bullet-list", [element("list-item", [
      element("paragraph", [text(`Child ${i}`)]),
      element("ordered-list", [element("list-item", [element("paragraph", [text(`Grandchild ${i}`)])])], {"breditor/start": 4}),
    ])])] : []),
  ])), {"breditor/start": 7})]);
  const middle = Math.floor(Math.floor(items / 2) / 10) * 10;
  const block = [0, middle, 1, 0, 1, 0, 0], offset = `Grandchild ${middle}`.length;
  const point = {kind: "text", textPath: [...block, 0], utf16Offset: offset + 1, affinity: "after"};
  const replacement = {runs: [{text: "X", formats}]};
  const value = {format: "breditor/session-checkpoint", formatVersion: 7, schema, schemaFingerprint: fingerprint,
    historyBase: {format: "breditor/editor-state", formatVersion: 3, schema, schemaFingerprint: fingerprint,
      snapshot: {lineage: `validator-${items}`, revision: "0"},
      document: {format: "breditor/document", formatVersion: 2, schema, schemaFingerprint: fingerprint, root},
      selection: null, pendingFormats: null},
    currentRevision: cursor === 0 ? "3" : "4", historyCapacity: 20, cursor,
    entries: [{forwardOperations: [{kind: "nestedListTextSplice", block, start: offset, end: offset, expected: root, replacement}],
      resultSelection: {kind: "range", anchor: point, focus: point}, resultPendingFormats: null}], openMergeGroup: null};
  const valid = JSON.stringify(value);
  replacement.runs[0]!.formats = [{type: "example/text-color", properties: {"example/rgb24": 16777216}}];
  return {items, cursor, valid, validUtf8Bytes: new TextEncoder().encode(valid).length, invalid: JSON.stringify(value)};
}

let progress = "initialization", checks = 0;
try {
  const samples = [10, 100, 500].flatMap(items => [0, 1].map(cursor => sample(items, cursor)));
  for (let repetition = 0; repetition < 20; repetition++) {
    for (const item of samples) {
      progress = `${item.items} items, cursor ${item.cursor}, repetition ${repetition}`;
      const valid = sessionCheckpointJsonMatchesDurableContract(item.valid, contract);
      const invalid = sessionCheckpointJsonMatchesDurableContract(item.invalid, contract);
      if (valid !== item.validUtf8Bytes || invalid !== null) {
        // Synthetic corpus only; retain exact input for direct replay, not stdout.
        output.textContent = JSON.stringify({progress, checks, valid, expectedUtf8Bytes: item.validUtf8Bytes, invalid, contract,
          validCheckpoint: item.valid, invalidCheckpoint: item.invalid});
        output.dataset["status"] = "failed";
        throw new Error("validator corpus mismatch");
      }
      checks += 2;
    }
  }
  output.textContent = JSON.stringify({checks, sizes: [10, 100, 500], cursors: [0, 1], repetitions: 20});
  output.dataset["status"] = "passed";
} catch (error) {
  if (output.dataset["status"] !== "failed") output.textContent = JSON.stringify({progress, checks, error: String(error)});
  output.dataset["status"] = "failed";
}
