/** Root close waits for a failed read to release child borrows before cleanup. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sevenNativeFixtures} from './fixtures/physical-operation-v3/seven-native.mjs';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
const fixtures=await sevenNativeFixtures();
test('closing during fresh read permission releases temporary custody and remains cold recoverable',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'history-read-close'});let closing;
 try{const stored=await snapshotReadDatabases();await assert.rejects(f.owner.readHistory({reads:f.reads,checkAuthority(){closing??=f.owner.discardAndClose();}}));assert.ok(closing);await closing;await assert.rejects(f.owner.readHistory({reads:f.reads,checkAuthority(){throw Error('Closed owner must refuse before permission');}}));assert.deepEqual(await snapshotReadDatabases(),stored);await f.cold();const report=await f.owner.readHistory({reads:f.reads,checkAuthority(){}});assert.equal(report.history.participants.length,7);assert.deepEqual(await snapshotReadDatabases(),stored);}
 finally{await closing;await f.close();}
});
