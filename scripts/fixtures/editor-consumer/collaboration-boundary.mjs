/** Direct installed collaboration, paired Wasm and original journal admission. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as collaboration from "@breditor/collaboration";
import * as shared from "@breditor/editor/collaboration";
import * as local from "@breditor/editor";
import * as sharedWasm from "@breditor/collaboration/wasm";

const require = createRequire(import.meta.url);
assert.throws(() => require.resolve("react"), { code: "MODULE_NOT_FOUND" });
await assert.rejects(import("@breditor/editor/collaboration/react"), {
  code: "ERR_MODULE_NOT_FOUND", message: /Cannot find package 'react'/,
});

const installed = new URL("node_modules/@breditor/collaboration/", import.meta.url);
const packagePath = fileURLToPath(installed).replace(/\/$/, "");
assert.equal(realpathSync(packagePath), packagePath);
const manifest = JSON.parse(readFileSync(new URL("package.json", installed), "utf8"));
assert.deepEqual(Object.keys(manifest.exports).sort(), [".", "./wasm", "./wasm-binary"]);
for (const route of [".", "./wasm"]) {
  assert.deepEqual(Object.keys(manifest.exports[route]).sort(), ["import", "types"]);
}
await assert.rejects(import("@breditor/collaboration/dist/runtime/breditor_shared.js"), {
  code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
});

for (const [key, value] of Object.entries(collaboration)) {
  assert.equal(shared[key], value, `The editor facade must share ${key} with the direct package`);
}
const binaryUrl = new URL(import.meta.resolve("@breditor/collaboration/wasm-binary"));
const moduleUrl = new URL(import.meta.resolve("@breditor/collaboration/wasm"));
assert.equal(binaryUrl.href, new URL(manifest.exports["./wasm-binary"], installed).href);
assert.equal(moduleUrl.href, new URL(manifest.exports["./wasm"].import, installed).href);
const binary = readFileSync(binaryUrl);
assert.equal(await shared.initializeSharedRuntime(binary), sharedWasm);
await local.initializeLocalRuntime(readFileSync(new URL(import.meta.resolve("@breditor/experimental-rich-content/wasm-binary"))));

const profiles = [
  [1, 11, 12, "47138ee18a5bf8e52acc9efac1ffe19b1225fceb4a969fbb0e6ee00593cbe33d",
    local.createLocalProfile, collaboration.compileStandardSharedProfileV1, shared.standardSharedProfileConfiguration],
  [2, 12, 13, "889f613e8f84447fbe3569a0eb33da182a7995d4a4c003e50ccc73c1255e7cf1",
    local.createStructuralLocalProfileV2, collaboration.compileStandardStructuralSharedProfileV2, shared.structuralSharedProfileConfigurationV2],
  [3, 13, 14, "928ec93ffaa1b2a593bbe8eb6b2a494e40eefd5037cada7c82eb72bcb6153762",
    local.createLayoutLocalProfileV3, collaboration.compileStandardLayoutSharedProfileV3, shared.layoutSharedProfileConfigurationV3],
  [4, 14, 15, "7ac98189f850119abd83956f49b82fdbdcc91a77033781fbde090ba931fccc77",
    local.createLocalProfileV4, collaboration.compileStandardRichSharedProfileV4, shared.richSharedProfileConfigurationV4],
];

function apply(owner, action) {
  const observation = owner.observe();
  try { assert.equal(action(observation), true); }
  finally { observation.free(); }
}

const readers = [];
let crossLanguageRefusals = 0;
const bindings = [];
try {
  for (const [language, modelVersion, journalVersion, fingerprint, compileLocal, compileShared, configuration] of profiles) {
    assert.equal(configuration.formatVersion, language);
    const schema = { name: "breditor-editor/standard", version: language };
    const localProfile = await compileLocal();
    readers.push({ localProfile });
    const sharedProfile = compileShared(sharedWasm, configuration);
    const reader = readers.at(-1);
    reader.sharedProfile = sharedProfile;
    const { abiVersion, modelVersion: model, journalVersion: journal, schema: sharedSchema, schemaFingerprint } =
      JSON.parse(sharedProfile.descriptor_json());
    assert.deepEqual([abiVersion, model, journal], [1, modelVersion, journalVersion]);
    assert.deepEqual(sharedSchema, schema);
    assert.equal(schemaFingerprint, `sha256:${fingerprint}`);
    const localDescriptor = localProfile.descriptor();
    assert.deepEqual(localDescriptor.schema, schema);
    assert.equal(localDescriptor.schemaFingerprint, schemaFingerprint);
    bindings.push({ language, abiVersion, modelVersion, journalVersion, schemaFingerprint });

    reader.room = `stock-language-${language}`;
    const owner = sharedProfile.create(local.emptyDocumentJson(localDescriptor, reader.room, "p"), "101");
    try {
      apply(owner, observation => owner.dispatch(observation, JSON.stringify({ commands: [
        { kind: "insert_text", data: { block: "p", offset: 0, text: `language ${language}` } },
      ] })));
      reader.edited = owner.document_json();
      apply(owner, observation => owner.undo_observed(observation));
      reader.checkpoint = owner.checkpoint();
      assert.equal(JSON.parse(reader.checkpoint).version, journalVersion);
    } finally {
      owner.free();
    }
  }

  for (const source of readers) {
    for (const reader of readers) {
      if (reader !== source) {
        assert.throws(() => reader.sharedProfile.restore(source.room, source.checkpoint), /rich replica journal version/);
        crossLanguageRefusals++;
        continue;
      }
      const owner = reader.sharedProfile.restore(source.room, source.checkpoint);
      try {
        assert.equal(owner.checkpoint(), source.checkpoint);
        assert.equal(owner.redo_count(), 1);
        apply(owner, observation => owner.redo_observed(observation));
        assert.equal(owner.document_json(), source.edited);
      } finally {
        owner.free();
      }
    }
  }
} finally {
  for (const { sharedProfile, localProfile } of readers.reverse()) {
    sharedProfile?.free();
    localProfile.dispose();
  }
}

console.log(JSON.stringify({ bindings, crossLanguageRefusals, exactColdRestores: profiles.length,
  matchingFacadeValues: Object.keys(collaboration).length, privatePathRefusals: 1, sharedWithoutReact: true,
  sharedWasmSha256: createHash("sha256").update(binary).digest("hex") }));
