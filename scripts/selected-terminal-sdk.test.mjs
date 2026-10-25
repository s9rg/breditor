import {resolve} from 'node:path';
/** Actual member disposal fault and explicit non-deleting terminal cleanup.
 * Controlled native/session/storage fixtures, not physical durability. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PhysicalRoomAssetAdoption as Adoption,transferRoomAssetAdoption as transfer} from '../packages/breditor-collaboration/dist/physical_room_asset_adoption/coordinator.js';
import {completeImageNativeFixtures} from './fixtures/physical-operation-v3/image-seven-native.mjs';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {roomAssetChoices} from './fixtures/room-asset-adoption/bases.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
let fixtures;before(async()=>{fixtures=await completeImageNativeFixtures(resolve(new URL('../',import.meta.url).pathname));});after(async()=>{await fixtures?.close();});
const caret=core=>{const point={block:'p',offset:'0',affinity:'after'};core.select({kind:'text',anchor:point,focus:point});};
const digest=value=>createHash('sha256').update(value).digest('hex');
for(const disposed of[0,1])test('disposed native member '+disposed+' retires every sibling before failed save; explicit discard preserves durable data and future history',async()=>{
 const tag='selected-terminal-'+disposed,f=await completeHistoryFixture({fixtures,tag,subset:['original','local-operation-flat'],documentSegmented:false,reviewSegmented:false,participantAuthority(){}}),input={reads:f.reads,checkAuthority(){}};let stage,owner;const saved=new Map(),before=new Map(),documents=new Map();
 try{const selected=await roomAssetChoices(f.owner,tag);stage=await Adoption.begin(f.owner,{database:tag+'-stage',participants:selected.participants,checkAuthority(){}});await stage.finish();const expected=await stage.approvalChoice(input);f.endOldJob();owner=await transfer(stage,{...input,expected,approvalDatabase:tag+'-approval',approve:()=>true,checkAssetAuthority(){}});
  for(const row of owner.clients){before.set(row.id,row.core.documentJson());caret(row.core);row.core.type('durably accepted before fault ');saved.set(row.id,[row.core.checkpointJson(),row.core.reviewCheckpoint()]);documents.set(row.id,row.core.documentJson());}await owner.capture(input);const storage=await snapshotReadDatabases(),aliases=owner.clients;aliases[disposed].core.dispose();const closing=owner.close(),refused=assert.rejects(closing,error=>error.code==='disposed');assert.equal(owner.close(),closing);for(const row of aliases){assert.throws(()=>row.core.type('after shutdown'));assert.throws(()=>row.core.redoReview());}await assert.rejects(owner.discardAndClose(),error=>error.code==='asset_adoption_busy');await refused;
  // Failed durable close must NOT silently choose discard or release the room.
  await assert.rejects(owner.close(),error=>error.code==='disposed');const terminal=owner.discardAndClose();assert.equal(owner.discardAndClose(),terminal);await terminal;owner=undefined;assert.deepEqual(await snapshotReadDatabases(),storage);await stage.close();await f.cold();const parts=await f.take();for(const row of parts.participants){const core=row.family==='original'?row.parts.session.core:row.parts.source.session.core;assert.deepEqual([core.checkpointJson(),core.reviewCheckpoint()].map(digest),saved.get(row.id).map(digest),row.id+' exact native pair before future edits');assert.equal(core.undo(),true);assert.equal(core.documentJson(),before.get(row.id));assert.equal(core.redo(),true);assert.equal(core.documentJson(),documents.get(row.id));assert.equal(core.reviewCheckpoint(),saved.get(row.id)[1]);}assert.equal(f.f.counts.networkCalls,0);
 }finally{await owner?.discardAndClose();await stage?.close();await f.close();}
});
