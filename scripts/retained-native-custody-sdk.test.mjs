/** Actual origin-custody continuation, NOT parent ownership transfer
 * or the selected-asset successor. Normal native inputs are never regenerated. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {withPhysicalOperationV3FreshRetainedNative as borrow,capturePhysicalOperationV3WithOriginCustody as capture} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {takeRetainedNativeOriginCustody as take} from '../packages/breditor-collaboration/dist/complete_operation_cohort/retained_native_read.js';
import {PhysicalRoomRecordCutArchive as Archive} from '../packages/breditor-collaboration/dist/physical_room_record_cut/archive.js';
import {recordLiveBasis} from '../packages/breditor-collaboration/dist/complete_operation_cohort/record_live_basis.js';
import {completeImageNativeFixtures} from './fixtures/physical-operation-v3/image-seven-native.mjs';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {secondAsset} from './fixtures/review-assets/pixels.mjs';
import {holdOperationalAssets} from '../packages/breditor-collaboration/dist/operation_cohort/assets.js';
let fixtures;before(async()=>{fixtures=await completeImageNativeFixtures(new URL('../',import.meta.url).pathname);});after(async()=>{await fixtures?.close();});
const input=f=>({reads:f.reads,checkAuthority(){}}),caret=core=>{const point={block:'p',offset:'0',affinity:'after'};core.select({kind:'text',anchor:point,focus:point});};
test('a current full cut reuses actual held legacy origins and never releases them on reader cleanup',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'inherit-origin-live',subset:['original','generation'],participantAuthority(){}});let loan,held,alias,archive;const saved=new Map();
 try{f.endOldJob();const calls=f.oldCalls;loan=await borrow(f.owner,input(f),async(_scope,value)=>value);held=take(loan);assert.throws(()=>take(loan));assert.throws(()=>loan.check());await loan.close();const first=await capture(f.owner,input(f),held.assets);
  for(const row of f.participants){alias=await RichAssetStore.openRetained(row.recovery.destinations.uploads);await assert.rejects(alias.cancel(secondAsset),e=>e.code==='asset_custody_busy');alias.close();alias=undefined;}held.assets.check();assert.equal(f.oldCalls,calls);
  // Subsequent work is native work under the independently supplied existing
  // participant grant, not a new grant from the retained reader or data file.
  for(const row of held.clients){caret(row.core);row.core.type('inherited-origin-work');saved.set(row.id,row.core.checkpointJson());}const next=await capture(f.owner,input(f),held.assets);assert.notEqual(next.selection.sha256,first.selection.sha256);archive=await Archive.read(next.file,next.selection,{wasm:fixtures.native,checkAuthority(){}});for(const row of held.clients){const data=recordLiveBasis(row.family,await archive.records(row.id));assert.equal(data[0].json,saved.get(row.id));}archive.dispose();archive=undefined;held.assets.check();
  await held.assets.close();held=undefined;await f.owner.close();await f.cold();loan=await borrow(f.owner,input(f),async(_scope,value)=>value);for(const row of loan.clients)assert.equal(row.core.checkpointJson(),saved.get(row.id),row.id+' exact actual cold native state');await loan.close();loan=undefined;
 }finally{archive?.dispose();alias?.close();await held?.assets.close();await loan?.close();await f.close();}
});
test('copied or fake custody refuses before fresh grants and cannot drop the real origin lock',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'inherit-origin-forged',subset:['original'],participantAuthority(){}});let loan,held;
 try{loan=await borrow(f.owner,input(f),async(_scope,value)=>value);held=take(loan);let calls=0;for(const fake of [{check(){},close:async()=>{},release(){}},{...held.assets}])await assert.rejects(capture(f.owner,{...input(f),checkAuthority(){calls++;}},fake));assert.equal(calls,0);held.assets.check();await capture(f.owner,input(f),held.assets);held.assets.check();}finally{await held?.assets.close();await loan?.close();await f.close();}
});
test('a genuine custody token for unrelated stores cannot stand in for the actual selected stores',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'inherit-origin-identity',subset:['original'],participantAuthority(){}});let store,assets;
 try{store=await RichAssetStore.open('inherit-origin-unrelated-uploads');assets=await holdOperationalAssets([store]);let calls=0;await assert.rejects(capture(f.owner,{...input(f),checkAuthority(){calls++;}},assets));assert.equal(calls,0);assets.check();await f.owner.readHistory(input(f));assets.check();}finally{await assets?.close();store?.close();await f.close();}
});
