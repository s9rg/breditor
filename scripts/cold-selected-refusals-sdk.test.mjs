import {resolve} from 'node:path';
/** Genuine native/storage refusal and retry boundaries. The temporary IDB open
 * observer only detects actual durable intent success; it grants no custody. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
import {PhysicalRoomAssetAdoption as Adoption,transferRoomAssetAdoption as transfer} from '../packages/breditor-collaboration/dist/physical_room_asset_adoption/coordinator.js';
import {SelectedRoomCurrentArchive as Archive,encodeSelectedRoomCurrent as encode} from '../packages/breditor-collaboration/dist/selected_room_current/archive.js';
import {previewColdSelectedRoom as preview,resumeColdSelectedRoom as resume} from '../packages/breditor-collaboration/dist/cold_selected_room/coordinator.js';
import {completeImageNativeFixtures} from './fixtures/physical-operation-v3/image-seven-native.mjs';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {roomAssetChoices} from './fixtures/room-asset-adoption/bases.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
let fixtures;
before(async()=>{fixtures=await completeImageNativeFixtures(resolve(new URL('../',import.meta.url).pathname));});
after(async()=>{await fixtures?.close();});
const input=f=>({reads:f.reads,checkAuthority(){}});
async function prepare(tag,participantAuthority){
 const f=await completeHistoryFixture({fixtures,tag,subset:['original','local-operation-flat'],documentSegmented:false,reviewSegmented:false,participantAuthority});let stage,owner,archive;
 try{const selected=await roomAssetChoices(f.owner,tag);stage=await Adoption.begin(f.owner,{database:tag+'-stage',participants:selected.participants,checkAuthority(){}});await stage.finish();const expected=await stage.approvalChoice(input(f));f.endOldJob();owner=await transfer(stage,{...input(f),expected,approvalDatabase:tag+'-approval',approve:()=>true,checkAssetAuthority(){}});const file=await encode(await owner.capture(input(f)),{wasm:fixtures.native,checkAuthority(){}});await owner.close();owner=undefined;await stage.close();await f.cold();f.endOldJob();archive=await Archive.read(file.file,file.selection,{wasm:fixtures.native,checkAuthority(){}});const proposal=await preview(f.owner,archive,{...input(f),expectedBasis:file.selection,intentDatabase:tag+'-selected-intent'});return{f,stage,archive,proposal,async close(){archive.dispose();await stage.close();await f.close();}};
 }catch(error){archive?.dispose();await owner?.close();await stage?.close();await f.close();throw error;}
}
test('stale, denied and cancelled cold decisions preserve all data and real root; saved intent never supplies a retry decision',async t=>{
 const tag='cold-selected-refusals',refused=Error('independent writer grant revoked after durable intent');let opened=false,revoke=false,calls=0,writerRefusals=0,owner,open,add,put,finish;
 const p=await prepare(tag,()=>{if(opened&&revoke){writerRefusals++;throw refused;}}),{f,archive,proposal}=p,options={...input(f),expected:proposal.choice,checkAssetAuthority(){}};
 try{const unchanged=await snapshotReadDatabases(),stale=structuredClone(proposal.choice);stale.current.sha256=(stale.current.sha256[0]==='a'?'b':'a')+stale.current.sha256.slice(1);
  await assert.rejects(resume(f.owner,archive,{...options,expected:stale,approve(){calls++;return true;}}),error=>error.code==='asset_adoption_diverged');assert.equal(calls,0);assert.deepEqual(await snapshotReadDatabases(),unchanged);
  await assert.rejects(resume(f.owner,archive,{...options,approve(){calls++;return false;}}),error=>error.code==='asset_adoption_policy');assert.equal(calls,1);assert.deepEqual(await snapshotReadDatabases(),unchanged);
  const signal=new AbortController();let entered;const atDecision=new Promise(resolve=>{entered=resolve;}),pending=new Promise(resolve=>{finish=resolve;}),work=resume(f.owner,archive,{...options,signal:signal.signal,approve(){calls++;entered();return pending;}}),cancelled=assert.rejects(work,error=>/aborted/.test(error.code??''));await atDecision;signal.abort();await cancelled;finish(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);assert.deepEqual(await snapshotReadDatabases(),unchanged);await f.owner.readHistory(input(f));
  open=indexedDB.open;indexedDB.open=function(name,...args){const request=open.call(this,name,...args);if(name===proposal.choice.intentDatabase)request.addEventListener('success',()=>{opened=true;});return request;};revoke=true;
  await assert.rejects(resume(f.owner,archive,{...options,approve(){calls++;return true;}}),error=>error.code==='participant_authority');assert.ok(writerRefusals>0,'the actual independent writer callback refused');assert.equal(opened,true,'actual intent success preceded writer refusal');assert.equal(calls,3);revoke=false;indexedDB.open=open;open=undefined;await f.owner.readHistory(input(f));
  const saved=await snapshotReadDatabases(),intent=saved.filter(row=>row.name===proposal.choice.intentDatabase);assert.equal(intent.length,1);t.diagnostic('actual intent is durable; original root remains readable after refused activation');
  await assert.rejects(resume(f.owner,archive,{...options,approve(){calls++;return false;}}),error=>error.code==='asset_adoption_policy');assert.equal(calls,4);assert.deepEqual(await snapshotReadDatabases(),saved);
  add=IDBObjectStore.prototype.add;put=IDBObjectStore.prototype.put;for(const name of['add','put']){const original=name==='add'?add:put;IDBObjectStore.prototype[name]=function(...args){if(this.transaction.db.name===proposal.choice.intentDatabase)throw Error('Exact intent retry must not write');return original.apply(this,args);};}
  owner=await resume(f.owner,archive,{...options,approve(){calls++;return true;}});assert.equal(calls,5);assert.equal(owner.clients.length,2);assert.deepEqual((await snapshotReadDatabases()).filter(row=>row.name===proposal.choice.intentDatabase),intent);await owner.capture(input(f));assert.equal(f.f.counts.networkCalls,0);
 }finally{finish?.(true);revoke=false;if(open)indexedDB.open=open;if(add)IDBObjectStore.prototype.add=add;if(put)IDBObjectStore.prototype.put=put;await owner?.close();await p.close();}
});
