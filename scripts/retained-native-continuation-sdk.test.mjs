/** SDK-private SAME-cut/fresh-job continuation, not editable succession.
 * Normal source-matched public native fixtures are read only; no producer is run. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {withPhysicalOperationV3FreshRetainedNative as borrow} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {recordLiveBasis} from '../packages/breditor-collaboration/dist/complete_operation_cohort/record_live_basis.js';
import {PhysicalRoomRecordCutArchive as Archive} from '../packages/breditor-collaboration/dist/physical_room_record_cut/archive.js';
import {completeImageNativeFixtures} from './fixtures/physical-operation-v3/image-seven-native.mjs';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {secondAsset} from './fixtures/review-assets/pixels.mjs';
import {FreshParentHistoryReservation} from '../packages/breditor-collaboration/dist/operation_read/fresh_parent_reservation.js';
let fixtures;before(async()=>{fixtures=await completeImageNativeFixtures(new URL('../',import.meta.url).pathname);});after(async()=>{await fixtures?.close();});
const input=f=>({reads:f.reads,checkAuthority(){}}),pair=(row,segmented)=>[row.core.checkpointJson(),row.family==='original'||row.family==='generation'||!segmented?row.core.reviewCheckpoint():row.core.reviewSegmentedCheckpoint()];
const caret=core=>{const point={block:'p',offset:'0',affinity:'after'};core.select({kind:'text',anchor:point,focus:point});};
for(const[documentSegmented,reviewSegmented]of[[false,false],[false,true],[true,false],[true,true]])test('SAME full cut retains genuine native clients after expired old grant and cancellation '+documentSegmented+'/'+reviewSegmented,async()=>{
 // The recovery job may end while independently authorized participant writers
 // remain alive. A fresh READ grant never renews a revoked writer grant.
 const f=await completeHistoryFixture({fixtures,tag:'fresh-retained-'+documentSegmented+'-'+reviewSegmented,documentSegmented,reviewSegmented,participantAuthority(){}});let loan,again,archive,alias;const original=new Map(),saved=new Map();
 try{f.endOldJob();const calls=f.oldCalls;loan=await borrow(f.owner,input(f),async(scope,value)=>{archive=await Archive.read(scope.cut.file,scope.cut.selection,{wasm:fixtures.native,checkAuthority(){}});assert.equal(archive.metadata().participants.length,7);for(const row of value.liveBasis())assert.deepEqual(row.value,recordLiveBasis(row.family,await archive.records(row.id)),row.id+' SAME-cut LIVE');archive.dispose();archive=undefined;await assert.rejects(value.close());return value;});assert.equal(f.oldCalls,calls);loan.check();assert.equal(loan.clients.length,7);
  // The legacy origin lock donation must remain live after temporary read
  // cleanup, independently of the ended whole-room recovery-job lifetime.
  alias=await RichAssetStore.openRetained(f.participants.find(row=>row.family==='original').recovery.destinations.uploads);await assert.rejects(alias.cancel(secondAsset),e=>e.code==='asset_custody_busy');alias.close();alias=undefined;
  const actual=loan.clients;await loan.close();loan=undefined;for(const row of actual){original.set(row.id,row.core.documentJson());caret(row.core);row.core.type('fresh-retained-native-edit');assert.equal(row.core.redoReview().kind,'committed');saved.set(row.id,{native:pair(row,reviewSegmented),document:row.core.documentJson(),review:row.core.reviewSnapshot().view});}
  // Actual owners save their native lanes and companion work; never copy an
  // AST, import into substitute owners or use approval as a writer permission.
  await f.owner.close();await f.cold();again=await borrow(f.owner,input(f),async(_scope,value)=>value);for(const row of again.clients){assert.deepEqual(pair(row,reviewSegmented),saved.get(row.id).native,row.id+' exact cold histories');assert.deepEqual(row.core.reviewSnapshot().view,saved.get(row.id).review);}const cold=again.clients;await again.close();again=undefined;for(const row of cold){assert.equal(row.core.undo(),true);assert.equal(row.core.documentJson(),original.get(row.id));assert.equal(row.core.redo(),true);assert.equal(row.core.documentJson(),saved.get(row.id).document);assert.equal(row.core.undoReview().kind,'committed');assert.equal(row.core.redoReview().kind,'committed');}assert.equal(f.f.counts.networkCalls,0);
 }finally{archive?.dispose();alias?.close();await again?.close();await loan?.close();await f.close();}
});
for(const how of ['denied','aborted','callback'])test('fresh retained '+how+' refuses without consuming its genuine parent',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'fresh-retained-refuse-'+how,subset:['original'],participantAuthority(){}}),controller=new AbortController();let loan;
 try{f.endOldJob();const calls=f.oldCalls;if(how==='aborted')controller.abort();await assert.rejects(borrow(f.owner,{...input(f),signal:controller.signal,checkAuthority(){if(how==='denied')throw Error('fresh grant denied');}},async(_scope,value)=>{loan=value;throw Error('successor preparation failed');}));assert.equal(f.oldCalls,calls);if(loan)assert.throws(()=>loan.check());await f.owner.readHistory(input(f));}finally{await loan?.close();await f.close();}
});
test('native work changed by actual temporary-reader cleanup cannot escape as an approved retained session',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'fresh-retained-cleanup-mutation',subset:['original'],participantAuthority(){}}),close=FreshParentHistoryReservation.prototype.close;let loan,core,changed=false;
 try{FreshParentHistoryReservation.prototype.close=function(){close.call(this);if(core&&!changed){changed=true;caret(core);core.type('work changed during actual reader cleanup');}};
  await assert.rejects(borrow(f.owner,input(f),async(_scope,value)=>{loan=value;core=value.clients[0].core;return value;}));assert.equal(changed,true);assert.throws(()=>loan.check());FreshParentHistoryReservation.prototype.close=close;await f.owner.readHistory(input(f));
 }finally{FreshParentHistoryReservation.prototype.close=close;await loan?.close();await f.close();}
});
