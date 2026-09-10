import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { IDBFactory } from "fake-indexeddb";
import { JSDOM } from "jsdom";

const [modulePath, wasmPath, browserModulePath] = process.argv.slice(2);
if (modulePath === undefined || wasmPath === undefined || browserModulePath === undefined) {
  throw new Error(
    "usage: generated_web_glue.mjs <generated-module.mjs> <generated-bg.wasm> <browser-module.js>",
  );
}

const api = await import(pathToFileURL(modulePath).href);
const browser = await import(pathToFileURL(browserModulePath).href);
api.initSync({ module: readFileSync(wasmPath) });

const EMPTY_DOCUMENT_JSON = JSON.stringify({
  format: "breditor/document",
  formatVersion: 1,
  schema: { name: "breditor/base", version: 1 },
  root: {
    kind: "element",
    type: "breditor/document",
    entityId: null,
    properties: {},
    children: [
      {
        kind: "element",
        type: "breditor/paragraph",
        entityId: null,
        properties: {},
        children: [],
      },
    ],
  },
});

const SELECTED_CHECKPOINT_JSON =
  '{"format":"breditor/session-checkpoint","formatVersion":1,"historyBase":{"format":"breditor/editor-state","formatVersion":1,"snapshot":{"lineage":"web-glue-projection-update","revision":"0"},"document":{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[{"kind":"text","text":"a","formats":[]}]}]}},"selection":{"kind":"range","anchor":{"kind":"text","textPath":[0,0],"utf16Offset":1,"affinity":"after"},"focus":{"kind":"text","textPath":[0,0],"utf16Offset":1,"affinity":"after"}},"pendingFormats":null},"currentRevision":"0","historyCapacity":100,"cursor":0,"entries":[],"openMergeGroup":null}';

const PROFILE_BOOTSTRAP_JSON = JSON.stringify({
  format: "breditor/profile-bootstrap",
  formatVersion: 1,
  schema: { name: "example/editor", version: 1 },
  extensions: [
    {
      id: { name: "example/highlight-extension", version: 1 },
      dependencies: [],
      conflicts: [],
      inlineFormats: [{ kind: "example/highlight", revision: 7 }],
      inlineFormatToggles: [
        {
          formatKind: "example/highlight",
          actionId: "example/toggle-highlight",
          intentId: "example/toggle-highlight-intent",
          bindingId: "example/toggle-highlight-binding",
          actionStateId: "example/highlight-control",
        },
      ],
    },
  ],
});

const PROFILE_INTENT = "example/toggle-highlight-intent";

const TYPED_PROFILE_BOOTSTRAP_JSON = JSON.stringify({
  format: "breditor/profile-bootstrap",
  formatVersion: 2,
  schema: { name: "example/link-editor", version: 1 },
  extensions: [{
    id: { name: "example/link-extension", version: 1 },
    dependencies: [],
    conflicts: [],
    inlineFormats: [{ kind: "example/link", revision: 1 }],
    inlineFormatPropertyContracts: [{
      formatKind: "example/link",
      properties: [
        {
          name: "example/href",
          presence: "required",
          valueType: {
            kind: "string",
            minimumUtf8Bytes: 1,
            maximumUtf8Bytes: 2_048,
          },
        },
        {
          name: "example/open",
          presence: "optional",
          valueType: { kind: "boolean" },
        },
        {
          name: "example/rank",
          presence: "optional",
          valueType: { kind: "integer", minimum: -10, maximum: 10 },
        },
      ],
    }],
    inlineFormatToggles: [],
    inlineFormatSets: [{
      formatKind: "example/link",
      actionId: "example/set-link",
      intentId: "example/set-link-intent",
      bindingId: "example/set-link-binding",
      actionStateId: "example/link-presence",
    }],
  }],
});

// The browser intentionally renders property-bearing formats only through a
// closed policy whose semantic descriptor is exact. Keep this profile separate
// from the broader typed ABI fixture above, which also exercises optional and
// integer properties that no built-in DOM policy claims to present.
const SAFE_LINK_PROFILE_BOOTSTRAP_JSON = JSON.stringify({
  format: "breditor/profile-bootstrap",
  formatVersion: 2,
  schema: { name: "example/safe-link-editor", version: 1 },
  extensions: [{
    id: { name: "example/safe-highlight-extension", version: 1 },
    dependencies: [],
    conflicts: [],
    inlineFormats: [{ kind: "example/highlight", revision: 1 }],
    inlineFormatPropertyContracts: [],
    inlineFormatToggles: [{
      formatKind: "example/highlight",
      actionId: "example/toggle-highlight",
      intentId: "example/toggle-highlight-intent",
      bindingId: "example/toggle-highlight-binding",
      actionStateId: "example/highlight-presence",
    }],
    inlineFormatSets: [],
  }, {
    id: { name: "example/safe-link-extension", version: 1 },
    dependencies: [],
    conflicts: [],
    inlineFormats: [{ kind: "example/link", revision: 1 }],
    inlineFormatPropertyContracts: [{
      formatKind: "example/link",
      properties: [
        {
          name: "example/href",
          presence: "required",
          valueType: {
            kind: "string",
            minimumUtf8Bytes: 1,
            maximumUtf8Bytes: 2_048,
          },
        },
        {
          name: "example/open",
          presence: "required",
          valueType: { kind: "boolean" },
        },
      ],
    }],
    inlineFormatToggles: [],
    inlineFormatSets: [{
      formatKind: "example/link",
      actionId: "example/set-link",
      intentId: "example/set-link-intent",
      bindingId: "example/set-link-binding",
      actionStateId: "example/link-presence",
    }],
  }],
});

function profileDocument(descriptor, text) {
  return {
    format: "breditor/document",
    formatVersion: 2,
    schema: {
      name: descriptor.schemaName,
      version: descriptor.schemaVersion,
    },
    schemaFingerprint: descriptor.schemaFingerprint,
    root: {
      kind: "element",
      type: "breditor/document",
      entityId: null,
      properties: {},
      children: [
        {
          kind: "element",
          type: "breditor/paragraph",
          entityId: null,
          properties: {},
          children: [{ kind: "text", text, formats: [] }],
        },
      ],
    },
  };
}

function profileCheckpoint(descriptor, lineage, text) {
  const document = profileDocument(descriptor, text);
  return JSON.stringify({
    format: "breditor/session-checkpoint",
    formatVersion: 2,
    schema: document.schema,
    schemaFingerprint: document.schemaFingerprint,
    historyBase: {
      format: "breditor/editor-state",
      formatVersion: 2,
      schema: document.schema,
      schemaFingerprint: document.schemaFingerprint,
      snapshot: { lineage, revision: "0" },
      document,
      selection: {
        kind: "range",
        anchor: {
          kind: "text",
          textPath: [0, 0],
          utf16Offset: 0,
          affinity: "before",
        },
        focus: {
          kind: "text",
          textPath: [0, 0],
          utf16Offset: text.length,
          affinity: "after",
        },
      },
      pendingFormats: null,
    },
    currentRevision: "0",
    historyCapacity: 100,
    cursor: 0,
    entries: [],
    openMergeGroup: null,
  });
}

function takeEngine(lineage, capacity = 2) {
  const result = api.BreditorEngine.fromDocumentJson(
    lineage,
    EMPTY_DOCUMENT_JSON,
    capacity,
  );
  assert.equal(result.status, "engine");
  const engine = result.takeEngine();
  assert.ok(engine instanceof api.BreditorEngine);
  assert.equal(result.status, "taken");
  assert.equal(result.takeEngine(), undefined);
  result.free();
  const observation = engine.observation();
  assert.equal(observation.snapshotRevision, "0");
  observation.free();
  return engine;
}

function takeString(result) {
  assert.equal(result.status, "value");
  const value = result.takeValue();
  assert.equal(typeof value, "string");
  assert.equal(result.status, "taken");
  assert.equal(result.takeValue(), undefined);
  result.free();
  return value;
}

function readCorrelatedActionStates(engine, observation, generation, descriptor) {
  const read = browser.consumeWasmActionStates(
    {
      lineage: observation.snapshotLineage,
      revision: observation.snapshotRevision,
    },
    engine.actionStates(observation),
    generation,
    [observation, engine],
  );
  assert.equal(read.ok, true);
  const correlated = browser.correlateBrowserActionStatesWithProfileDescriptor(
    descriptor,
    read,
  );
  assert.equal(correlated.ok, true);
  assert.strictEqual(correlated, read);
  return correlated;
}

function assertCommandError(result, expectedCode) {
  assert.equal(result.status, "error");
  assert.equal(result.observation(), undefined);
  assert.equal(result.eventKind, undefined);
  assert.equal(result.projectionUpdate(), undefined);
  const error = result.error;
  assert.ok(error instanceof api.BreditorError);
  result.free();
  assert.equal(error.code, expectedCode);
  error.free();
}

assert.equal(api.breditorWasmAbiVersion(), "5");
assert.match(
  api.breditorVersion(),
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
);

const invalidProfileResult =
  api.BreditorCompiledProfile.fromBootstrapJson("private-invalid-profile");
assert.equal(invalidProfileResult.status, "error");
assert.equal(invalidProfileResult.takeProfile(), undefined);
const invalidProfileError = invalidProfileResult.error;
assert.ok(invalidProfileError instanceof api.BreditorError);
invalidProfileResult.free();
assert.equal(
  invalidProfileError.code,
  "breditor_wasm.invalid_profile_bootstrap",
);
assert.doesNotMatch(invalidProfileError.message, /private-invalid-profile/);
invalidProfileError.free();

const profileResult =
  api.BreditorCompiledProfile.fromBootstrapJson(PROFILE_BOOTSTRAP_JSON);
assert.equal(profileResult.status, "profile");
assert.equal(profileResult.error, undefined);
const profile = profileResult.takeProfile();
assert.ok(profile instanceof api.BreditorCompiledProfile);
assert.equal(profileResult.status, "taken");
assert.equal(profileResult.takeProfile(), undefined);
profileResult.free();

const profileGeneration = profile.generation();
const profileGenerationCopy = profile.generation();
assert.ok(profileGeneration.matches(profileGenerationCopy));
assert.ok(profile.matchesProfileGeneration(profileGeneration));
profileGenerationCopy.free();

const profileDescriptor = profile.descriptor();
assert.ok(profileDescriptor.matchesProfileGeneration(profileGeneration));
assert.equal(profileDescriptor.schemaName, "example/editor");
assert.equal(profileDescriptor.schemaVersion, 1);
assert.match(profileDescriptor.schemaFingerprint, /^sha256:[0-9a-f]{64}$/);
assert.equal(profileDescriptor.formatCount, 2);
assert.equal(profileDescriptor.formatKind(0), "breditor/strong");
assert.equal(profileDescriptor.formatRevision(0), 1);
assert.equal(profileDescriptor.formatKind(1), "example/highlight");
assert.equal(profileDescriptor.formatRevision(1), 7);
assert.equal(profileDescriptor.formatKind(2), undefined);
assert.equal(profileDescriptor.intentCount, 2);
assert.equal(profileDescriptor.intentId(0), "breditor/format-strong");
assert.equal(profileDescriptor.intentInputKind(0), "none");
assert.equal(profileDescriptor.intentInputContractName(0), undefined);
assert.equal(profileDescriptor.intentInputContractVersion(0), undefined);
assert.equal(profileDescriptor.intentActivationContract(0), "tracked");
assert.equal(profileDescriptor.intentValueContractName(0), undefined);
assert.equal(profileDescriptor.intentValueContractVersion(0), undefined);
assert.equal(profileDescriptor.intentId(1), "example/toggle-highlight-intent");
assert.equal(profileDescriptor.intentInputKind(1), "none");
assert.equal(profileDescriptor.intentInputContractName(1), undefined);
assert.equal(profileDescriptor.intentInputContractVersion(1), undefined);
assert.equal(profileDescriptor.intentActivationContract(1), "tracked");
assert.equal(profileDescriptor.intentValueContractName(1), undefined);
assert.equal(profileDescriptor.intentValueContractVersion(1), undefined);
assert.equal(profileDescriptor.intentId(2), undefined);
assert.equal(profileDescriptor.intentInputKind(2), undefined);
assert.equal(profileDescriptor.intentInputContractName(2), undefined);
assert.equal(profileDescriptor.intentInputContractVersion(2), undefined);
assert.equal(profileDescriptor.intentActivationContract(2), undefined);
assert.equal(profileDescriptor.intentValueContractName(2), undefined);
assert.equal(profileDescriptor.intentValueContractVersion(2), undefined);
assert.equal(profileDescriptor.actionStateCount, 4);
assert.equal(profileDescriptor.actionStateId(3), "example/highlight-control");
assert.equal(profileDescriptor.actionStateSourceKind(3), "routed");
assert.equal(profileDescriptor.actionStateSourceActionId(3), undefined);
assert.equal(
  profileDescriptor.actionStateSourceIntentId(3),
  "example/toggle-highlight-intent",
);
assert.equal(profileDescriptor.actionStateHistoryDirection(3), undefined);
assert.equal(profileDescriptor.actionStateActivationContract(3), "tracked");
assert.equal(profileDescriptor.actionStateValueContractName(3), undefined);
assert.equal(profileDescriptor.actionStateValueContractVersion(3), undefined);

const independentProfileResult =
  api.BreditorCompiledProfile.fromBootstrapJson(PROFILE_BOOTSTRAP_JSON);
const independentProfile = independentProfileResult.takeProfile();
independentProfileResult.free();
const independentGeneration = independentProfile.generation();
const independentDescriptor = independentProfile.descriptor();
assert.equal(
  independentDescriptor.schemaFingerprint,
  profileDescriptor.schemaFingerprint,
);
assert.equal(profileGeneration.matches(independentGeneration), false);
assert.equal(profile.matchesProfileGeneration(independentGeneration), false);
independentDescriptor.free();

const rejectedProfileFactory = profile.createEngineFromDocumentJson(
  "web-glue-profile-v1-rejected",
  EMPTY_DOCUMENT_JSON,
  2,
);
assert.equal(rejectedProfileFactory.status, "error");
assert.equal(rejectedProfileFactory.takeEngine(), undefined);
const rejectedProfileFactoryError = rejectedProfileFactory.error;
assert.ok(rejectedProfileFactoryError instanceof api.BreditorError);
rejectedProfileFactory.free();
rejectedProfileFactoryError.free();

const profileDocumentJson = JSON.stringify(
  profileDocument(profileDescriptor, "abc"),
);
const profileEngineResult = profile.createEngineFromDocumentJson(
  "web-glue-profile-v2",
  profileDocumentJson,
  2,
);
const profileEngine = profileEngineResult.takeEngine();
assert.ok(profileEngine instanceof api.BreditorEngine);
profileEngineResult.free();
assert.ok(profileEngine.matchesProfileGeneration(profileGeneration));
const profileEngineGeneration = profileEngine.profileGeneration();
assert.ok(profileEngineGeneration.matches(profileGeneration));
profileEngineGeneration.free();
const profileEngineDescriptor = profileEngine.profileDescriptor();
assert.equal(
  profileEngineDescriptor.schemaFingerprint,
  profileDescriptor.schemaFingerprint,
);
assert.ok(
  profileEngineDescriptor.matchesProfileGeneration(profileGeneration),
);
profileEngineDescriptor.free();

const profileObservation = profileEngine.observation();
assert.ok(profileObservation.matchesProfileGeneration(profileGeneration));
const profileState = JSON.parse(takeString(profileEngine.stateJson()));
assert.equal(profileState.formatVersion, 2);
assert.equal(
  profileState.schemaFingerprint,
  profileDescriptor.schemaFingerprint,
);
const profileDocumentOutput = JSON.parse(
  takeString(profileEngine.documentJson(profileObservation)),
);
assert.equal(profileDocumentOutput.formatVersion, 2);
assert.equal(
  profileDocumentOutput.schemaFingerprint,
  profileDescriptor.schemaFingerprint,
);

const profileProjectionResult = profileEngine.projection(profileObservation);
assert.ok(
  profileProjectionResult.matchesProfileGeneration(profileGeneration),
);
const profileProjection = profileProjectionResult.takeProjection();
profileProjectionResult.free();
assert.ok(profileProjection.matchesProfileGeneration(profileGeneration));
assert.equal(
  profileProjection.schemaFingerprint,
  profileDescriptor.schemaFingerprint,
);
profileProjection.free();

const profileSelectionResult = profileEngine.selection(profileObservation);
assert.ok(profileSelectionResult.matchesProfileGeneration(profileGeneration));
const profileSelection = profileSelectionResult.takeSelection();
profileSelectionResult.free();
assert.ok(profileSelection.matchesProfileGeneration(profileGeneration));
assert.equal(profileSelection.kind, "none");
profileSelection.free();

const profileStatesResult = profileEngine.actionStates(profileObservation);
assert.ok(profileStatesResult.matchesProfileGeneration(profileGeneration));
const profileStates = profileStatesResult.takeSnapshot();
profileStatesResult.free();
assert.ok(profileStates.matchesProfileGeneration(profileGeneration));
assert.equal(profileStates.entryCount, 4);
assert.equal(profileStates.entryId(3), "example/highlight-control");
profileStates.free();

const unchangedProfileCommand =
  profileEngine.clearSelection(profileObservation);
assert.equal(unchangedProfileCommand.status, "unchanged");
assert.ok(
  unchangedProfileCommand.matchesProfileGeneration(profileGeneration),
);
const unchangedProfileObservation = unchangedProfileCommand.observation();
unchangedProfileCommand.free();
assert.ok(
  unchangedProfileObservation.matchesProfileGeneration(profileGeneration),
);
unchangedProfileObservation.free();

const blockedProfileIntent = profileEngine.executeNoInputIntent(
  profileObservation,
  PROFILE_INTENT,
  false,
);
assert.equal(blockedProfileIntent.status, "blocked");
assert.ok(blockedProfileIntent.matchesProfileGeneration(profileGeneration));
assert.equal(blockedProfileIntent.intentId, PROFILE_INTENT);
assert.equal(
  blockedProfileIntent.bindingId,
  "example/toggle-highlight-binding",
);
assert.equal(blockedProfileIntent.actionId, "example/toggle-highlight");
assert.equal(blockedProfileIntent.bindingPriority, 0);
assert.equal(
  blockedProfileIntent.blockedReasonCode,
  "breditor/no-selection",
);
assert.equal(blockedProfileIntent.blockedActivation, "inactive");
assert.equal(blockedProfileIntent.blockedValueStatus, "unsupported");
assert.equal(blockedProfileIntent.blockedValueContractName, undefined);
assert.equal(blockedProfileIntent.blockedValueContractVersion, undefined);
const blockedDetail = blockedProfileIntent.blockedReasonDetailJson();
assert.equal(blockedDetail.status, "absent");
blockedDetail.free();
const blockedValue = blockedProfileIntent.blockedValueJson();
assert.equal(blockedValue.status, "absent");
blockedValue.free();
assert.equal(blockedProfileIntent.fallthroughCount, 0);
assert.equal(blockedProfileIntent.fallthroughBindingId(0), undefined);
assert.equal(blockedProfileIntent.projectionUpdate(), undefined);
const blockedCommit = blockedProfileIntent.commitJson();
assert.equal(blockedCommit.status, "absent");
blockedCommit.free();
const blockedSuccessor = blockedProfileIntent.observation();
assert.ok(blockedSuccessor.matchesProfileGeneration(profileGeneration));
blockedSuccessor.free();
blockedProfileIntent.free();

const invalidProfileIntent =
  profileEngine.executeNoInputIntent(profileObservation, "", false);
assert.equal(invalidProfileIntent.status, "error");
assert.ok(invalidProfileIntent.matchesProfileGeneration(profileGeneration));
const invalidProfileIntentError = invalidProfileIntent.error;
invalidProfileIntent.free();
assert.equal(
  invalidProfileIntentError.code,
  "breditor_wasm.invalid_intent_id",
);
invalidProfileIntentError.free();

const selectedProfileCheckpoint = profileCheckpoint(
  profileDescriptor,
  "web-glue-profile-intent",
  "abc",
);
const selectedProfileResult =
  profile.createEngineFromSessionCheckpointJson(selectedProfileCheckpoint);
const selectedProfileEngine = selectedProfileResult.takeEngine();
selectedProfileResult.free();
const selectedProfileObservation = selectedProfileEngine.observation();
const committedProfileIntent = selectedProfileEngine.executeNoInputIntent(
  selectedProfileObservation,
  PROFILE_INTENT,
  false,
);
assert.equal(committedProfileIntent.status, "committed");
assert.ok(
  committedProfileIntent.matchesProfileGeneration(profileGeneration),
);
assert.equal(committedProfileIntent.intentId, PROFILE_INTENT);
assert.equal(
  committedProfileIntent.bindingId,
  "example/toggle-highlight-binding",
);
assert.equal(committedProfileIntent.actionId, "example/toggle-highlight");
assert.equal(committedProfileIntent.fallthroughCount, 0);
const committedIntentJson = JSON.parse(
  takeString(committedProfileIntent.commitJson()),
);
assert.equal(committedIntentJson.formatVersion, 2);
assert.equal(
  committedIntentJson.schemaFingerprint,
  profileDescriptor.schemaFingerprint,
);
const committedIntentUpdate = committedProfileIntent.projectionUpdate();
assert.ok(
  committedIntentUpdate.matchesProfileGeneration(profileGeneration),
);
const committedIntentProjection = committedIntentUpdate.takeProjection();
assert.ok(
  committedIntentProjection.matchesProfileGeneration(profileGeneration),
);
committedIntentProjection.free();
committedIntentUpdate.free();
const committedIntentObservation = committedProfileIntent.observation();
assert.ok(
  committedIntentObservation.matchesProfileGeneration(profileGeneration),
);
assert.equal(committedIntentObservation.snapshotRevision, "1");
committedProfileIntent.free();
const formattedProfileDocument = JSON.parse(
  takeString(
    selectedProfileEngine.documentJson(committedIntentObservation),
  ),
);
assert.equal(formattedProfileDocument.formatVersion, 2);
assert.equal(
  formattedProfileDocument.root.children[0].children[0].formats[0].type,
  "example/highlight",
);
const committedProfileStatesResult =
  selectedProfileEngine.actionStates(committedIntentObservation);
const committedProfileStates = committedProfileStatesResult.takeSnapshot();
committedProfileStatesResult.free();
assert.equal(committedProfileStates.entryActivation(3), "active");
assert.ok(committedProfileStates.matchesProfileGeneration(profileGeneration));
committedProfileStates.free();

const profileCheckpointAfterCommit = takeString(
  selectedProfileEngine.sessionCheckpointJson(),
);
assert.equal(JSON.parse(profileCheckpointAfterCommit).formatVersion, 2);
const sameGenerationRestoreResult =
  profile.createEngineFromSessionCheckpointJson(profileCheckpointAfterCommit);
const sameGenerationRestore = sameGenerationRestoreResult.takeEngine();
sameGenerationRestoreResult.free();
assert.ok(sameGenerationRestore.matchesProfileGeneration(profileGeneration));
const staleEngineRead = sameGenerationRestore.documentJson(
  committedIntentObservation,
);
assert.equal(staleEngineRead.status, "error");
const staleEngineError = staleEngineRead.error;
staleEngineRead.free();
assert.equal(staleEngineError.code, "editor_engine.stale_engine");
staleEngineError.free();
sameGenerationRestore.free();

const independentRestoreResult =
  independentProfile.createEngineFromSessionCheckpointJson(
    profileCheckpointAfterCommit,
  );
const independentRestore = independentRestoreResult.takeEngine();
independentRestoreResult.free();
assert.ok(independentRestore.matchesProfileGeneration(independentGeneration));
const foreignGenerationRead = independentRestore.documentJson(
  committedIntentObservation,
);
assert.equal(foreignGenerationRead.status, "error");
const foreignGenerationError = foreignGenerationRead.error;
foreignGenerationRead.free();
assert.equal(
  foreignGenerationError.code,
  "editor_engine.profile_generation_mismatch",
);
foreignGenerationError.free();

// Factories clone profile identity: every retained engine and observation
// remains valid after the originating profile and descriptor are disposed.
const retainedProfileDescriptor = profile.descriptor();
profileDescriptor.free();
profile.free();
assert.equal(retainedProfileDescriptor.schemaName, "example/editor");
assert.equal(retainedProfileDescriptor.formatKind(1), "example/highlight");
retainedProfileDescriptor.free();
assert.ok(profileEngine.matchesProfileGeneration(profileGeneration));
assert.ok(
  selectedProfileEngine.matchesProfileGeneration(profileGeneration),
);

profileObservation.free();
profileEngine.free();
selectedProfileObservation.free();
committedIntentObservation.free();
selectedProfileEngine.free();
independentRestore.free();
independentGeneration.free();
independentProfile.free();
profileGeneration.free();

// ABI 5 carries one typed profile through the real generated boundary, the
// browser descriptor/projection adapters, V3 history, and exact restore.
const typedProfileResult =
  api.BreditorCompiledProfile.fromBootstrapJsonV2(TYPED_PROFILE_BOOTSTRAP_JSON);
assert.equal(typedProfileResult.status, "profile");
const typedProfile = typedProfileResult.takeProfile();
typedProfileResult.free();
const typedGeneration = typedProfile.generation();
const typedDescriptorView = typedProfile.descriptor();
assert.equal(typedDescriptorView.formatKind(1), "example/link");
assert.equal(typedDescriptorView.inlineFormatSetCount, 1);
assert.equal(typedDescriptorView.inlineFormatSetFormatKind(0), "example/link");
assert.equal(
  typedDescriptorView.inlineFormatSetIntentId(0),
  "example/set-link-intent",
);
assert.equal(
  typedDescriptorView.inlineFormatSetActionStateId(0),
  "example/link-presence",
);
assert.equal(typedDescriptorView.intentId(1), "example/set-link-intent");
assert.equal(
  typedDescriptorView.intentInputContractName(1),
  "breditor/set-inline-format-input",
);
assert.equal(typedDescriptorView.intentInputContractVersion(1), 1);
assert.equal(
  typedDescriptorView.intentValueContractName(1),
  "breditor/set-inline-format-input",
);
assert.equal(typedDescriptorView.intentValueContractVersion(1), 1);
assert.equal(typedDescriptorView.actionStateId(3), "example/link-presence");
assert.equal(
  typedDescriptorView.actionStateValueContractName(3),
  "breditor/set-inline-format-input",
);
assert.equal(typedDescriptorView.actionStateValueContractVersion(3), 1);
assert.equal(typedDescriptorView.inlineFormatSetFormatKind(1), undefined);
assert.equal(typedDescriptorView.inlineFormatSetIntentId(1), undefined);
assert.equal(typedDescriptorView.inlineFormatSetActionStateId(1), undefined);
assert.equal(typedDescriptorView.formatPropertyCount(0), 0);
assert.equal(typedDescriptorView.formatPropertyCount(1), 3);
assert.equal(typedDescriptorView.formatPropertyName(1, 0), "example/href");
assert.equal(typedDescriptorView.formatPropertyPresence(1, 0), "required");
assert.equal(typedDescriptorView.formatPropertyValueType(1, 0), "string");
assert.equal(typedDescriptorView.formatPropertyStringMinimumUtf8Bytes(1, 0), 1);
assert.equal(
  typedDescriptorView.formatPropertyStringMaximumUtf8Bytes(1, 0),
  2_048,
);
assert.equal(typedDescriptorView.formatPropertyIntegerMinimum(1, 0), undefined);
assert.equal(typedDescriptorView.formatPropertyName(1, 1), "example/open");
assert.equal(typedDescriptorView.formatPropertyPresence(1, 1), "optional");
assert.equal(typedDescriptorView.formatPropertyValueType(1, 1), "boolean");
assert.equal(typedDescriptorView.formatPropertyName(1, 2), "example/rank");
assert.equal(typedDescriptorView.formatPropertyPresence(1, 2), "optional");
assert.equal(typedDescriptorView.formatPropertyValueType(1, 2), "integer");
assert.equal(typedDescriptorView.formatPropertyIntegerMinimum(1, 2), -10);
assert.equal(typedDescriptorView.formatPropertyIntegerMaximum(1, 2), 10);
assert.equal(typedDescriptorView.formatPropertyName(1, 3), undefined);
const typedDescriptorResult = browser.consumeWasmCompiledProfileDescriptor(
  typedGeneration,
  typedDescriptorView,
);
assert.equal(typedDescriptorResult.ok, true);
const typedDescriptor = typedDescriptorResult.descriptor;
assert.deepEqual(typedDescriptor.formats[1], {
  kind: "example/link",
  revision: 1,
  properties: [
    {
      name: "example/href",
      presence: "required",
      valueType: {
        kind: "string",
        minimumUtf8Bytes: 1,
        maximumUtf8Bytes: 2_048,
      },
    },
    {
      name: "example/open",
      presence: "optional",
      valueType: { kind: "boolean" },
    },
    {
      name: "example/rank",
      presence: "optional",
      valueType: { kind: "integer", minimum: -10, maximum: 10 },
    },
  ],
});
const typedDocumentJson = JSON.stringify(
  profileDocument({
    schemaName: typedDescriptor.schema.name,
    schemaVersion: typedDescriptor.schema.version,
    schemaFingerprint: typedDescriptor.schema.fingerprint,
  }, "abc"),
);
const typedEngineResult = typedProfile.createEngineFromDocumentJsonV3(
  "web-glue-typed-v3",
  typedDocumentJson,
  10,
);
assert.equal(typedEngineResult.status, "engine");
const typedEngine = typedEngineResult.takeEngine();
typedEngineResult.free();
const typedInitial = typedEngine.observation();
const typedSelectionResult = typedEngine.setRangeSelection(
  typedInitial,
  "text",
  2,
  0,
  "before",
  "text",
  2,
  3,
  "after",
);
assert.equal(typedSelectionResult.status, "committed");
const typedSelected = typedSelectionResult.observation();
typedSelectionResult.free();
typedInitial.free();

const typedUnsetRead = readCorrelatedActionStates(
  typedEngine,
  typedSelected,
  typedGeneration,
  typedDescriptor,
);
assert.equal(typedUnsetRead.kind, "full");
const typedUnsetState = typedUnsetRead.snapshot.entries.find(
  (entry) => entry.id === "example/link-presence",
);
assert.equal(typedUnsetState.availability, "blocked");
assert.equal(typedUnsetState.activation, "inactive");
assert.equal(typedUnsetState.reasonCode, "breditor/inline-format-unchanged");
assert.equal(typedUnsetState.value.status, "unset");
assert.equal(
  typedUnsetState.value.contract.name,
  "breditor/set-inline-format-input",
);
assert.equal(typedUnsetState.value.contract.version, 1);

const duplicateTypedIntent = typedEngine.executeTypedIntentJson(
  typedSelected,
  "example/set-link-intent",
  '{"operation":"remove","operation":"set"}',
  true,
);
assert.equal(duplicateTypedIntent.status, "error");
assert.equal(duplicateTypedIntent.historyGroupClosedBefore, false);
const duplicateTypedIntentError = duplicateTypedIntent.error;
assert.equal(
  duplicateTypedIntentError.code,
  "breditor_wasm.invalid_action_value_json",
);
duplicateTypedIntentError.free();
duplicateTypedIntent.free();

const href = "https://example.test/path";
const typedActionInput = JSON.stringify({
  operation: "set",
  properties: [
    { name: "example/href", value: "https://action.example.test/path" },
    { name: "example/open", value: true },
    { name: "example/rank", value: -3 },
  ],
});
const typedAction = typedEngine.executeTypedActionJson(
  typedSelected,
  "example/set-link",
  typedActionInput,
  false,
);
assert.equal(typedAction.status, "committed");
assert.equal(typedAction.eventKind, "action");
assert.equal(typedAction.historyGroupClosedBefore, false);
assert.equal(JSON.parse(takeString(typedAction.commitJson())).formatVersion, 3);
const typedActionCommitted = typedAction.observation();
typedAction.free();
typedSelected.free();

const typedUniformRead = readCorrelatedActionStates(
  typedEngine,
  typedActionCommitted,
  typedGeneration,
  typedDescriptor,
);
assert.equal(typedUniformRead.kind, "delta");
const typedUniformState = typedUniformRead.snapshot.entries.find(
  (entry) => entry.id === "example/link-presence",
);
assert.equal(typedUniformState.availability, "enabled");
assert.equal(typedUniformState.activation, "active");
assert.equal(typedUniformState.reasonCode, undefined);
assert.equal(typedUniformState.value.status, "uniform");
assert.equal(
  typedUniformState.value.contract.name,
  "breditor/set-inline-format-input",
);
assert.equal(typedUniformState.value.contract.version, 1);
assert.equal(JSON.stringify(typedUniformState.value.value), typedActionInput);

const typedIntentInput = JSON.stringify({
  operation: "set",
  properties: [
    { name: "example/href", value: href },
    { name: "example/open", value: false },
    { name: "example/rank", value: 7 },
  ],
});
const typedIntent = typedEngine.executeTypedIntentJson(
  typedActionCommitted,
  "example/set-link-intent",
  typedIntentInput,
  true,
);
assert.equal(typedIntent.status, "committed");
assert.equal(typedIntent.intentId, "example/set-link-intent");
assert.equal(typedIntent.historyGroupClosedBefore, false);
assert.equal(JSON.parse(takeString(typedIntent.commitJson())).formatVersion, 3);
const typedCommitted = typedIntent.observation();
typedIntent.free();
typedActionCommitted.free();
assert.equal(JSON.parse(takeString(typedEngine.stateJson())).formatVersion, 3);

const typedUpdatedUniformRead = readCorrelatedActionStates(
  typedEngine,
  typedCommitted,
  typedGeneration,
  typedDescriptor,
);
assert.equal(typedUpdatedUniformRead.kind, "delta");
const typedUpdatedUniformState = typedUpdatedUniformRead.snapshot.entries.find(
  (entry) => entry.id === "example/link-presence",
);
assert.equal(typedUpdatedUniformState.value.status, "uniform");
assert.equal(
  JSON.stringify(typedUpdatedUniformState.value.value),
  typedIntentInput,
);

const typedProjectionResult = typedEngine.projection(typedCommitted);
const typedProjectionView = typedProjectionResult.takeProjection();
typedProjectionResult.free();
assert.equal(typedProjectionView.formatCount(2), 1);
assert.equal(typedProjectionView.formatType(2, 0), "example/link");
assert.equal(typedProjectionView.formatPropertyCount(2, 0), 3);
assert.equal(typedProjectionView.formatPropertyName(2, 0, 0), "example/href");
assert.equal(typedProjectionView.formatPropertyValueKind(2, 0, 0), "string");
assert.equal(typedProjectionView.formatPropertyString(2, 0, 0), href);
assert.equal(typedProjectionView.formatPropertyBoolean(2, 0, 0), undefined);
assert.equal(typedProjectionView.formatPropertyName(2, 0, 1), "example/open");
assert.equal(typedProjectionView.formatPropertyValueKind(2, 0, 1), "boolean");
assert.equal(typedProjectionView.formatPropertyBoolean(2, 0, 1), false);
assert.equal(typedProjectionView.formatPropertyInteger(2, 0, 1), undefined);
assert.equal(typedProjectionView.formatPropertyName(2, 0, 2), "example/rank");
assert.equal(typedProjectionView.formatPropertyValueKind(2, 0, 2), "integer");
assert.equal(typedProjectionView.formatPropertyInteger(2, 0, 2), 7);
assert.equal(typedProjectionView.formatPropertyString(2, 0, 2), undefined);
assert.equal(typedProjectionView.formatPropertyName(2, 0, 3), undefined);
const typedBrowserProjectionResult = browser.consumeSemanticProjection(
  typedProjectionView,
  typedGeneration,
  typedDescriptor,
);
assert.equal(typedBrowserProjectionResult.ok, true);
const typedBrowserProjection = typedBrowserProjectionResult.value;
assert.deepEqual(typedBrowserProjection.paragraphs, [{
  runs: [{
    text: "abc",
    strong: false,
    formatDetails: [{
      kind: "example/link",
      properties: [
        { name: "example/href", value: href },
        { name: "example/open", value: false },
        { name: "example/rank", value: 7 },
      ],
    }],
  }],
}]);
assert.deepEqual(typedBrowserProjection.paragraphs[0].runs[0].formats, [
  "example/link",
]);

const typedCheckpoint = takeString(typedEngine.sessionCheckpointJson());
assert.equal(JSON.parse(typedCheckpoint).formatVersion, 3);
assert.match(typedCheckpoint, /https:\/\/example\.test\/path/);
const typedUndo = typedEngine.undo(typedCommitted, false);
assert.equal(typedUndo.status, "committed");
const typedUndone = typedUndo.observation();
typedUndo.free();
const typedRedo = typedEngine.redo(typedUndone, false);
assert.equal(typedRedo.status, "committed");
const typedRedone = typedRedo.observation();
typedRedo.free();
typedUndone.free();
const typedRestoreResult =
  typedProfile.createEngineFromSessionCheckpointJsonV3(typedCheckpoint);
assert.equal(typedRestoreResult.status, "engine");
const typedRestored = typedRestoreResult.takeEngine();
typedRestoreResult.free();
assert.equal(takeString(typedRestored.sessionCheckpointJson()), typedCheckpoint);

const typedMixedEngineResult = typedProfile.createEngineFromDocumentJsonV3(
  "web-glue-typed-mixed",
  typedDocumentJson,
  10,
);
const typedMixedEngine = typedMixedEngineResult.takeEngine();
typedMixedEngineResult.free();
const typedMixedInitial = typedMixedEngine.observation();
const typedMixedPartialSelection = typedMixedEngine.setRangeSelection(
  typedMixedInitial,
  "text",
  2,
  0,
  "before",
  "text",
  2,
  1,
  "after",
);
assert.equal(typedMixedPartialSelection.status, "committed");
const typedMixedPartialSelected = typedMixedPartialSelection.observation();
typedMixedPartialSelection.free();
typedMixedInitial.free();
const typedMixedSet = typedMixedEngine.executeTypedIntentJson(
  typedMixedPartialSelected,
  "example/set-link-intent",
  typedIntentInput,
  false,
);
assert.equal(typedMixedSet.status, "committed");
const typedMixedAfterSet = typedMixedSet.observation();
typedMixedSet.free();
typedMixedPartialSelected.free();
const typedMixedFullSelection = typedMixedEngine.setRangeSelection(
  typedMixedAfterSet,
  "text",
  2,
  0,
  "before",
  "text",
  3,
  2,
  "after",
);
assert.equal(typedMixedFullSelection.status, "committed");
const typedMixedSelected = typedMixedFullSelection.observation();
typedMixedFullSelection.free();
typedMixedAfterSet.free();
const typedMixedRead = readCorrelatedActionStates(
  typedMixedEngine,
  typedMixedSelected,
  typedGeneration,
  typedDescriptor,
);
assert.equal(typedMixedRead.kind, "full");
const typedMixedState = typedMixedRead.snapshot.entries.find(
  (entry) => entry.id === "example/link-presence",
);
assert.equal(typedMixedState.availability, "enabled");
assert.equal(typedMixedState.activation, "mixed");
assert.equal(typedMixedState.reasonCode, undefined);
assert.equal(typedMixedState.value.status, "mixed");
assert.equal(
  typedMixedState.value.contract.name,
  "breditor/set-inline-format-input",
);
assert.equal(typedMixedState.value.contract.version, 1);

typedRedone.free();
typedCommitted.free();
typedRestored.free();
typedMixedSelected.free();
typedMixedEngine.free();
typedEngine.free();
typedGeneration.free();
typedProfile.free();

const atomicEngine = takeEngine("web-glue-atomic-history-sequence");
const atomicInitial = atomicEngine.observation();
const atomicSelection = atomicEngine.setRangeSelection(
  atomicInitial,
  "children",
  1,
  0,
  "after",
  "children",
  1,
  0,
  "after",
);
const atomicSelected = atomicSelection.observation();
atomicSelection.free();
atomicInitial.free();
const atomicFirst = atomicEngine.executeStringAction(
  atomicSelected,
  "breditor/insert-text",
  "a",
  false,
);
const atomicAfterFirst = atomicFirst.observation();
assert.equal(atomicFirst.historyGroupClosedBefore, false);
atomicFirst.free();
atomicSelected.free();
const atomicSecond = atomicEngine.executeStringAction(
  atomicAfterFirst,
  "breditor/insert-text",
  "b",
  true,
);
assert.equal(atomicSecond.status, "committed");
assert.equal(atomicSecond.historyGroupClosedBefore, true);
const atomicAfterSecond = atomicSecond.observation();
atomicSecond.free();
atomicAfterFirst.free();
const atomicIntent = atomicEngine.executeNoInputIntent(
  atomicAfterSecond,
  "breditor/format-strong",
  true,
);
assert.equal(atomicIntent.status, "committed");
assert.equal(atomicIntent.historyGroupClosedBefore, true);
const atomicAfterIntent = atomicIntent.observation();
atomicIntent.free();
atomicAfterSecond.free();
const atomicUndo = atomicEngine.undo(atomicAfterIntent, true);
assert.equal(atomicUndo.status, "committed");
assert.equal(atomicUndo.historyGroupClosedBefore, false);
const atomicAfterUndo = atomicUndo.observation();
assert.equal(
  JSON.parse(takeString(atomicEngine.documentJson(atomicAfterUndo))).root
    .children[0].children[0].text,
  "a",
);
atomicUndo.free();
atomicAfterIntent.free();
atomicAfterUndo.free();
atomicEngine.free();

const invalidFactory = api.BreditorEngine.fromDocumentJson(
  "web-glue-redaction",
  "private-invalid-document",
  2,
);
assert.equal(invalidFactory.status, "error");
assert.equal(invalidFactory.takeEngine(), undefined);
const independentError = invalidFactory.error;
assert.ok(independentError instanceof api.BreditorError);
invalidFactory.free();
assert.equal(independentError.code, "codec.invalid_json");
assert.equal(independentError.message, "the initial document was rejected");
assert.doesNotMatch(independentError.message, /private-invalid-document/);
independentError.free();

for (const invalidCapacity of [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -1,
  1.5,
  101,
  2 ** 32 + 1,
  Number.MAX_SAFE_INTEGER,
]) {
  const result = api.BreditorEngine.fromDocumentJson(
    "web-glue-number",
    EMPTY_DOCUMENT_JSON,
    invalidCapacity,
  );
  assert.equal(result.status, "error");
  const error = result.error;
  assert.equal(error.code, "breditor_wasm.invalid_history_capacity");
  error.free();
  result.free();
}

const documentFactory = api.BreditorEngine.fromSessionCheckpointJson(
  SELECTED_CHECKPOINT_JSON,
);
const documentEngine = documentFactory.takeEngine();
documentFactory.free();
const documentInitial = documentEngine.observation();
const initialDocumentResult = documentEngine.documentJson(documentInitial);
assert.equal(initialDocumentResult.status, "value");
assert.equal(initialDocumentResult.error, undefined);
const copiedInitialDocument = initialDocumentResult.value;
const initialDocument = initialDocumentResult.takeValue();
assert.equal(initialDocumentResult.status, "taken");
assert.equal(initialDocumentResult.value, undefined);
assert.equal(initialDocumentResult.takeValue(), undefined);
initialDocumentResult.free();
assert.equal(initialDocument, copiedInitialDocument);
assert.equal(JSON.parse(initialDocument).format, "breditor/document");
assert.equal(JSON.parse(initialDocument).root.children[0].children[0].text, "a");

const unicodeDocumentCommand = documentEngine.executeStringAction(
  documentInitial,
  "breditor/insert-text",
  " é🦀中文",
  false,
);
assert.equal(unicodeDocumentCommand.status, "committed");
const documentAfterInsert = unicodeDocumentCommand.observation();
unicodeDocumentCommand.free();

const staleDocumentResult = documentEngine.documentJson(documentInitial);
assert.equal(staleDocumentResult.status, "error");
assert.equal(staleDocumentResult.value, undefined);
assert.equal(staleDocumentResult.takeValue(), undefined);
assert.equal(staleDocumentResult.status, "error");
const staleDocumentError = staleDocumentResult.error;
staleDocumentResult.free();
assert.equal(staleDocumentError.code, "editor_engine.stale_snapshot");
assert.doesNotMatch(staleDocumentError.message, /é|🦀|中文/);
staleDocumentError.free();

const insertedDocument = takeString(
  documentEngine.documentJson(documentAfterInsert),
);
assert.equal(
  JSON.parse(insertedDocument).root.children[0].children[0].text,
  "a é🦀中文",
);
const canonicalDocumentFactory = api.BreditorEngine.fromDocumentJson(
  "web-glue-canonical-document",
  insertedDocument,
  2,
);
const canonicalDocumentEngine = canonicalDocumentFactory.takeEngine();
canonicalDocumentFactory.free();
const canonicalDocumentObservation = canonicalDocumentEngine.observation();
assert.equal(
  takeString(canonicalDocumentEngine.documentJson(canonicalDocumentObservation)),
  insertedDocument,
);

const foreignDocumentResult = documentEngine.documentJson(
  canonicalDocumentObservation,
);
assert.equal(foreignDocumentResult.status, "error");
const foreignDocumentError = foreignDocumentResult.error;
foreignDocumentResult.free();
assert.equal(
  foreignDocumentError.code,
  "editor_engine.profile_generation_mismatch",
);
foreignDocumentError.free();

const documentUndo = documentEngine.undo(documentAfterInsert, false);
assert.equal(documentUndo.status, "committed");
const documentAfterUndo = documentUndo.observation();
documentUndo.free();
assert.equal(
  takeString(documentEngine.documentJson(documentAfterUndo)),
  initialDocument,
);
const documentRedo = documentEngine.redo(documentAfterUndo, false);
assert.equal(documentRedo.status, "committed");
const documentAfterRedo = documentRedo.observation();
documentRedo.free();
assert.equal(
  takeString(documentEngine.documentJson(documentAfterRedo)),
  insertedDocument,
);

documentInitial.free();
documentAfterInsert.free();
documentAfterUndo.free();
documentAfterRedo.free();
documentEngine.free();
canonicalDocumentObservation.free();
canonicalDocumentEngine.free();

const engine = takeEngine("web-glue-lifecycle");
const firstObservation = engine.observation();
const disabled = engine.executeNoInputAction(
  firstObservation,
  "breditor/toggle-strong",
  false,
);
assert.equal(disabled.status, "disabled");
assert.equal(disabled.eventKind, undefined);
assert.equal(disabled.error, undefined);
let successor = disabled.observation();
assert.ok(successor instanceof api.BreditorObservation);
disabled.free();
firstObservation.free();
assert.equal(successor.snapshotRevision, "0");

const selectionCommand = engine.setRangeSelection(
  successor,
  "children",
  1,
  0,
  "after",
  "children",
  1,
  0,
  "after",
);
assert.equal(selectionCommand.status, "committed");
const selectedObservation = selectionCommand.observation();
selectionCommand.free();
successor.free();
const inserted = engine.executeStringAction(
  selectedObservation,
  "breditor/insert-text",
  "reload me",
  false,
);
assert.equal(inserted.status, "committed");
successor = inserted.observation();
inserted.free();
selectedObservation.free();
assert.equal(successor.snapshotRevision, "2");

const encodedState = takeString(engine.stateJson());
assert.match(encodedState, /"text":"reload me"/);
assert.match(encodedState, /"format":"breditor\/editor-state"/);
const encodedCheckpoint = takeString(engine.sessionCheckpointJson());
assert.match(encodedCheckpoint, /"format":"breditor\/session-checkpoint"/);

const browserCheckpoint = browser.consumeWasmSessionCheckpoint(
  { lineage: "web-glue-lifecycle", revision: successor.snapshotRevision },
  engine.sessionCheckpointJson(),
  [engine],
);
assert.equal(browserCheckpoint.ok, true);
assert.equal(browserCheckpoint.checkpoint.checkpointJson, encodedCheckpoint);
assert.equal(
  browserCheckpoint.checkpoint.checkpointUtf8Bytes,
  new TextEncoder().encode(encodedCheckpoint).byteLength,
);
assert.ok(globalThis.crypto?.subtle);
const checkpointDatabase = new IDBFactory();
const checkpointWriter = new browser.IndexedDbSessionCheckpointStore({
  indexedDB: checkpointDatabase,
  crypto: globalThis.crypto.subtle,
});
const emptyCheckpointSlot = await checkpointWriter.load();
assert.equal(emptyCheckpointSlot.ok, true);
assert.equal(emptyCheckpointSlot.status, "empty");
const checkpointAutosave = new browser.BreditorSessionCheckpointAutosave(
  { read: () => browserCheckpoint },
  checkpointWriter,
  emptyCheckpointSlot.token,
);
checkpointAutosave.markDirty();
assert.deepEqual(await checkpointAutosave.flush(), { status: "committed" });
checkpointAutosave.dispose();
checkpointWriter.close();

const checkpointReader = new browser.IndexedDbSessionCheckpointStore({
  indexedDB: checkpointDatabase,
  crypto: globalThis.crypto.subtle,
});
const reloadedCheckpoint = await checkpointReader.load();
assert.equal(reloadedCheckpoint.ok, true);
assert.equal(reloadedCheckpoint.status, "loaded");
assert.equal(reloadedCheckpoint.checkpointJson, encodedCheckpoint);
assert.equal(
  reloadedCheckpoint.checkpointUtf8Bytes,
  browserCheckpoint.checkpoint.checkpointUtf8Bytes,
);
const browserRestore = browser.bootstrapWasmEngine(api, {
  kind: "sessionCheckpoint",
  checkpointJson: reloadedCheckpoint.checkpointJson,
});
assert.equal(browserRestore.ok, true);
const browserRestoredEngine = browserRestore.engine;
const browserRestoredObservation = browserRestore.observation;
assert.equal(browserRestoredObservation.snapshotLineage, "web-glue-lifecycle");
assert.equal(browserRestoredObservation.snapshotRevision, "2");
assert.equal(
  takeString(browserRestoredEngine.sessionCheckpointJson()),
  encodedCheckpoint,
);
const browserUndo = browserRestoredEngine.undo(browserRestoredObservation, false);
assert.equal(browserUndo.status, "committed");
const browserUndoObservation = browserUndo.observation();
browserUndo.free();
browserRestoredObservation.free();
assert.doesNotMatch(
  takeString(browserRestoredEngine.documentJson(browserUndoObservation)),
  /"text":"reload me"/,
);
const browserRedo = browserRestoredEngine.redo(browserUndoObservation, false);
assert.equal(browserRedo.status, "committed");
const browserRedoObservation = browserRedo.observation();
browserRedo.free();
browserUndoObservation.free();
const redoneDocument = JSON.parse(
  takeString(browserRestoredEngine.documentJson(browserRedoObservation)),
);
const originalState = JSON.parse(encodedState);
assert.deepEqual(redoneDocument.root, originalState.document.root);
assert.equal(browserRedoObservation.snapshotLineage, originalState.snapshot.lineage);
assert.equal(browserRedoObservation.snapshotRevision, "4");
browserRedoObservation.free();
browserRestoredEngine.free();
browserRestore.profileGeneration.free();
checkpointReader.close();

const otherEngine = takeEngine("web-glue-other");
const crossEngine = otherEngine.undo(successor, false);
assert.equal(crossEngine.status, "error");
assert.equal(crossEngine.observation(), undefined);
const crossEngineError = crossEngine.error;
crossEngine.free();
assert.equal(
  crossEngineError.code,
  "editor_engine.profile_generation_mismatch",
);
assert.equal(crossEngineError.message, "the guarded editor command was rejected");
crossEngineError.free();

const tooLarge = engine.executeStringAction(
  successor,
  "breditor/insert-text",
  "x".repeat(65_537),
  false,
);
assert.equal(tooLarge.status, "error");
const tooLargeError = tooLarge.error;
assert.equal(tooLargeError.code, "breditor_wasm.string_input_limit");
tooLargeError.free();
tooLarge.free();

assert.throws(
  () => engine.executeNoInputAction(successor, {
    get length() {
      throw new Error("hostile string coercion ran before Rust");
    },
  }, false),
  /hostile string coercion ran before Rust/,
);
assert.equal(takeString(engine.stateJson()), encodedState);
const afterUnchanged = engine.observation();
assert.equal(afterUnchanged.snapshotRevision, successor.snapshotRevision);
successor.free();

assert.throws(() => otherEngine.undo({}, false), /expected instance/);
const fabricatedEngine = new api.BreditorEngine();
assert.throws(() => fabricatedEngine.observation());

afterUnchanged.free();
engine.free();
otherEngine.free();

const actionStateFactory = api.BreditorEngine.fromSessionCheckpointJson(
  SELECTED_CHECKPOINT_JSON,
);
const actionStateEngine = actionStateFactory.takeEngine();
actionStateFactory.free();
const actionStateInitial = actionStateEngine.observation();

const fullActionStates = actionStateEngine.actionStates(actionStateInitial);
assert.equal(fullActionStates.status, "full");
assert.equal(fullActionStates.error, undefined);
const fullActionStateSnapshot = fullActionStates.takeSnapshot();
assert.ok(fullActionStateSnapshot instanceof api.BreditorActionStateSnapshot);
assert.equal(fullActionStates.status, "taken");
assert.equal(fullActionStates.takeSnapshot(), undefined);
fullActionStates.free();
assert.equal(fullActionStateSnapshot.snapshotLineage, "web-glue-projection-update");
assert.equal(fullActionStateSnapshot.snapshotRevision, "0");
assert.equal(fullActionStateSnapshot.entryCount, 3);
assert.equal(fullActionStateSnapshot.entryId(0), "breditor/control-bold");
assert.equal(fullActionStateSnapshot.entryStatus(0), "enabled");
assert.equal(fullActionStateSnapshot.entryActivation(0), "inactive");
assert.equal(fullActionStateSnapshot.entryReasonCode(0), undefined);
assert.equal(fullActionStateSnapshot.entryValueStatus(0), "unsupported");
assert.equal(fullActionStateSnapshot.entryValueContractName(0), undefined);
assert.equal(fullActionStateSnapshot.entryValueContractVersion(0), undefined);
const absentActionValue = fullActionStateSnapshot.entryUniformValueJson(0);
assert.equal(absentActionValue.status, "absent");
absentActionValue.free();
assert.equal(fullActionStateSnapshot.entryId(1), "breditor/control-redo");
assert.equal(fullActionStateSnapshot.entryStatus(1), "disabled");
assert.equal(fullActionStateSnapshot.entryReasonCode(1), "breditor/nothing-to-redo");
assert.equal(fullActionStateSnapshot.entryId(2), "breditor/control-undo");
assert.equal(fullActionStateSnapshot.entryReasonCode(2), "breditor/nothing-to-undo");
assert.equal(fullActionStateSnapshot.entryId(3), undefined);
assert.equal(fullActionStateSnapshot.entryStatus(3), undefined);
assert.equal(fullActionStateSnapshot.changedCount, 3);
for (let index = 0; index < fullActionStateSnapshot.entryCount; index += 1) {
  assert.equal(
    fullActionStateSnapshot.changedId(index),
    fullActionStateSnapshot.entryId(index),
  );
}
fullActionStateSnapshot.free();
assert.throws(() => fullActionStateSnapshot.entryId(0));

const unchangedActionStates = actionStateEngine.actionStates(actionStateInitial);
assert.equal(unchangedActionStates.status, "unchanged");
const unchangedActionStateSnapshot = unchangedActionStates.takeSnapshot();
unchangedActionStates.free();
assert.equal(unchangedActionStateSnapshot.entryCount, 3);
assert.equal(unchangedActionStateSnapshot.changedCount, 0);
unchangedActionStateSnapshot.free();

const toggleActionState = actionStateEngine.executeNoInputAction(
  actionStateInitial,
  "breditor/toggle-strong",
  false,
);
const actionStateSuccessor = toggleActionState.observation();
toggleActionState.free();
const staleActionStates = actionStateEngine.actionStates(actionStateInitial);
assert.equal(staleActionStates.status, "error");
assert.equal(staleActionStates.takeSnapshot(), undefined);
const staleActionStateError = staleActionStates.error;
staleActionStates.free();
assert.equal(staleActionStateError.code, "editor_engine.stale_snapshot");
staleActionStateError.free();

const deltaActionStates = actionStateEngine.actionStates(actionStateSuccessor);
assert.equal(deltaActionStates.status, "delta");
const deltaActionStateSnapshot = deltaActionStates.takeSnapshot();
deltaActionStates.free();
assert.equal(deltaActionStateSnapshot.snapshotRevision, "1");
assert.equal(deltaActionStateSnapshot.entryActivation(0), "active");
assert.equal(deltaActionStateSnapshot.changedCount, 1);
assert.equal(deltaActionStateSnapshot.changedId(0), "breditor/control-bold");
deltaActionStateSnapshot.free();
actionStateInitial.free();
actionStateSuccessor.free();
actionStateEngine.free();

const selectionFactory = api.BreditorEngine.fromSessionCheckpointJson(
  SELECTED_CHECKPOINT_JSON,
);
assert.equal(selectionFactory.status, "engine");
const selectionEngine = selectionFactory.takeEngine();
selectionFactory.free();
const selectionObservation = selectionEngine.observation();

const selectedResult = selectionEngine.selection(selectionObservation);
assert.equal(selectedResult.status, "selection");
assert.equal(selectedResult.error, undefined);
const selected = selectedResult.takeSelection();
assert.ok(selected instanceof api.BreditorSelection);
assert.equal(selectedResult.status, "taken");
assert.equal(selectedResult.takeSelection(), undefined);
selectedResult.free();
assert.equal(selected.snapshotLineage, "web-glue-projection-update");
assert.equal(selected.snapshotRevision, "0");
assert.equal(selected.kind, "range");
assert.equal(selected.anchorPointKind, "text");
assert.equal(selected.anchorNodeIndex, 2);
assert.equal(selected.anchorOffset, 1);
assert.equal(selected.anchorAffinity, "after");
assert.equal(selected.focusPointKind, "text");
assert.equal(selected.focusNodeIndex, 2);
assert.equal(selected.focusOffset, 1);
assert.equal(selected.focusAffinity, "after");
assert.equal(selected.rangeOrder, "collapsed");
selected.free();

const selectionCheckpointBefore = takeString(
  selectionEngine.sessionCheckpointJson(),
);
for (const coercibleNumber of [
  null,
  false,
  "2",
  [],
  2n,
  Symbol("2"),
  new Number(2),
  { valueOf: () => 2 },
  {
    valueOf() {
      throw new Error("numeric coercion must not run");
    },
  },
]) {
  const rejected = selectionEngine.setRangeSelection(
    selectionObservation,
    "text",
    coercibleNumber,
    1,
    "after",
    "text",
    2,
    1,
    "after",
  );
  assertCommandError(rejected, "breditor_wasm.invalid_selection_coordinate");
  assert.equal(
    takeString(selectionEngine.sessionCheckpointJson()),
    selectionCheckpointBefore,
  );
}

for (const coercibleString of [
  "x".repeat(1_048_576),
  new String("text"),
  { toString: () => "text" },
  {
    toString() {
      throw new Error("string coercion must not run");
    },
  },
]) {
  const rejectedKind = selectionEngine.setRangeSelection(
    selectionObservation,
    coercibleString,
    2,
    1,
    "after",
    "text",
    2,
    1,
    "after",
  );
  assertCommandError(
    rejectedKind,
    "breditor_wasm.invalid_selection_point_kind",
  );

  const rejectedAffinity = selectionEngine.setRangeSelection(
    selectionObservation,
    "text",
    2,
    1,
    coercibleString,
    "text",
    2,
    1,
    "after",
  );
  assertCommandError(
    rejectedAffinity,
    "breditor_wasm.invalid_selection_affinity",
  );
  assert.equal(
    takeString(selectionEngine.sessionCheckpointJson()),
    selectionCheckpointBefore,
  );
}

const movedSelection = selectionEngine.setRangeSelection(
  selectionObservation,
  "text",
  2,
  0,
  "before",
  "text",
  2,
  0,
  "after",
);
assert.equal(movedSelection.status, "committed");
assert.equal(movedSelection.eventKind, "selection");
const movedUpdate = movedSelection.projectionUpdate();
assert.equal(movedUpdate.impact, "none");
const movedProjection = movedUpdate.takeProjection();
movedProjection.free();
movedUpdate.free();
const movedObservation = movedSelection.observation();
movedSelection.free();

const staleBeforeAdmission = selectionEngine.setRangeSelection(
  selectionObservation,
  { toString: () => "text" },
  { valueOf: () => 2 },
  Number.NaN,
  new String("after"),
  null,
  false,
  Number.POSITIVE_INFINITY,
  Symbol("after"),
);
assertCommandError(staleBeforeAdmission, "editor_engine.stale_snapshot");
const staleSelectionRead = selectionEngine.selection(selectionObservation);
assert.equal(staleSelectionRead.status, "error");
assert.equal(staleSelectionRead.takeSelection(), undefined);
const staleSelectionError = staleSelectionRead.error;
staleSelectionRead.free();
assert.equal(staleSelectionError.code, "editor_engine.stale_snapshot");
staleSelectionError.free();

const echoSelection = selectionEngine.setRangeSelection(
  movedObservation,
  "text",
  2,
  0,
  "before",
  "text",
  2,
  0,
  "after",
);
assert.equal(echoSelection.status, "unchanged");
assert.equal(echoSelection.projectionUpdate(), undefined);
const echoObservation = echoSelection.observation();
echoSelection.free();

const clearSelection = selectionEngine.clearSelection(echoObservation);
assert.equal(clearSelection.status, "committed");
assert.equal(clearSelection.eventKind, "selection");
const clearObservation = clearSelection.observation();
clearSelection.free();
const clearedResult = selectionEngine.selection(clearObservation);
const cleared = clearedResult.takeSelection();
clearedResult.free();
assert.equal(cleared.kind, "none");
assert.equal(cleared.anchorPointKind, undefined);
assert.equal(cleared.rangeOrder, undefined);
cleared.free();

const clearEcho = selectionEngine.clearSelection(clearObservation);
assert.equal(clearEcho.status, "unchanged");
clearEcho.free();
selectionObservation.free();
movedObservation.free();
echoObservation.free();
clearObservation.free();
selectionEngine.free();

const projectionFactory = api.BreditorEngine.fromSessionCheckpointJson(
  SELECTED_CHECKPOINT_JSON,
);
assert.equal(projectionFactory.status, "engine");
const projectionEngine = projectionFactory.takeEngine();
projectionFactory.free();
const projectionObservation = projectionEngine.observation();
const projectionGeneration = projectionEngine.profileGeneration();
const projectionDescriptor = projectionEngine.profileDescriptor();
const projectionSchemaFingerprint = projectionDescriptor.schemaFingerprint;
projectionDescriptor.free();

const rawProjectionResult = projectionEngine.projection(projectionObservation);
assert.equal(rawProjectionResult.status, "projection");
assert.equal(rawProjectionResult.error, undefined);
const rawProjection = rawProjectionResult.takeProjection();
assert.ok(rawProjection instanceof api.BreditorProjection);
assert.equal(rawProjectionResult.status, "taken");
assert.equal(rawProjectionResult.takeProjection(), undefined);
rawProjectionResult.free();
assert.equal(rawProjection.schemaName, "breditor/base");
assert.equal(rawProjection.schemaVersion, 1);
assert.equal(rawProjection.snapshotLineage, "web-glue-projection-update");
assert.equal(rawProjection.snapshotRevision, "0");
assert.equal(rawProjection.nodeCount, 3);
assert.equal(rawProjection.rootIndex, 0);
assert.equal(rawProjection.nodeKind(0), "element");
assert.equal(rawProjection.elementType(1), "breditor/paragraph");
assert.equal(rawProjection.childAt(1, 0), 2);
assert.equal(rawProjection.text(2), "a");
assert.equal(rawProjection.nodeKind(99), undefined);
rawProjection.free();

const adapterProjectionResult = projectionEngine.projection(projectionObservation);
const adapterProjection = adapterProjectionResult.takeProjection();
adapterProjectionResult.free();
const browserBaseResult = browser.consumeSemanticProjection(
  adapterProjection,
  projectionGeneration,
  projectionSchemaFingerprint,
);
assert.equal(browserBaseResult.ok, true);
const browserBase = browserBaseResult.value;
assert.deepEqual(browserBase.snapshot, {
  lineage: "web-glue-projection-update",
  revision: "0",
});
assert.deepEqual(browserBase.paragraphs, [
  { runs: [{ text: "a", strong: false, formatDetails: [] }] },
]);

// Exercise the real generated selection view through the dependency-free
// browser adapter, not only through hand-written structural fixtures.
const adapterSelectionResult = projectionEngine.selection(projectionObservation);
assert.equal(adapterSelectionResult.status, "selection");
const adapterSelection = adapterSelectionResult.takeSelection();
adapterSelectionResult.free();
const browserSelectionResult = browser.consumeSemanticSelection(
  browserBase,
  adapterSelection,
  projectionGeneration,
);
assert.equal(browserSelectionResult.ok, true);
const browserSelection = browserSelectionResult.value;
assert.notEqual(browserSelection, null);
assert.equal(browserSelection.order, "collapsed");
assert.deepEqual(browserSelection.anchor, {
  kind: "text",
  textPath: [0, 0],
  utf16Offset: 1,
  affinity: "after",
});
assert.deepEqual(browserSelection.focus, browserSelection.anchor);
assert.throws(() => adapterSelection.kind);

const browserSelectionScalars =
  browser.semanticRangeSelectionScalars(browserSelection);
assert.equal(browserSelectionScalars.ok, true);
assert.deepEqual(browserSelectionScalars.value, {
  anchorPointKind: "text",
  anchorNodeIndex: 2,
  anchorOffset: 1,
  anchorAffinity: "after",
  focusPointKind: "text",
  focusNodeIndex: 2,
  focusOffset: 1,
  focusAffinity: "after",
});

const projectionCommand = projectionEngine.executeStringAction(
  projectionObservation,
  "breditor/insert-text",
  "b",
  false,
);
assert.equal(projectionCommand.status, "committed");
const projectionSuccessor = projectionCommand.observation();
const rawUpdate = projectionCommand.projectionUpdate();
assert.ok(rawUpdate instanceof api.BreditorProjectionUpdate);
assert.equal(rawUpdate.baseRevision, "0");
assert.equal(rawUpdate.resultRevision, "1");
assert.equal(rawUpdate.impact, "textContainers");
assert.equal(rawUpdate.affectedParagraphCount, 1);
assert.equal(rawUpdate.affectedParagraphIndex(0), 0);
const updatedProjection = rawUpdate.takeProjection();
assert.ok(updatedProjection instanceof api.BreditorProjection);
assert.equal(rawUpdate.takeProjection(), undefined);
rawUpdate.free();
assert.equal(updatedProjection.text(2), "ab");
updatedProjection.free();

const adapterUpdate = projectionCommand.projectionUpdate();
const browserUpdateResult = browser.consumeSemanticProjectionUpdate(
  browserBase,
  adapterUpdate,
  projectionGeneration,
  projectionSchemaFingerprint,
);
assert.equal(browserUpdateResult.ok, true);
assert.equal(browserUpdateResult.value.impact.kind, "textContainers");
assert.equal(browserUpdateResult.value.result.paragraphs[0].runs[0].text, "ab");

const droppedOwnedUpdate = projectionCommand.projectionUpdate();
droppedOwnedUpdate.free();
projectionCommand.free();
projectionObservation.free();
projectionSuccessor.free();
projectionEngine.free();
projectionGeneration.free();

// A fabricated or freed class instance passes wasm-bindgen's JavaScript
// `instanceof` check but fails during Rust ABI conversion. Conversion happens
// after the mutable receiver borrow, so this unsupported raw-glue misuse also
// leaves that receiver unusable. Keep each probe on a throwaway engine.
const fabricatedVictim = takeEngine("web-glue-fabricated-victim");
const fabricatedObservation = new api.BreditorObservation();
assert.throws(() => fabricatedVictim.undo(fabricatedObservation, false));
assert.throws(() => fabricatedVictim.free());

const freedVictim = takeEngine("web-glue-freed-victim");
const freedObservation = freedVictim.observation();
freedObservation.free();
assert.throws(() => freedVictim.undo(freedObservation, false));
assert.throws(() => freedVictim.free());

// Exercise the complete public owner with real generated Wasm. The DOM is a
// disposable projection: selection, insertion, undo, redo, persistence, and
// reload all cross the same high-level listener/router boundary an app uses.
const runtimeDom = new JSDOM("<!doctype html><body></body>", {
  pretendToBeVisual: true,
});
for (const name of [
  "window",
  "document",
  "Document",
  "DocumentFragment",
  "ShadowRoot",
  "Node",
  "NodeList",
  "Element",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLParagraphElement",
  "Text",
  "Range",
  "Selection",
  "Event",
  "EventTarget",
  "InputEvent",
  "KeyboardEvent",
  "MouseEvent",
  "MutationObserver",
]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: runtimeDom.window[name],
  });
}
Object.defineProperty(runtimeDom.window.InputEvent.prototype, "getTargetRanges", {
  configurable: true,
  value() {
    return [];
  },
});

// Exercise Profile Bootstrap V2 + Session V3 through the complete public
// browser owner. Derive the initial document binding from the dedicated exact
// Highlight + safe-Link descriptor instead of weakening the browser policy to
// accommodate the broader typed ABI fixture. A deterministic Rust rejection
// must remain contained before history control, and a later valid
// property-bearing intent must still commit.
const safeLinkProfileResult =
  api.BreditorCompiledProfile.fromBootstrapJsonV2(
    SAFE_LINK_PROFILE_BOOTSTRAP_JSON,
  );
assert.equal(safeLinkProfileResult.status, "profile");
const safeLinkProfile = safeLinkProfileResult.takeProfile();
safeLinkProfileResult.free();
const safeLinkGeneration = safeLinkProfile.generation();
const safeLinkDescriptorResult = browser.consumeWasmCompiledProfileDescriptor(
  safeLinkGeneration,
  safeLinkProfile.descriptor(),
);
assert.equal(safeLinkDescriptorResult.ok, true);
const safeLinkDescriptor = safeLinkDescriptorResult.descriptor;
const safeLinkDocumentJson = JSON.stringify(
  profileDocument({
    schemaName: safeLinkDescriptor.schema.name,
    schemaVersion: safeLinkDescriptor.schema.version,
    schemaFingerprint: safeLinkDescriptor.schema.fingerprint,
  }, "abc"),
);
safeLinkGeneration.free();
safeLinkProfile.free();

const typedRuntimeHost = document.createElement("div");
document.body.append(typedRuntimeHost);
const typedRuntimeDatabase = new IDBFactory();
const typedRuntimePersistenceSlot = "web-glue-public-typed-v3";
const typedRuntimeRendering = browser.createInlineFormatRenderManifest({
  recipes: [
    { formatKind: "breditor/strong", element: "strong" },
    {
      formatKind: "example/highlight",
      element: "mark",
      classes: ["breditor-highlight"],
    },
    {
      formatKind: "example/link",
      element: "a",
      classes: ["breditor-link"],
      attributes: {
        kind: "safeLinkV1",
        hrefProperty: "example/href",
        openInNewWindowProperty: "example/open",
      },
    },
  ],
});
const openedTypedRuntime = await browser.openBreditorBrowserEditor({
  host: typedRuntimeHost,
  label: "Generated typed editor",
  wasm: api,
  initialDocument: {
    lineageId: "web-glue-public-typed-runtime",
    documentJson: safeLinkDocumentJson,
    historyCapacity: 100,
  },
  semanticProfile: {
    bootstrapJson: SAFE_LINK_PROFILE_BOOTSTRAP_JSON,
    formatVersion: 2,
  },
  rendering: typedRuntimeRendering,
  keyboard: {
    editing: "beforeinputPrimary",
    primaryModifier: "control",
    shortcuts: "enabled",
  },
  persistence: {
    indexedDB: typedRuntimeDatabase,
    crypto: globalThis.crypto.subtle,
    scope: { kind: "slot", name: typedRuntimePersistenceSlot },
    autosave: { delayMs: 60_000, maxLatencyMs: 60_000 },
  },
});
assert.equal(
  openedTypedRuntime.ok,
  true,
  openedTypedRuntime.ok
    ? undefined
    : `typed browser runtime failed: ${openedTypedRuntime.error.code}/${openedTypedRuntime.error.causeCode ?? "none"}`,
);
const typedRuntime = openedTypedRuntime.editor;
const typedRuntimeParagraphShape = (host, href) =>
  Array.from(host.querySelectorAll(":scope > p"), (paragraph) => {
    const links = Array.from(paragraph.querySelectorAll("a.breditor-link"));
    const highlights = Array.from(
      paragraph.querySelectorAll("mark.breditor-highlight"),
    );
    const text = paragraph.textContent ?? "";
    return {
      text,
      fullyHighlighted:
        highlights.length > 0 &&
        highlights.map((highlight) => highlight.textContent ?? "").join("") ===
          text,
      expectedLinkCoverage:
        href === undefined
          ? links.length === 0
          : links.length > 0 &&
            links.map((link) => link.textContent ?? "").join("") === text,
      canonicalLinks: links.every(
        (link) =>
          link.getAttribute("href") === href &&
          link.getAttribute("rel") === "noopener noreferrer" &&
          link.getAttribute("target") === "_blank",
      ),
    };
  });
const assertTypedRuntimeParagraphs = (host, text, href) =>
  assert.deepEqual(
    typedRuntimeParagraphShape(host, href),
    text.map((value) => ({
      text: value,
      fullyHighlighted: true,
      expectedLinkCoverage: true,
      canonicalLinks: true,
    })),
  );
const typedRuntimeTextNode = (element) => {
  const node = runtimeDom.window.document
    .createTreeWalker(element, runtimeDom.window.NodeFilter.SHOW_TEXT)
    .nextNode();
  assert.ok(node instanceof runtimeDom.window.Text);
  return node;
};
const typedRuntimeText = typedRuntimeHost.querySelector("p")?.firstChild;
assert.ok(typedRuntimeText instanceof runtimeDom.window.Text);
runtimeDom.window.getSelection().setBaseAndExtent(
  typedRuntimeText,
  0,
  typedRuntimeText,
  3,
);
document.dispatchEvent(new runtimeDom.window.Event("selectionchange"));
assert.equal(typedRuntime.getSnapshot().document.revision, "1");

const typedRuntimeRejected = typedRuntime.executeIntentJson(
  "example/set-link-intent",
  '{"operation":"remove","operation":"set"}',
);
assert.deepEqual(typedRuntimeRejected, {
  status: "rejected",
  intentId: "example/set-link-intent",
  reason: "invalidInput",
  document: {
    lineage: "web-glue-public-typed-runtime",
    revision: "1",
  },
});
assert.equal(typedRuntime.getStatus().phase, "live");

const typedRuntimeHighlight = typedRuntime.executeIntent(
  "example/toggle-highlight-intent",
);
assert.equal(typedRuntimeHighlight.status, "committed");
assert.equal(typedRuntimeHighlight.document.revision, "2");

const typedRuntimeSet = typedRuntime.executeIntentJson(
  "example/set-link-intent",
  JSON.stringify({
    operation: "set",
    properties: [
      { name: "example/href", value: "https://runtime.example.test" },
      { name: "example/open", value: true },
    ],
  }),
);
assert.equal(typedRuntimeSet.status, "committed");
assert.equal(typedRuntimeSet.document.revision, "3");
assertTypedRuntimeParagraphs(
  typedRuntimeHost,
  ["abc"],
  "https://runtime.example.test/",
);
const typedRuntimeDocument = typedRuntime.exportContent("documentJson");
assert.equal(typedRuntimeDocument.ok, true);
assert.match(typedRuntimeDocument.value, /https:\/\/runtime\.example\.test/);
assert.match(typedRuntimeDocument.value, /example\/highlight/);

// Structural actions stay on the existing ABI: the Rust operation carries the
// complete typed fragments and the browser reprojects both format owners.
const linkedRuntimeText = typedRuntimeTextNode(
  typedRuntimeHost.querySelector("a.breditor-link"),
);
runtimeDom.window.getSelection().setBaseAndExtent(
  linkedRuntimeText,
  1,
  linkedRuntimeText,
  1,
);
document.dispatchEvent(new runtimeDom.window.Event("selectionchange"));
assert.equal(typedRuntime.getSnapshot().document.revision, "4");
const typedRuntimeBreak = new runtimeDom.window.InputEvent("beforeinput", {
  bubbles: true,
  cancelable: true,
  inputType: "insertParagraph",
});
assert.equal(typedRuntimeHost.dispatchEvent(typedRuntimeBreak), false);
assert.equal(typedRuntimeBreak.defaultPrevented, true);
assert.equal(typedRuntime.getSnapshot().document.revision, "5");
assertTypedRuntimeParagraphs(
  typedRuntimeHost,
  ["a", "bc"],
  "https://runtime.example.test/",
);

const dispatchTypedRuntimeHistory = (host, code, key) => {
  const event = new runtimeDom.window.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    code,
    ctrlKey: true,
    key,
  });
  assert.equal(host.dispatchEvent(event), false);
  assert.equal(event.defaultPrevented, true);
};
dispatchTypedRuntimeHistory(typedRuntimeHost, "KeyZ", "z");
assert.equal(typedRuntime.getSnapshot().document.revision, "6");
assertTypedRuntimeParagraphs(
  typedRuntimeHost,
  ["abc"],
  "https://runtime.example.test/",
);
dispatchTypedRuntimeHistory(typedRuntimeHost, "KeyY", "y");
assert.equal(typedRuntime.getSnapshot().document.revision, "7");
assertTypedRuntimeParagraphs(
  typedRuntimeHost,
  ["a", "bc"],
  "https://runtime.example.test/",
);

// Replace Link across both blocks with one property-bearing action. Highlight
// remains additive and every rendered Link attribute stays canonical.
const typedRuntimeLinks = typedRuntimeHost.querySelectorAll("a.breditor-link");
const typedRuntimeFirstText = typedRuntimeTextNode(typedRuntimeLinks[0]);
const typedRuntimeLastText = typedRuntimeTextNode(typedRuntimeLinks[1]);
runtimeDom.window.getSelection().setBaseAndExtent(
  typedRuntimeFirstText,
  0,
  typedRuntimeLastText,
  2,
);
document.dispatchEvent(new runtimeDom.window.Event("selectionchange"));
assert.equal(typedRuntime.getSnapshot().document.revision, "8");

const crossParagraphHref = "https://cross.example.test/guide?q=alpha&b=two";
const typedRuntimeCrossSet = typedRuntime.executeIntentJson(
  "example/set-link-intent",
  JSON.stringify({
    operation: "set",
    properties: [
      { name: "example/href", value: crossParagraphHref },
      { name: "example/open", value: true },
    ],
  }),
);
assert.equal(typedRuntimeCrossSet.status, "committed");
assert.equal(typedRuntimeCrossSet.document.revision, "9");
assertTypedRuntimeParagraphs(
  typedRuntimeHost,
  ["a", "bc"],
  crossParagraphHref,
);

const typedRuntimeRemove = typedRuntime.executeIntentJson(
  "example/set-link-intent",
  '{"operation":"remove"}',
);
assert.equal(typedRuntimeRemove.status, "committed");
assert.equal(typedRuntimeRemove.document.revision, "10");
assertTypedRuntimeParagraphs(typedRuntimeHost, ["a", "bc"]);

dispatchTypedRuntimeHistory(typedRuntimeHost, "KeyZ", "z");
assert.equal(typedRuntime.getSnapshot().document.revision, "11");
assertTypedRuntimeParagraphs(
  typedRuntimeHost,
  ["a", "bc"],
  crossParagraphHref,
);
dispatchTypedRuntimeHistory(typedRuntimeHost, "KeyY", "y");
assert.equal(typedRuntime.getSnapshot().document.revision, "12");
assertTypedRuntimeParagraphs(typedRuntimeHost, ["a", "bc"]);
dispatchTypedRuntimeHistory(typedRuntimeHost, "KeyZ", "z");
assert.equal(typedRuntime.getSnapshot().document.revision, "13");
assertTypedRuntimeParagraphs(
  typedRuntimeHost,
  ["a", "bc"],
  crossParagraphHref,
);

assert.deepEqual(await typedRuntime.flushPersistence(), {
  status: "committed",
});
assert.equal(typedRuntime.getStatus().phase, "live");
typedRuntime.dispose();
typedRuntimeHost.remove();

// Inspect the stored generation before public startup consumes it: Profile V2
// must select Session V3 and retain a cursor before the removal redo entry.
const typedRuntimeCheckpointReader =
  new browser.IndexedDbSessionCheckpointStore({
    indexedDB: typedRuntimeDatabase,
    crypto: globalThis.crypto.subtle,
    binding: {
      slot: typedRuntimePersistenceSlot,
      schemaFingerprint: safeLinkDescriptor.schema.fingerprint,
      checkpointFormatVersion: 3,
    },
  });
const typedRuntimeCheckpointLoad = await typedRuntimeCheckpointReader.load();
assert.equal(typedRuntimeCheckpointLoad.ok, true);
assert.equal(typedRuntimeCheckpointLoad.status, "loaded");
const typedRuntimeCheckpoint = JSON.parse(
  typedRuntimeCheckpointLoad.checkpointJson,
);
assert.equal(typedRuntimeCheckpoint.formatVersion, 3);
assert.equal(typedRuntimeCheckpoint.currentRevision, "13");
assert.ok(typedRuntimeCheckpoint.cursor < typedRuntimeCheckpoint.entries.length);
assert.match(typedRuntimeCheckpointLoad.checkpointJson, /example\/highlight/);
assert.match(typedRuntimeCheckpointLoad.checkpointJson, /cross\.example\.test/);
typedRuntimeCheckpointReader.close();

const reloadedTypedRuntimeHost = document.createElement("div");
document.body.append(reloadedTypedRuntimeHost);
const reloadedTypedRuntimeResult = await browser.openBreditorBrowserEditor({
  host: reloadedTypedRuntimeHost,
  label: "Reloaded generated typed editor",
  wasm: api,
  initialDocument: {
    lineageId: "must-not-replace-typed-checkpoint",
    documentJson: safeLinkDocumentJson,
    historyCapacity: 1,
  },
  semanticProfile: {
    bootstrapJson: SAFE_LINK_PROFILE_BOOTSTRAP_JSON,
    formatVersion: 2,
  },
  rendering: typedRuntimeRendering,
  keyboard: {
    editing: "beforeinputPrimary",
    primaryModifier: "control",
    shortcuts: "enabled",
  },
  persistence: {
    indexedDB: typedRuntimeDatabase,
    crypto: globalThis.crypto.subtle,
    scope: { kind: "slot", name: typedRuntimePersistenceSlot },
    autosave: { delayMs: 60_000, maxLatencyMs: 60_000 },
  },
});
assert.equal(reloadedTypedRuntimeResult.ok, true);
const reloadedTypedRuntime = reloadedTypedRuntimeResult.editor;
assert.deepEqual(reloadedTypedRuntime.getSnapshot().document, {
  lineage: "web-glue-public-typed-runtime",
  revision: "13",
});
assertTypedRuntimeParagraphs(
  reloadedTypedRuntimeHost,
  ["a", "bc"],
  crossParagraphHref,
);
dispatchTypedRuntimeHistory(reloadedTypedRuntimeHost, "KeyY", "y");
assert.equal(reloadedTypedRuntime.getSnapshot().document.revision, "14");
assertTypedRuntimeParagraphs(reloadedTypedRuntimeHost, ["a", "bc"]);
assert.equal(reloadedTypedRuntime.getStatus().phase, "live");
reloadedTypedRuntime.dispose();
reloadedTypedRuntimeHost.remove();

const runtimeDatabase = new IDBFactory();
const runtimeHost = document.createElement("div");
const runtimeToolbarHost = document.createElement("div");
document.body.append(runtimeToolbarHost, runtimeHost);
const openedRuntime = await browser.openBreditorBrowserEditor({
  host: runtimeHost,
  label: "Generated glue editor",
  wasm: api,
  initialDocument: {
    lineageId: "web-glue-public-runtime",
    documentJson: EMPTY_DOCUMENT_JSON,
    historyCapacity: 100,
  },
  keyboard: {
    editing: "beforeinputPrimary",
    primaryModifier: "control",
    shortcuts: "enabled",
  },
  toolbar: { host: runtimeToolbarHost },
  persistence: {
    indexedDB: runtimeDatabase,
    crypto: globalThis.crypto.subtle,
    autosave: { delayMs: 60_000, maxLatencyMs: 60_000 },
  },
});
assert.equal(
  openedRuntime.ok,
  true,
  openedRuntime.ok
    ? undefined
    : `browser runtime failed: ${openedRuntime.error.code}/${openedRuntime.error.causeCode ?? "none"}`,
);
const runtime = openedRuntime.editor;
assert.equal(runtime.getStatus().phase, "live");
assert.equal(runtime.getSnapshot().document.revision, "0");
assert.equal(runtimeHost.getAttribute("contenteditable"), "true");
assert.equal(runtimeHost.getAttribute("role"), "textbox");
assert.equal(runtimeHost.getAttribute("aria-label"), "Generated glue editor");
assert.equal(runtimeToolbarHost.querySelectorAll("button").length, 3);

const emptyParagraph = runtimeHost.querySelector("p");
assert.ok(emptyParagraph);
runtimeDom.window.getSelection().setBaseAndExtent(
  emptyParagraph,
  0,
  emptyParagraph,
  0,
);
document.dispatchEvent(new runtimeDom.window.Event("selectionchange"));
assert.equal(runtime.getSnapshot().document.revision, "1");

const insertEvent = new runtimeDom.window.InputEvent("beforeinput", {
  bubbles: true,
  cancelable: true,
  data: "runtime reload",
  inputType: "insertText",
});
assert.equal(runtimeHost.dispatchEvent(insertEvent), false);
assert.equal(insertEvent.defaultPrevented, true);
assert.equal(
  runtimeHost.textContent,
  "runtime reload",
  JSON.stringify({
    html: runtimeHost.innerHTML,
    snapshot: runtime.getSnapshot(),
    status: runtime.getStatus(),
  }),
);
assert.equal(runtime.getSnapshot().document.revision, "2");

const undoEvent = new runtimeDom.window.KeyboardEvent("keydown", {
  bubbles: true,
  cancelable: true,
  code: "KeyZ",
  ctrlKey: true,
  key: "z",
});
assert.equal(runtimeHost.dispatchEvent(undoEvent), false);
assert.equal(runtimeHost.textContent, "");
assert.equal(runtime.getSnapshot().document.revision, "3");

const redoEvent = new runtimeDom.window.KeyboardEvent("keydown", {
  bubbles: true,
  cancelable: true,
  code: "KeyY",
  ctrlKey: true,
  key: "y",
});
assert.equal(runtimeHost.dispatchEvent(redoEvent), false);
assert.equal(runtimeHost.textContent, "runtime reload");
assert.equal(runtime.getSnapshot().document.revision, "4");
assert.deepEqual(await runtime.flushPersistence(), { status: "committed" });
runtime.dispose();
assert.equal(runtime.getStatus().phase, "disposed");
assert.equal(runtime.getSnapshot().persistence.phase, "disposed");
assert.equal(runtimeHost.childNodes.length, 0);
assert.equal(runtimeHost.hasAttribute("contenteditable"), false);
assert.equal(runtimeToolbarHost.childNodes.length, 0);

const reloadedHost = document.createElement("div");
document.body.append(reloadedHost);
const reloadedRuntimeResult = await browser.openBreditorBrowserEditor({
  host: reloadedHost,
  label: "Reloaded generated glue editor",
  wasm: api,
  initialDocument: {
    lineageId: "must-not-replace-checkpoint",
    documentJson: EMPTY_DOCUMENT_JSON,
    historyCapacity: 1,
  },
  keyboard: {
    editing: "beforeinputPrimary",
    primaryModifier: "control",
    shortcuts: "enabled",
  },
  persistence: {
    indexedDB: runtimeDatabase,
    crypto: globalThis.crypto.subtle,
  },
});
assert.equal(reloadedRuntimeResult.ok, true);
const reloadedRuntime = reloadedRuntimeResult.editor;
assert.deepEqual(reloadedRuntime.getSnapshot().document, {
  lineage: "web-glue-public-runtime",
  revision: "4",
});
assert.equal(reloadedHost.textContent, "runtime reload");
reloadedRuntime.dispose();
