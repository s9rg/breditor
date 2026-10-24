/** Fresh all-seven composition on actual registrations in one storage/lock host. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sevenNativeFixtures} from './fixtures/physical-operation-v3/seven-native.mjs';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {verifyV3RecoveredParticipant} from './fixtures/physical-operation-v3/participants.mjs';
import {internalFailureChain} from '../packages/breditor-collaboration/dist/internal_failure_cause.js';
const fixtures=await sevenNativeFixtures();
test('fresh whole-room history read survives expired root/leaf jobs and preserves real seven-family custody',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'whole-fresh-history'});
 try{const progress=await f.owner.progress(),before=await snapshotReadDatabases();f.endOldJob();const calls=f.oldCalls,report=await f.owner.readHistory({reads:f.reads,checkAuthority(){}});assert.equal(f.oldCalls,calls);assert.equal(report.format,'breditor/physical-operation-v3-history-read');assert.equal(report.scope,'held-client-history-and-retained-catalog-bytes');assert.equal(report.catalogFilesVerified,10);assert.equal(report.history.participants.length,7);assert.equal(new Set(report.history.participants.map(row=>row.family)).size,7);assert.deepEqual(report.unreconciledParticipants,[]);assert.deepEqual(report.history.references,[], 'This native producer makes text-only documents; stored upload bytes are not invented references');assert.equal('sources'in report,false);assert.equal('coverage'in report,false);assert.equal('activate'in report,false);assert.deepEqual(await snapshotReadDatabases(),before);
  assert.deepEqual(await f.owner.readHistory({reads:f.reads,checkAuthority(){}}),report);for(const row of progress.participants)await assert.rejects(RecoveryLease.acquire(JSON.stringify(row.namespaces.find(ns=>ns.role==='operation').database)),error=>error.code==='recovery_in_use');for(const database of [f.options.database,'whole-fresh-history-catalog'])await assert.rejects(RecoveryLease.acquire(JSON.stringify(database)),error=>error.code==='recovery_in_use');await assert.rejects(f.owner.progress());assert.equal(f.oldCalls,calls, 'Old cancellation refuses progress before its writer grant is called');
  await f.cold();const parts=await f.take();for(const selected of f.participants){const row=parts.participants.find(row=>row.id===selected.id);await verifyV3RecoveredParticipant(selected,f.f.source,row.parts);const core=row.family==='original'?row.parts.session.core:row.parts.source.session.core;assert.equal(core.redo(),true);assert.equal(core.undo(),true);assert.equal(core.redoReview().kind,'committed');assert.equal(core.undoReview().kind,'committed');}assert.equal(f.f.counts.networkCalls,0);
 }catch(error){console.error('Fresh history failure chain',internalFailureChain(error).map(value=>({code:value.code,message:value.message,stack:value.stack})));throw error;}
 finally{await f.close();}
});
