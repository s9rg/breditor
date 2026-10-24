/** Orchestration matrix: all four independent history pairs, both wire modes
 * and each rich language. Family-specific record/profile laws remain cumulative. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sevenNativeFixtures} from './fixtures/physical-operation-v3/seven-native.mjs';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {verifyV3RecoveredParticipant} from './fixtures/physical-operation-v3/participants.mjs';
const fixtures=await sevenNativeFixtures(),cases=[...[false,true].flatMap(documentSegmented=>[false,true].map(reviewSegmented=>({item:fixtures.manifest.cases[9],documentSegmented,reviewSegmented}))),{item:fixtures.manifest.cases[0],documentSegmented:false,reviewSegmented:false},{item:fixtures.manifest.cases[3],documentSegmented:true,reviewSegmented:false}];
assert.equal(cases.length,6);
for(const[index,selection]of cases.entries())test(`fresh same-room orchestration matrix ${index}`,async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'history-matrix-'+index,...selection});
 try{const before=await snapshotReadDatabases();f.endOldJob({cancel:false});const calls=f.oldCalls,report=await f.owner.readHistory({reads:f.reads,checkAuthority(){}});assert.equal(f.oldCalls,calls);assert.equal(report.history.participants.length,7);assert.equal(new Set(report.history.participants.map(row=>row.family)).size,7);assert.equal(report.catalogFilesVerified,10);assert.deepEqual(report.unreconciledParticipants,[]);assert.deepEqual(await snapshotReadDatabases(),before);f.allowOldJob();const parts=await f.take();assert.equal(parts.participants.length,7);for(const selected of f.participants){const row=parts.participants.find(row=>row.id===selected.id);await verifyV3RecoveredParticipant(selected,f.f.source,row.parts);const core=row.family==='original'?row.parts.session.core:row.parts.source.session.core,document=core.documentJson();assert.equal(core.redo(),true);assert.equal(core.undo(),true);assert.equal(core.documentJson(),document);assert.equal(core.redoReview().kind,'committed');assert.equal(core.undoReview().kind,'committed');assert.equal((await row.parts.uploads.list()).length,2);}assert.equal(f.f.counts.networkCalls,0);}
 finally{await f.close();}
});
