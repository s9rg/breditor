/** Real native proposal capture + application Wasm clients + authenticated durable socket host.
 * Explicit wire fixture only: no automatic suggestion SDK queue or accepting-user Undo claim. */
import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, realpathSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {SharedRichEditor, createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {ReviewWireFixture as BaseWireFixture, startReviewHost} from "./probe-review-relay.mjs";

class ReviewWireFixture extends BaseWireFixture {
  async request(value) {
    try { return await super.request(value); }
    catch (error) { throw Error(`Suggestion probe request failed: ${value.kind}`, {cause: error}); }
  }
}

const origin = "http://127.0.0.1:49785";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const save = (path, value) => writeFileSync(path, value, {mode: 0o600});
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const insert = (block, text) => ({kind: "insert_text", data: {block, offset: 0, text}});
const heading = level => ({kind: "set_heading", data: {block: "p", level}});
const draft = commands => ({scope: "commands", edit: {kind: "commands", data: commands}});
async function until(predicate) {
  for (let i = 0; i < 1000; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw Error("Timed out waiting for suggestion notification");
}
export async function probeSuggestionRelay(directory, executable) {
  const bytes = readFileSync(resolve(directory, "breditor_shared_bg.wasm"));
  const wasm = await import(pathToFileURL(resolve(directory, "breditor_shared.js")));
  await wasm.default({module_or_path: bytes});
  const configuration = JSON.stringify({format: "breditor/shared-rich-profile", formatVersion: 3,
    schema: {name: "example/suggestion-socket-functional", version: 1}, extensions: []});
  const profile = wasm.SharedRichProfile.from_standard_configuration_json_v3(configuration);
  const descriptor = JSON.parse(profile.descriptor_json());
  const source = JSON.stringify({format: "breditor/document", formatVersion: 2, schema: descriptor.schema,
    schemaFingerprint: descriptor.schemaFingerprint, root: canonical(JSON.parse(readFileSync(
      new URL("../crates/breditor-core/tests/fixtures/rich-local-root.json", import.meta.url), "utf8")))});
  const counts = {trials: 0, ownedAcceptWorkflows: 0, sameAccountDeviceRetry: 0, opposingRetry: 0,
    concurrentReviewerRaces: 0, hostRestarts: 0, missingSources: 0, conflictsRemainPending: 0,
    exactPackets: 0, offlineEditsPreserved: 0, unchangedClientHistory: 0,
    exactClientRestores: 0, ordinaryUndoRedoWorkflows: 0, observerAcceptRefusals: 0,
    fullCapabilityHandshakes: 0, liveReadRevocationRefusals: 0, serverMergeImports: 0,
    fixtureQueuedOfflineDecisionReplays: 0};
  try {
    for (const natural of [false, true]) {
      const temporary = mkdtempSync(join(tmpdir(), "breditor-suggestion-socket-"));
      const paths = ["room.log", "profile.json", "document.json", "auth.json"].map(name => join(temporary, name));
      const tokens = Object.fromEntries(["alice", "bob", "carol", "dana", "functional-owner"].map(principal =>
        [principal, randomBytes(32).toString("hex")]));
      save(paths[1], configuration); save(paths[2], source);
      save(paths[3], JSON.stringify({format: "breditor/relay-auth", formatVersion: 1, origins: [origin],
        accounts: Object.entries(tokens).map(([principal, token]) =>
          ({principal, tokenHash: [...createHash("sha256").update(token).digest()]}))}));
      let server, a, b;
      const channels = [], errors = [];
      let binding;
      const facade = raw => natural ? createSharedDocumentEditor(raw, {onError: error => errors.push(error)})
        : new SharedRichEditor(raw, {onError: error => errors.push(error)});
      const connect = async (principal, enabled = true) => {
        const wire = new ReviewWireFixture(`ws://${server.address}/ws`); channels.push(wire);
        const capabilities = ["writerTransportV2", ...(enabled ? ["documentSuggestionsV1"] : [])];
        const auth = await wire.request({kind: "authenticate", principal, token: tokens[principal], capabilities});
        assert.equal(auth.kind, "authenticated"); assert.deepEqual(auth.capabilities, capabilities);
        if (!enabled) {
          assert.equal(auth.documentSuggestionsDescriptor, undefined);
          assert.equal(auth.documentSuggestionsPermissions, undefined);
        }
        return {wire, auth};
      };
      const capture = (frame, author, title, commands) => {
        const framePath = join(temporary, "capture-frame.json"), draftPath = join(temporary, "capture-draft.json");
        save(framePath, frame); save(draftPath, JSON.stringify(draft(commands)));
        return execFileSync(executable, ["capture", paths[1], framePath, author, title, draftPath],
          {encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024}).trim();
      };
      const publish = async (wire, packet, expected = "durable") => {
        const response = await wire.request({kind: "suggestionPublish", binding, packet});
        assert.equal(response.kind, "suggestionAdmission"); assert.equal(response.admission.kind, expected);
        return response.admission;
      };
      const decide = async (wire, id, decision = "accept", expected = "durable") => {
        const response = await wire.request({kind: "suggestionDecide", decision: {binding, suggestionId: id, decision}});
        assert.equal(response.kind, "suggestionDecisionAdmission"); assert.equal(response.admission.kind, expected);
        return response.admission;
      };
      const flush = async (core, wire, after = "0") => {
        for (const group of core.writerGroupsV2(after).groups) assert.equal((await wire.request({kind: "submit", group})).kind, "durable");
      };
      try {
        server = await startReviewHost(executable, [...paths, "127.0.0.1:0"]);
        const {wire: legacy} = await connect("dana", false);
        assert.equal((await legacy.request({kind: "suggestionSync", binding: "0".repeat(64), cursor: null})).code, "invalid_request");
        const {wire: admin} = await connect("functional-owner");
        const full = new ReviewWireFixture(`ws://${server.address}/ws`); channels.push(full);
        const all = ["writerTransportV2", "assets", "documentPresenceV1", "reviewV1", "reviewLineageV1",
          "reviewObserverV1", "documentVersionsV1", "documentSuggestionsV1"];
        const fullyNegotiated = await full.request({kind: "authenticate", principal: "functional-owner",
          token: tokens["functional-owner"], capabilities: all});
        assert.equal(fullyNegotiated.kind, "authenticated");
        assert.deepEqual(fullyNegotiated.capabilities, all.filter(name => name !== "assets"));
        counts.fullCapabilityHandshakes++;
        const {wire: alice, auth: aa} = await connect("alice"), {wire: bob, auth: ba} = await connect("bob");
        let {wire: reader, auth: ra} = await connect("carol");
        binding = aa.documentSuggestionsDescriptor.binding;
        assert.equal(aa.documentSuggestionsDescriptor.format, "breditor/relay-document-suggestions");
        assert.equal(aa.documentSuggestionsDescriptor.effectWriter, "18446744073709551614");
        assert.equal(ra.documentSuggestionsPermissions.canPropose, true);
        assert.equal(ra.documentSuggestionsPermissions.canAccept, false);
        assert.equal(ra.documentSuggestionsPermissions.canReject, true);
        const ar = (await alice.request({kind: "register"})).registration;
        const br = (await bob.request({kind: "register"})).registration;
        const cr = await reader.request({kind: "registerObserver"});
        assert.equal(cr.kind, "observerRegistered");
        a = facade(profile.join_frame("room", ar.lease.writer, aa.frame));
        b = facade(profile.join_frame("room", br.lease.writer, ba.frame));
        if (natural) { a.enableTypingHistory(); b.enableTypingHistory(); }
        const pendingPacket = capture(aa.frame, "carol", "Reader proposal 日本 🙂", [heading(3)]);
        const pendingId = JSON.parse(pendingPacket).id;
        const beforePublish = (await alice.request({kind: "sync"})).frame;
        await publish(reader, pendingPacket);
        assert.equal((await alice.request({kind: "sync"})).frame, beforePublish);
        assert.equal((await reader.request({kind: "suggestionDecide", decision: {binding, suggestionId: pendingId, decision: "accept"}})).code, "lease_rejected");
        assert.equal((await admin.request({kind: "grant", principal: "carol", role: "editor"})).kind, "granted");
        // Every document permission change deliberately fences old leases, including promotion.
        // Reconnect/resume the SAME permanently non-authoring identity under fresh live rights.
        reader.close(); ({wire: reader} = await connect("carol"));
        assert.equal((await reader.request({kind: "resumeObserver", writer: cr.registration.lease.writer,
          credential: cr.registration.credential})).kind, "observerResumed");
        assert.equal((await reader.request({kind: "suggestionRead", binding, suggestionId: pendingId})).permissions.canAccept, true);
        assert.equal((await reader.request({kind: "suggestionDecide", decision: {binding, suggestionId: pendingId, decision: "accept"}})).code, "lease_rejected");
        assert.equal((await admin.request({kind: "grant", principal: "carol", role: "reader"})).kind, "granted");
        reader.close(); ({wire: reader} = await connect("carol"));
        assert.equal((await reader.request({kind: "resumeObserver", writer: cr.registration.lease.writer,
          credential: cr.registration.credential})).kind, "observerResumed");
        counts.observerAcceptRefusals++;
        const noLease = await connect("alice");
        assert.equal((await noLease.wire.request({kind: "suggestionDecide", decision: {binding, suggestionId: pendingId, decision: "accept"}})).code, "lease_rejected");
        const originalPacket = await bob.request({kind: "suggestionPacket", binding, suggestionId: pendingId});
        assert.equal(originalPacket.packet, pendingPacket); counts.exactPackets++;
        // An unrelated ordinary edit stays offline while the server finalizes the accepted heading.
        a.dispatch({commands: [{kind: "set_image_alt", data: {block: "image-block", text: "Offline alt", decorative: false}}]});
        const ownHistory = [a.view().undoDepth, a.view().redoDepth];
        assert.deepEqual(ownHistory, [1, 0]);
        const accepted = await decide(alice, pendingId);
        assert.equal(accepted.decision.acceptingWriter, ar.lease.writer);
        assert.equal(accepted.decision.effect.writerGroup.writer, "18446744073709551614");
        counts.ownedAcceptWorkflows++;
        await a.receiveFrame((await alice.request({kind: "sync"})).frame);
        assert.match(a.documentJson(), /Offline alt/); assert.match(a.documentJson(), /breditor\/heading/);
        assert.deepEqual([a.view().undoDepth, a.view().redoDepth], ownHistory); counts.unchangedClientHistory++;
        await flush(a, alice); counts.offlineEditsPreserved++;
        await b.receiveFrame((await bob.request({kind: "sync"})).frame);
        assert.equal(a.documentJson(), b.documentJson());
        const acceptedWithOwnEdit = a.documentJson(), saved = a.checkpointJson();
        const twin = facade(natural ? profile.restore_document_typing("room", saved) : profile.restore("room", saved));
        try {
          assert.equal(twin.checkpointJson(), saved); counts.exactClientRestores++;
          for (const method of ["undo", "redo"]) {
            const before = a.writerClockV2(ar.lease.writer).through;
            assert.equal(a[method](), true); assert.equal(twin[method](), true);
            assert.equal(a.documentJson(), twin.documentJson());
            assert.equal(a.checkpointJson(), twin.checkpointJson());
            assert.match(a.documentJson(), /breditor\/heading/);
            if (method === "undo") assert.ok(!a.documentJson().includes("Offline alt"));
            else assert.equal(a.documentJson(), acceptedWithOwnEdit);
            await flush(a, alice, before);
            await b.receiveFrame((await bob.request({kind: "sync"})).frame);
            assert.equal(a.documentJson(), b.documentJson());
          }
          counts.ordinaryUndoRedoWorkflows++;
        } finally { twin.dispose(); }
        await until(() => reader.events.some(event => event.kind === "documentSuggestionsChanged"));
        const exactLog = readFileSync(paths[0]);
        const opposite = await decide(reader, pendingId, "reject");
        assert.deepEqual(opposite.decision, accepted.decision); assert.equal(opposite.duplicate, true);
        assert.deepEqual(readFileSync(paths[0]), exactLog); counts.opposingRetry++;
        const otherDevice = await connect("alice"); await otherDevice.wire.request({kind: "register"});
        const retried = await decide(otherDevice.wire, pendingId);
        assert.deepEqual(retried.decision, accepted.decision); counts.sameAccountDeviceRetry++;
        const read = await reader.request({kind: "suggestionRead", binding, suggestionId: pendingId});
        assert.deepEqual(read.entry.decision, accepted.decision);
        assert.equal((await reader.request({kind: "suggestionSync", binding: "0".repeat(64), cursor: null})).code, "invalid_request");
        // Missing offline source is not acknowledged; the same packet works after document flush.
        const through = a.writerClockV2(ar.lease.writer).through;
        a.dispatch({commands: [insert("p", "Offline source ")]});
        const offline = capture(a.updateFrame(), "alice", "Depends on offline source", [insert("p", "Pending proposal ")]);
        const beforePending = readFileSync(paths[0]); await publish(alice, offline, "pending");
        assert.deepEqual(readFileSync(paths[0]), beforePending); counts.missingSources++;
        await flush(a, alice, through); await publish(alice, offline);
        const oldThrough = a.writerClockV2(ar.lease.writer).through;
        a.dispatch({commands: [insert("p", "Changed target ")]}); await flush(a, alice, oldThrough);
        const beforeConflict = readFileSync(paths[0]);
        await decide(bob, JSON.parse(offline).id, "accept", "conflict");
        assert.deepEqual(readFileSync(paths[0]), beforeConflict);
        assert.equal((await reader.request({kind: "suggestionRead", binding, suggestionId: JSON.parse(offline).id})).entry.decision, null);
        await decide(reader, JSON.parse(offline).id, "reject"); counts.conflictsRemainPending++;
        // Two real sockets race; a lost/opposing reply is the same original winner forever.
        const frame = (await alice.request({kind: "sync"})).frame;
        const raced = capture(frame, "alice", "Concurrent review", [insert("caption", "Proposal ")]);
        await publish(alice, raced); const racedId = JSON.parse(raced).id;
        // A durable fixture-owned offline choice is submitted only after reconnect. The SDK does
        // not yet implement this queue; saved choices are intents, never durable server decisions.
        const queuedChoice = join(temporary, "offline-choice.json");
        save(queuedChoice, JSON.stringify({binding, suggestionId: racedId, decision: "accept"}));
        const results = await Promise.all([decide(alice, racedId), decide(bob, racedId, "reject")]);
        assert.deepEqual(results[0].decision, results[1].decision);
        assert.equal(results.filter(result => !result.duplicate).length, 1); counts.concurrentReviewerRaces++;
        await a.receiveFrame((await alice.request({kind: "sync"})).frame);
        const beforeColumn = a.writerClockV2(ar.lease.writer).through;
        a.dispatch({commands: [{kind: "insert_column", data: {block: "table-block", column: "c2", width: 150, before: null}}]});
        await flush(a, alice, beforeColumn);
        const findSecond = node => node.type === "breditor/table-cell" && node.properties["breditor/column-id"] === "c2"
          ? node.properties["breditor/block-id"] : node.children?.map(findSecond).find(Boolean);
        const focus = findSecond(JSON.parse(a.documentJson()).root); assert.equal(typeof focus, "string");
        const mergePacket = capture((await alice.request({kind: "sync"})).frame, "alice", "Server table merge",
          [{kind: "merge_cells", data: {block: "table-block", merge: "accepted-merge", anchor: "cell", focus}}]);
        await publish(alice, mergePacket); await decide(alice, JSON.parse(mergePacket).id);
        for (const [core, wire] of [[a, alice], [b, bob]]) {
          await core.receiveFrame((await wire.request({kind: "sync"})).frame);
          assert.ok(core.view().tables[0].cells.some(cell => cell.columnSpan === 2));
        }
        assert.equal(a.documentJson(), b.documentJson()); counts.serverMergeImports++;
        const replayFrame = (await alice.request({kind: "sync"})).frame;
        const replayPage = (await reader.request({kind: "suggestionSync", binding, cursor: null})).page;
        assert.ok(!legacy.events.some(event => event.kind === "documentSuggestionsChanged"));
        // Current proposal rights are independent from Editor; revocation does not alter old attribution.
        assert.equal((await admin.request({kind: "suggestionGrant", principal: "alice", role: null})).kind, "suggestionGranted");
        assert.equal((await alice.request({kind: "suggestionPublish", binding, packet: raced})).code, "permission_denied");
        assert.equal((await admin.request({kind: "suggestionGrant", principal: "alice", role: "review"})).kind, "suggestionGranted");
        assert.equal((await admin.request({kind: "grant", principal: "dana", role: null})).kind, "granted");
        const denied = new ReviewWireFixture(`ws://${server.address}/ws`); channels.push(denied);
        const refusal = await denied.request({kind: "authenticate", principal: "dana", token: tokens.dana,
          capabilities: ["writerTransportV2", "documentSuggestionsV1"]});
        assert.equal(refusal.code, "permission_denied"); counts.liveReadRevocationRefusals++;
        assert.equal((await admin.request({kind: "grant", principal: "dana", role: "reader"})).kind, "granted");
        const oldAddress = server.address;
        for (const channel of channels) channel.close();
        await server.crash(); server = await startReviewHost(executable, [...paths, oldAddress]);
        const resumed = await connect("alice");
        assert.equal((await resumed.wire.request({kind: "resume", writer: ar.lease.writer, credential: ar.credential})).kind, "resumed");
        assert.equal(resumed.auth.documentSuggestionsDescriptor.binding, binding);
        assert.equal((await resumed.wire.request({kind: "sync"})).frame, replayFrame);
        const recoveredPage = (await resumed.wire.request({kind: "suggestionSync", binding, cursor: null})).page;
        assert.deepEqual(recoveredPage, {...replayPage, permissions: resumed.auth.documentSuggestionsPermissions});
        assert.deepEqual(recoveredPage.permissions, aa.documentSuggestionsPermissions);
        assert.deepEqual((await decide(resumed.wire, pendingId)).decision, accepted.decision);
        const beforeQueuedRetry = readFileSync(paths[0]);
        const queuedResult = await resumed.wire.request({kind: "suggestionDecide",
          decision: JSON.parse(readFileSync(queuedChoice, "utf8"))});
        assert.deepEqual(queuedResult.admission.decision, results[0].decision);
        assert.equal(queuedResult.admission.duplicate, true);
        assert.deepEqual(readFileSync(paths[0]), beforeQueuedRetry); counts.fixtureQueuedOfflineDecisionReplays++;
        assert.equal((await resumed.wire.request({kind: "suggestionPacket", binding, suggestionId: pendingId})).packet, pendingPacket);
        counts.hostRestarts++;
        assert.deepEqual(errors, []); counts.trials++;
      } finally {
        for (const channel of channels) channel.close();
        a?.dispose(); b?.dispose(); if (server) await server.stop();
      }
    }
  } finally { profile.free(); }
  for (const [name, count] of Object.entries(counts)) assert.equal(count, 2, name);
  return {format: "breditor/suggestion-relay-functional-probe", formatVersion: 1,
    nativeRelaySha256: hash(readFileSync(executable)), sharedWasmSha256: hash(bytes), ...counts, passed: true,
    scope: "Actual native source-proven proposals and durable authenticated WebSocket host, with actual application Wasm clients under explicit/natural history. Exact writer-owned Accept, immutable packets, offline source retry, ordinary offline edit retention, conflict/Reject, races, original-winner retry, independent live rights and exact restart. Explicit fixture, not automatic SDK queues, accepting-user Undo, UI, physical browser or production qualification."};
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw Error("Expected application Wasm directory and isolated suggestion host executable");
  console.log(JSON.stringify(await probeSuggestionRelay(...process.argv.slice(2)), null, 2));
}
