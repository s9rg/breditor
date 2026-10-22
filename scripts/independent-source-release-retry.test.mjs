/** A failed actual owner release must remain retryable, without native resurrection. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {IndependentLocalOperationCutJournal as Journal} from '../packages/breditor-collaboration/dist/independent_local_operation/cut_journal.js';
import {openJournaledIndependentLocalHistory as open} from '../packages/breditor-collaboration/dist/independent_local_operation/open_journaled_source.js';
import {localRecoveryUnitHost} from './fixtures/independent-recovery/unit.mjs';
import {localOperationOptions} from './fixtures/independent-local-operation/origin.mjs';
import {localJournalOptions} from './fixtures/independent-local-operation/journal.mjs';
const runtime=process.env.BREDITOR_LOCAL_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;
let host;
before(async()=>{host=await localRecoveryUnitHost({api,rich,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});
after(()=>host?.free());
test('the actual native source retries a failed comment-writer release',async()=>{
 const f=await host.fixture(),close=ReviewWriterLease.prototype.close;
 let source,reopened,held,failOnce=true;
 try{
  source=await api.SharedIndependentHistoryPersistentSession.open(localOperationOptions(f));
  ReviewWriterLease.prototype.close=async function(){held=this;if(failOnce){failOnce=false;throw Error('Interrupted actual comment-writer release');}return close.call(this);};
  await assert.rejects(source.close(),/Interrupted actual comment-writer release/);
  ReviewWriterLease.prototype.close=close;
  await source.discardAndClose();
  assert.equal(source.state().status,'closed');
  assert.throws(()=>source.core.checkpointJson());
  reopened=await api.SharedIndependentHistoryPersistentSession.open(localOperationOptions(f));
  assert.equal(reopened.core.view().readOnly===true,false);
 }finally{ReviewWriterLease.prototype.close=close;if(held)await close.call(held);await source?.discardAndClose().catch(()=>{});await reopened?.discardAndClose();await f.close();}
});
test('source retry settles its actual local journal after a failed journal lease release',async()=>{
 const f=await host.fixture(),close=RecoveryLease.prototype.close;
 let journal,source,reopened,held,failOnce=true;
 try{
  const options=localJournalOptions(f);journal=await Journal.begin({...options,backup:f.backup});source=await open(localOperationOptions(f),journal);
  RecoveryLease.prototype.close=async function(){held=this;if(failOnce){failOnce=false;throw Error('Interrupted actual local journal release');}return close.call(this);};
  await assert.rejects(source.close(),/Interrupted actual local journal release/);
  RecoveryLease.prototype.close=close;
  await source.discardAndClose();
  assert.throws(()=>journal.file(),error=>error.code==='independent_local_operation_closed');
  journal=await Journal.resume(options);reopened=await open(localOperationOptions(f),journal);
  assert.deepEqual(reopened.exportRecovery(),f.recovery);
 }finally{RecoveryLease.prototype.close=close;if(held)await close.call(held);await source?.discardAndClose().catch(()=>{});await reopened?.discardAndClose();await journal?.close();await f.close();}
});
