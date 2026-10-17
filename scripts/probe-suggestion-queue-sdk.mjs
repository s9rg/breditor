/** Actual Wasm + exported durable intent queue + paired native journals + authenticated host.
 * Wire orchestration and IndexedDB/Web Locks are fixtures, not automatic sync/browser qualification. */
import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {mkdtempSync, readFileSync, realpathSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath, pathToFileURL} from "node:url";
import {IDBFactory, IDBDatabase} from "fake-indexeddb";
import {SharedRichEditor, createSharedDocumentEditor, SharedReviewPersistentSession, SharedSuggestionQueue} from "../packages/breditor-collaboration/dist/index.js";
import {openQueueDatabase, readQueueRecord, writeQueueRecord} from "../packages/breditor-collaboration/dist/suggestions/database.js";
import {ReviewWireFixture, startReviewHost} from "./probe-review-relay.mjs";
const origin = "http://127.0.0.1:49785", hash = bytes => createHash("sha256").update(bytes).digest("hex");
const save = (path, value) => writeFileSync(path, value, {mode: 0o600});
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const draft = commands => ({scope: "commands", edit: {kind: "commands", data: commands}});
const insert = (block, text) => ({kind: "insert_text", data: {block, offset: 0, text}});
const code = expected => error => error.code === expected;
function locks() {
  const held = new Set();
  return {held, request(name, _options, callback) { return Promise.resolve().then(async () => {
    if (held.has(name)) return callback(null); held.add(name);
    try { return await callback({name}); } finally { held.delete(name); }
  }); }};
}
export async function probeSuggestionQueueSdk(directory, executable) {
  const bytes = readFileSync(resolve(directory, "breditor_shared_bg.wasm"));
  const wasm = await import(pathToFileURL(resolve(directory, "breditor_shared.js")));
  await wasm.default({module_or_path: bytes});
  const configuration = JSON.stringify({format: "breditor/shared-rich-profile", formatVersion: 3,
    schema: {name: "example/suggestion-queue-sdk", version: 1}, extensions: []});
  const profile = wasm.SharedRichProfile.from_standard_configuration_json_v3(configuration);
  const descriptor = JSON.parse(profile.descriptor_json());
  const source = JSON.stringify({format: "breditor/document", formatVersion: 2, schema: descriptor.schema,
    schemaFingerprint: descriptor.schemaFingerprint, root: canonical(JSON.parse(readFileSync(
      new URL("../crates/breditor-core/tests/fixtures/rich-local-root.json", import.meta.url), "utf8")))});
  const originals = new Map(), lockHost = locks(), transaction = IDBDatabase.prototype.transaction;
  let abortDatabase;
  for (const [key, value] of Object.entries({indexedDB: new IDBFactory(), navigator: {locks: lockHost}})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
  }
  IDBDatabase.prototype.transaction = function(...args) {
    const tx = transaction.apply(this, args);
    if (this.name === abortDatabase && args[1] === "readwrite") queueMicrotask(() => { try { tx.abort(); } catch {} });
    return tx;
  };
  const counts = {trials: 0, exactOfflineReopens: 0, localSaveRefusals: 0, receiptSaveRefusals: 0,
    receiptBeforeEffectRefusals: 0, opposingQueuedChoiceReconciliations: 0, originalLostReplyRecoveries: 0,
    missingSourceRefusals: 0, missingEffectRefusals: 0, originalHistoryWorkflows: 0, hostRestarts: 0,
    crossDatabaseLeaseRefusals: 0, borrowedOwnerReplacementRefusals: 0, nativePreviewIdentityRefusals: 0};
  try {
    for (const document of [false, true]) for (const natural of [false, true]) {
      const trial = counts.trials, temporary = mkdtempSync(join(tmpdir(), "breditor-suggestion-queue-"));
      const paths = ["room.log", "profile.json", "document.json", "auth.json"].map(name => join(temporary, name));
      const tokens = Object.fromEntries(["alice", "bob"].map(principal => [principal, randomBytes(32).toString("hex")]));
      save(paths[1], configuration); save(paths[2], source);
      save(paths[3], JSON.stringify({format: "breditor/relay-auth", formatVersion: 1, origins: [origin],
        accounts: Object.entries(tokens).map(([principal, token]) => ({principal, tokenHash: [...createHash("sha256").update(token).digest()]}))}));
      const sessions = {}, queues = {}, identities = {}, registrations = {}, sessionOptions = {}, queueOptions = {}, channels = [];
      let server, db, phase = "start";
      const restore = (checkpoint, policy) => document
        ? (policy.history === "typing-v1" ? profile.restore_document_typing("room", checkpoint) : profile.restore_document("room", checkpoint))
        : (policy.history === "typing-v1" ? profile.restore_typing("room", checkpoint) : profile.restore("room", checkpoint));
      const connect = async principal => {
        const wire = new ReviewWireFixture(`ws://${server.address}/ws`); channels.push(wire);
        const auth = await wire.request({kind: "authenticate", principal, token: tokens[principal], capabilities: ["writerTransportV2", "documentSuggestionsV1"]});
        assert.equal(auth.kind, "authenticated"); return {wire, auth};
      };
      const openQueue = async principal => queues[principal] = await SharedSuggestionQueue.open({...queueOptions[principal], storage: sessions[principal]});
      const flushDocument = async (principal, wire, after = "0") => {
        for (const group of sessions[principal].core.writerGroupsV2(after).groups)
          assert.equal((await wire.request({kind: "submit", group})).kind, "durable");
      };
      const choose = async (wire, id, decision) => {
        const response = await wire.request({kind: "suggestionDecide", decision: {binding: identities.alice.binding, suggestionId: id, decision}});
        assert.equal(response.kind, "suggestionDecisionAdmission"); assert.equal(response.admission.kind, "durable"); return response.admission.decision;
      };
      const publish = async (principal, wire, id) => {
        const response = await wire.request({kind: "suggestionPublish", binding: identities[principal].binding, packet: queues[principal].packet(id)});
        assert.equal(response.kind, "suggestionAdmission"); return response.admission;
      };
      try {
        server = await startReviewHost(executable, [...paths, "127.0.0.1:0"]);
        const wires = {};
        for (const principal of ["alice", "bob"]) {
          const {wire, auth} = await connect(principal); wires[principal] = wire;
          const registration = (await wire.request({kind: "register"})).registration; registrations[principal] = registration;
          identities[principal] = {endpoint: `ws://${server.address}/ws`, principal, room: "room",
            binding: auth.documentSuggestionsDescriptor.binding, documentWriter: registration.lease.writer,
            effectWriter: auth.documentSuggestionsDescriptor.effectWriter, writerTransport: "atomic-v2"};
          sessionOptions[principal] = {database: `suggestion-${trial}-paired-${principal}`, room: "room", writer: registration.lease.writer,
            review: {actor: `suggestion-${trial}-${principal}`, principal, access: "comment"}, richLanguage: 3,
            history: natural ? "typing-v1" : "explicit", rangeEditing: document ? "general-v1" : "original",
            selectionEditing: document ? "document-v1" : "original", create: () => profile.join_frame("room", registration.lease.writer, auth.frame), restore};
          sessions[principal] = await SharedReviewPersistentSession.open(sessionOptions[principal]);
          queueOptions[principal] = {database: `suggestion-${trial}-queue-${principal}`, identity: identities[principal]};
          await openQueue(principal);
        }
        let a = sessions.alice.core;
        const cloneRaw = restore(a.checkpointJson(), sessionOptions.alice), clone = document ? createSharedDocumentEditor(cloneRaw) : new SharedRichEditor(cloneRaw);
        try { await assert.rejects(SharedSuggestionQueue.open({...queueOptions.alice, database: `${queueOptions.alice.database}-other`, storage: {core: clone, save() {}, flush: async () => {}}}), code("suggestion_queue_in_use")); }
        finally { clone.dispose(); } counts.crossDatabaseLeaseRefusals++;
        const initialPair = sessions.alice.exportRecovery();
        a.dispatch({commands: [insert("p", "Ordinary offline text ")]});
        a.dispatchReview({kind: "create_thread", data: {anchorJson: a.captureReviewAnchor({kind: "document"}), body: "Comment history is independent"}});
        const beforeProposal = sessions.alice.exportRecovery();
        const info = queues.alice.propose("Durable offline proposal 日本 🙂", "1792200000000", draft([insert("caption", "Accepted proposal ")]));
        const packet = queues.alice.packet(info.id), ready = a.prepareSuggestion(packet); assert.equal(ready.kind, "ready");
        assert.equal(queues.alice.queueDecision(info.id, "accept", "1792200000001", ready.preview), true);
        assert.equal(queues.alice.queueDecision(info.id, "accept", "1792200000009", ready.preview), false);
        assert.throws(() => queues.alice.queueDecision(info.id, "reject", "1792200000002"), code("suggestion_decision_already_queued"));
        ready.preview.dispose(); await queues.alice.flush();
        assert.deepEqual(sessions.alice.exportRecovery(), beforeProposal);
        const savedQueue = queues.alice.exportRecovery();
        assert.equal(queues.alice.status(info.id).localSaved, true); assert.equal(queues.alice.status(info.id).decision, null);
        phase = "offline reopen";
        await queues.alice.close(); await sessions.alice.close();
        sessions.alice = await SharedReviewPersistentSession.open(sessionOptions.alice); a = sessions.alice.core;
        assert.deepEqual(sessions.alice.exportRecovery(), beforeProposal); await openQueue("alice");
        assert.deepEqual(queues.alice.exportRecovery(), savedQueue); assert.equal(queues.alice.packet(info.id), packet); counts.exactOfflineReopens++;
        db = await openQueueDatabase(queueOptions.alice.database);
        phase = "failed local save/close";
        const durableBefore = await readQueueRecord(db, identities.alice);
        abortDatabase = queueOptions.alice.database;
        const side = queues.alice.propose("Independent image field", "1792200000002", draft([{kind: "set_image_alt", data: {block: "image-block", text: "Accepted alt", decorative: false}}]));
        await assert.rejects(queues.alice.flush()); assert.equal(queues.alice.status(side.id).localSaved, false);
        assert.deepEqual(await readQueueRecord(db, identities.alice), durableBefore);
        await assert.rejects(queues.alice.close()); assert.throws(() => queues.alice.propose("After close", "0", draft([insert("p", "No")])) , code("suggestion_queue_closing"));
        await assert.rejects(SharedSuggestionQueue.open({...queueOptions.alice, storage: sessions.alice}), code("suggestion_queue_already_attached"));
        a.view(); abortDatabase = undefined; await queues.alice.retry(); await queues.alice.close(); await openQueue("alice"); counts.localSaveRefusals++;
        const mismatched = a.prepareSuggestion(packet); assert.equal(mismatched.kind, "ready");
        const realSummary = mismatched.preview.summary();
        mismatched.preview.summary = () => ({...realSummary, suggestion: {...realSummary.suggestion, id: side.id}});
        assert.throws(() => queues.alice.queueDecision(side.id, "accept", "1792200000004", mismatched.preview), /proposal identity differs/);
        assert.equal(queues.alice.status(side.id).intent, null); mismatched.preview.dispose(); counts.nativePreviewIdentityRefusals++;
        phase = "publish missing source";
        assert.equal((await publish("alice", wires.alice, info.id)).kind, "pending");
        assert.equal(queues.alice.status(info.id).publication, null);
        await flushDocument("alice", wires.alice);
        const published = await publish("alice", wires.alice, info.id); assert.equal(published.kind, "durable");
        await queues.alice.receiveVerifiedPublication(info.id, published.publication);
        await queues.bob.cacheVerifiedProposal(packet, published.publication);
        queues.bob.queueDecision(info.id, "reject", "1792200000003"); await queues.bob.flush();
        const sourceBeforeEffect = sessions.alice.exportRecovery();
        phase = "decision receipt before effect";
        const accepted = await choose(wires.alice, info.id, "accept");
        const beforeReceipt = await readQueueRecord(db, identities.alice);
        assert.equal(await queues.alice.receiveVerifiedDecision(info.id, accepted), "waitingForDocument");
        assert.equal(queues.alice.status(info.id).decision, null); assert.equal(queues.alice.status(info.id).intent.retry, true);
        assert.deepEqual(await readQueueRecord(db, identities.alice), beforeReceipt); counts.receiptBeforeEffectRefusals++;
        await a.receiveFrame((await wires.alice.request({kind: "sync"})).frame);
        phase = "failed final receipt save"; abortDatabase = queueOptions.alice.database;
        await assert.rejects(queues.alice.receiveVerifiedDecision(info.id, accepted));
        assert.equal(queues.alice.status(info.id).localSaved, false); assert.deepEqual(await readQueueRecord(db, identities.alice), beforeReceipt);
        abortDatabase = undefined; await queues.alice.discardAndClose();
        const pairedAfterEffect = sessions.alice.exportRecovery(); await sessions.alice.close();
        sessions.alice = await SharedReviewPersistentSession.open(sessionOptions.alice); a = sessions.alice.core;
        assert.deepEqual(sessions.alice.exportRecovery(), pairedAfterEffect); await openQueue("alice");
        assert.equal(queues.alice.status(info.id).decision, null); counts.receiptSaveRefusals++;
        const beforeRetry = readFileSync(paths[0]);
        const repeated = await choose(wires.alice, info.id, "accept"); assert.deepEqual(repeated, accepted);
        assert.deepEqual(readFileSync(paths[0]), beforeRetry);
        assert.equal(await queues.alice.receiveVerifiedDecision(info.id, repeated), "retained"); counts.originalLostReplyRecoveries++;
        const opposite = await choose(wires.bob, info.id, "reject"); assert.deepEqual(opposite, accepted);
        assert.equal(await queues.bob.receiveVerifiedDecision(info.id, opposite), "waitingForDocument");
        await sessions.bob.core.receiveFrame((await wires.bob.request({kind: "sync"})).frame);
        assert.equal(await queues.bob.receiveVerifiedDecision(info.id, opposite), "retained");
        assert.equal(queues.bob.status(info.id).intent.requested, "reject"); assert.equal(queues.bob.status(info.id).intent.retry, false);
        assert.equal(queues.bob.status(info.id).decision.decision, "accept"); counts.opposingQueuedChoiceReconciliations++;
        phase = "later host effect and original receipt";
        const sidePublication = await publish("alice", wires.alice, side.id); assert.equal(sidePublication.kind, "durable");
        await queues.alice.receiveVerifiedPublication(side.id, sidePublication.publication);
        const later = await choose(wires.bob, side.id, "accept");
        for (const principal of ["alice", "bob"]) await sessions[principal].core.receiveFrame((await wires[principal].request({kind: "sync"})).frame);
        await queues.alice.receiveVerifiedDecision(side.id, later);
        assert.equal(await queues.alice.receiveVerifiedDecision(info.id, accepted), "retained");
        assert.equal(a.documentJson(), sessions.bob.core.documentJson()); assert.match(a.documentJson(), /Accepted proposal /);
        assert.equal((a.documentJson().match(/Accepted proposal /g) ?? []).length, 1);
        phase = "older native source and effect refusal";
        await queues.alice.close();
        for (const [pair, expected] of [[initialPair, "suggestion_local_source_missing"], [sourceBeforeEffect, "suggestion_effect_not_retained"]]) {
          const raw = restore(pair.documentCheckpointJson, sessionOptions.alice), old = document ? createSharedDocumentEditor(raw) : new SharedRichEditor(raw);
          try { await assert.rejects(SharedSuggestionQueue.open({...queueOptions.alice, storage: {core: old, save() {}, flush: async () => {}}}), code(expected)); }
          finally { old.dispose(); }
          if (expected === "suggestion_local_source_missing") counts.missingSourceRefusals++; else counts.missingEffectRefusals++;
        }
        await openQueue("alice");
        const recovery = queues.alice.exportRecovery(); recovery.identity.principal = "tampered";
        assert.notEqual(queues.alice.exportRecovery().identity.principal, recovery.identity.principal);
        await assert.rejects(writeQueueRecord(db, identities.alice, {...queues.alice.exportRecovery(), token: "not portable"}));
        const beforeFinal = a.documentJson(); assert.equal(a.undo(), true); assert.ok(!a.documentJson().includes("Ordinary offline text "));
        assert.match(a.documentJson(), /Accepted proposal /); assert.equal(a.undoReview().kind, "committed"); assert.equal(a.redo(), true); assert.equal(a.redoReview().kind, "committed");
        assert.equal(a.documentJson(), beforeFinal); await sessions.alice.flush(); counts.originalHistoryWorkflows++;
        phase = "borrowed owner replacement during save";
        await queues.alice.close();
        let replaceDuringFlush = false;
        const borrowed = {core: a, save: () => sessions.alice.save(), flush: async () => {
          await sessions.alice.flush(); if (replaceDuringFlush) borrowed.core = sessions.bob.core;
        }};
        queues.alice = await SharedSuggestionQueue.open({...queueOptions.alice, storage: borrowed});
        const unchangedRecord = await readQueueRecord(db, identities.alice);
        replaceDuringFlush = true;
        const extra = queues.alice.propose("Later offline proposal", "1792200000099", draft([{kind: "set_heading", data: {block: "p", level: 5}}]));
        await assert.rejects(queues.alice.flush(), code("suggestion_source_replaced"));
        assert.equal(queues.alice.status(extra.id).localSaved, false);
        assert.deepEqual(await readQueueRecord(db, identities.alice), unchangedRecord);
        assert.throws(() => queues.alice.queuePacket(packet), code("suggestion_source_replaced"));
        assert.ok(queues.alice.exportRecovery().retained.some(row => row.packet === queues.alice.packet(extra.id)));
        replaceDuringFlush = false; borrowed.core = a; await queues.alice.retry();
        await queues.alice.close(); await openQueue("alice"); counts.borrowedOwnerReplacementRefusals++;
        phase = "native host restart";
        const address = server.address; for (const wire of channels) wire.close(); await server.crash();
        server = await startReviewHost(executable, [...paths, address]);
        const resumed = await connect("alice");
        assert.equal((await resumed.wire.request({kind: "resume", writer: registrations.alice.lease.writer, credential: registrations.alice.credential})).kind, "resumed");
        assert.deepEqual(await choose(resumed.wire, info.id, "reject"), accepted);
        assert.equal(queues.alice.status(info.id).localSaved, true); counts.hostRestarts++;
        const beforeClose = sessions.alice.exportRecovery(), finalQueue = queues.alice.exportRecovery();
        await queues.alice.close(); await sessions.alice.close();
        sessions.alice = await SharedReviewPersistentSession.open(sessionOptions.alice); await openQueue("alice");
        assert.deepEqual(sessions.alice.exportRecovery(), beforeClose); assert.deepEqual(queues.alice.exportRecovery(), finalQueue); counts.exactOfflineReopens++;
        counts.trials++;
      } catch (error) { throw Error(`Suggestion queue trial ${trial} (${document}/${natural}), ${phase}`, {cause: error}); }
      finally { abortDatabase = undefined; db?.close(); for (const wire of channels) wire.close(); for (const principal of ["alice", "bob"]) { await queues[principal]?.discardAndClose(); await sessions[principal]?.discardAndClose(); } if (server) await server.stop(); }
    }
  } finally {
    IDBDatabase.prototype.transaction = transaction; profile.free();
    for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
  assert.equal(lockHost.held.size, 0);
  for (const [name, count] of Object.entries(counts)) assert.equal(count, name === "exactOfflineReopens" ? 8 : 4, name);
  return {format: "breditor/suggestion-queue-sdk-probe", formatVersion: 1, sharedWasmSha256: hash(bytes),
    nativeRelaySha256: hash(readFileSync(executable)), ...counts, passed: true,
    scope: "Actual application Wasm, exported durable suggestion queue and paired document/comment sessions, with authenticated native publication/decisions. Four selection/history combinations, real native source/effect proof, exact IDB recovery, failed local/receipt saves, lost/opposing retries, selective original histories and host restart. IDB/locks and wire driving are fixtures. Automatic author transport has a separate probe; accepting-user Undo, review UI and installed mixed acceptance remain active work."};
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw Error("Expected matching application Wasm and isolated native suggestion host");
  console.log(JSON.stringify(await probeSuggestionQueueSdk(...process.argv.slice(2)), null, 2));
}
