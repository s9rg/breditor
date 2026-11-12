/** Closed data-framing laws only. Synthetic hashes are not native admission. */
import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {recordCutJson} from '../packages/breditor-collaboration/dist/physical_room_record_cut/json.js';
import {selectedRoomCurrentManifest as manifest,selectedRoomCurrentSelection as selection,MAX_SELECTED_ROOM_CURRENT_BYTES as maximum,MAX_SELECTED_ROOM_CURRENT_HEADER_BYTES as headerMaximum,SELECTED_ROOM_CURRENT_MAGIC as magic} from '../packages/breditor-collaboration/dist/selected_room_current/manifest.js';
import {encodeSelectedRoomCurrent as encode,SelectedRoomCurrentArchive as Archive} from '../packages/breditor-collaboration/dist/selected_room_current/archive.js';
const hash='a'.repeat(64),base=()=>({format:'breditor/selected-room-current',formatVersion:1,approval:{format:'breditor/room-asset-approval-selection',formatVersion:1,bytes:1,sha256:hash},current:{format:'breditor/physical-room-record-cut-selection',formatVersion:1,bytes:1,sha256:hash},uploads:[{id:'a',database:'selected a 🙂',bytes:1,sha256:hash},{id:'b',database:'selected b',bytes:1,sha256:hash}]}),pin=()=>({format:'breditor/selected-room-current-selection',formatVersion:1,bytes:4,sha256:hash});
test('complete manifest detaches and freezes every exact independent pin and database spelling',()=>{const input=base(),copy=manifest(input);input.uploads[0].database='changed';assert.equal(copy.uploads[0].database,'selected a 🙂');assert.ok(Object.isFrozen(copy));assert.ok(Object.isFrozen(copy.uploads[0]));assert.ok(Object.isFrozen(copy.approval));assert.equal(copy.approval.format,'breditor/room-asset-approval-selection');assert.equal(copy.current.format,'breditor/physical-room-record-cut-selection');});
for(const bad of['extra','version','wrong-approval','wrong-cut','duplicate','unsorted','alias','sparse','negative-zero','empty','hash','budget'])test('manifest refuses '+bad+' rather than normalizing or dropping any source',()=>{const r=base();if(bad==='extra')r.activate=true;else if(bad==='version')r.formatVersion=2;else if(bad==='wrong-approval')r.approval.format='breditor/selected-room-current-selection';else if(bad==='wrong-cut')r.current.format='breditor/room-asset-approval-selection';else if(bad==='duplicate')r.uploads[1].id='a';else if(bad==='unsorted')r.uploads.reverse();else if(bad==='alias')r.uploads[1].database=r.uploads[0].database;else if(bad==='sparse')delete r.uploads[0];else if(bad==='negative-zero')r.uploads[0].bytes=-0;else if(bad==='empty')r.uploads=[];else if(bad==='hash')r.uploads[0].sha256='z'.repeat(64);else r.current.bytes=maximum;assert.throws(()=>manifest(r));});
test('accessors refuse without evaluating them and caller map overrides cannot change framing',()=>{let calls=0;const r=base();Object.defineProperty(r.uploads[0],'database',{enumerable:true,get(){calls++;return'selected';}});assert.throws(()=>manifest(r));assert.equal(calls,0);const altered=base();altered.uploads.map=()=>{calls++;return[];};assert.throws(()=>manifest(altered));assert.equal(calls,0);});
for(const bad of['format','version','zero','budget','hash','extra'])test('outside pin refuses '+bad,()=>{const r=pin();if(bad==='format')r.format='breditor/room-asset-approval-selection';else if(bad==='version')r.formatVersion=2;else if(bad==='zero')r.bytes=0;else if(bad==='budget')r.bytes=maximum+1;else if(bad==='hash')r.sha256='A'.repeat(64);else r.owner=true;assert.throws(()=>selection(r));});
test('an accessor-shaped incoming tuple cannot invoke authority or become an owner',async()=>{let getters=0,grants=0;const input={root:{},uploads:[],get approval(){getters++;return{};}};await assert.rejects(encode(input,{wasm:{},checkAuthority(){grants++;}}));assert.equal(getters,0);assert.equal(grants,0);});

test('selected current decodes its header within the verified whole-file read', async t=>{
 await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 const header=Buffer.from(recordCutJson(manifest(base()),headerMaximum));
 const prefix=Buffer.alloc(Buffer.byteLength(magic)+4);
 prefix.write(magic);
 prefix.writeUInt32LE(header.byteLength,prefix.byteLength-4);
 // The outer archive is complete. The one-byte approval payload deliberately
 // stops admission as soon as the verified outer header has been decoded.
 const bytes=Buffer.concat([prefix,header,Buffer.alloc(4)]);
 const expected={...pin(),bytes:bytes.byteLength,sha256:createHash('sha256').update(bytes).digest('hex')};
 const read=Blob.prototype.arrayBuffer,readSizes=[];
 t.mock.method(Blob.prototype,'arrayBuffer',function(){
  readSizes.push(this.size);
  return read.call(this);
 });
 await assert.rejects(Archive.read(new Blob([bytes]),expected,{wasm:native,checkAuthority(){}}),{code:'asset_adoption_diverged'});
 assert.ok(readSizes.includes(bytes.byteLength),'Whole-file verification must still run');
 assert.ok(!readSizes.includes(header.byteLength),'Decoding must not trigger a separate header read');
});
