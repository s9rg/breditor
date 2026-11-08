/** Functional DATA laws using an independently selected complete seven-family
 * cut. Supply BREDITOR_RECORD_CUT_SNAPSHOT_FIXTURE with cut.archive and selection.json;
 * the default is target/record-cut-snapshot-fixture. Missing input fails, never skips.
 * An installed consumer runs these same assertions with module paths rewritten. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {PhysicalRoomRecordCutArchive as Archive} from '../packages/breditor-collaboration/dist/physical_room_record_cut/archive.js';
import {encodePhysicalRoomRecordCut as encode} from '../packages/breditor-collaboration/dist/physical_room_record_cut/capture.js';
import {prepareArchiveIntegrity} from '../packages/breditor-collaboration/dist/archive_integrity/context.js';
import {recordCutHeader} from '../packages/breditor-collaboration/dist/physical_room_record_cut/framing.js';
import {readRecordCutManifest} from '../packages/breditor-collaboration/dist/physical_room_record_cut/manifest.js';
const fixture=process.env.BREDITOR_RECORD_CUT_SNAPSHOT_FIXTURE??new URL('../target/record-cut-snapshot-fixture/',import.meta.url).pathname;
let bytes,selection,archive,template,context,options;
before(async()=>{
 bytes=fs.readFileSync(resolve(fixture,'cut.archive'));selection=JSON.parse(fs.readFileSync(resolve(fixture,'selection.json')));
 assert.equal(bytes.length,selection.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),selection.sha256);
 await native.default({module_or_path:fs.readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 options={wasm:{SharedArchiveDigest:native.SharedArchiveDigest},checkAuthority(){}};context=prepareArchiveIntegrity(options);
 archive=await Archive.read(new Blob([bytes]),selection,options);const root=archive.root(),participants=[];
 assert.equal(root.participants.length,7);assert.equal(new Set(root.participants.map(row=>row.family)).size,7);
 for(const row of root.participants)participants.push({id:row.id,family:row.family,payload:{family:row.family,state:await archive.records(row.id),files:archive.inputs(row.id).map(row=>({...row}))}});
 template={root:{operationDatabase:root.database,catalogDatabase:root.source.catalogDatabase,record:root,files:[...archive.catalogFiles()].map(([name,file])=>({name,file}))},history:archive.history(),participants,uploads:root.participants.map(row=>({id:row.id,family:row.family,file:archive.uploads(row.id)}))};
});
after(()=>archive?.dispose());
function input(){return{root:{...template.root,record:structuredClone(template.root.record),files:template.root.files.map(row=>({...row}))},history:structuredClone(template.history),participants:template.participants.map(row=>({...row,payload:{...row.payload,state:structuredClone(row.payload.state),files:row.payload.files.map(file=>({...file}))}})),uploads:template.uploads.map(row=>({...row}))};}
async function exact(result){assert.deepEqual(result.selection,selection);assert.deepEqual(Buffer.from(await result.file.arrayBuffer()),bytes);}
const changed=file=>new Blob([Uint8Array.of(0),file.slice(1)],{type:file.type});
const mutations=[
 ['opaque Native checkpoint',i=>{const live=i.participants.find(row=>row.family==='original').payload.state.source.native.live;const key=Object.hasOwn(live,'documentCheckpointJson')?'documentCheckpointJson':'checkpoint';live[key]+=' ';}],
 ['nested history values',i=>i.history.history.references.push({changed:true})],
 ['literal catalog bytes',i=>{i.root.files[0].file=changed(i.root.files[0].file);}],
 ['catalog descriptor',i=>{i.root.files[0].name='changed';}],
 ['complete upload',i=>{i.uploads[0].file=changed(i.uploads[0].file);}],
 ['literal participant input',i=>{const files=i.participants[0].payload.files;files[0].file=changed(files[0].file);}],
 ['participant input role',i=>{i.participants[0].payload.files[0].role='changed';}],
 ['participant descriptor',i=>{i.participants[0].id='changed';}],
 ['ordered participant array',i=>i.participants.reverse()],
 ['top-level request members',i=>{i.root=null;i.history=null;i.participants=[];i.uploads=[];}],
];
test('unchanged capture is byte-identical and cold retains every actual source/input',async()=>{
 const result=await encode(input(),context);await exact(result);const cold=await Archive.read(result.file,result.selection,options);
 try{assert.deepEqual(cold.root(),template.root.record);assert.deepEqual(cold.history(),template.history);for(const row of template.participants){assert.deepEqual(await cold.records(row.id),row.payload.state);assert.deepEqual(await cold.uploads(row.id).arrayBuffer(),await archive.uploads(row.id).arrayBuffer());for(const[index,file]of cold.inputs(row.id).entries()){assert.equal(file.role,row.payload.files[index].role);assert.deepEqual(await file.file.arrayBuffer(),await row.payload.files[index].file.arrayBuffer());}}}finally{cold.dispose();}
});
for(const[label,mutate]of mutations)test('an awaited hash cannot replace '+label,async()=>{
 const request=input();let hashes=0;const result=await encode(request,{guard:context.guard,async digest(file){const value=await context.digest(file);if(++hashes===1)mutate(request);return value;}});assert.ok(hashes>1);await exact(result);
});
test('the first authority callback cannot replace the invocation-time request',async()=>{
 const request=input();let checks=0;const result=await encode(request,{guard(){if(++checks===1)for(const[,mutate]of mutations)mutate(request);context.guard();},digest:context.digest});await exact(result);
});
test('caller mutations immediately after invocation cannot change the pending file',async()=>{
 const request=input(),work=encode(request,context);for(const[,mutate]of mutations)mutate(request);await exact(await work);
});
test('failed hashing preserves the exact error and leaves caller-owned input usable',async()=>{
 const request=input(),failure=new Error('test hash refusal');let hashes=0;
 await assert.rejects(encode(request,{guard:context.guard,async digest(file){if(++hashes===3)throw failure;return context.digest(file);}}),error=>error===failure);assert.equal(hashes,3);assert.equal(Object.isFrozen(request.root.files[0].file),false);assert.deepEqual(request.history,template.history);await exact(await encode(request,context));
});
test('a failed authority check stops before the next Native hash',async()=>{
 const failure=new Error('test authority refusal');let checks=0,hashes=0;
 await assert.rejects(encode(input(),{guard(){if(++checks===4)throw failure;context.guard();},async digest(file){hashes++;return context.digest(file);}}),error=>error===failure);assert.equal(hashes,1);
});
test('accessors and sparse/oversized descriptor arrays refuse before callbacks',async()=>{
 let callbacks=0,getters=0;const refusal={guard(){callbacks++;},async digest(){callbacks++;return 'a'.repeat(64);}};
 for(const mutate of [i=>Object.defineProperty(i,'history',{enumerable:true,get(){getters++;return template.history;}}),i=>Object.defineProperty(i.participants[0].payload,'state',{enumerable:true,get(){getters++;return {};}}),i=>{delete i.root.files[0];},i=>{i.participants.length=1025;},i=>{i.uploads[Symbol('hidden')]=true;}]){const request=input();mutate(request);await assert.rejects(encode(request,refusal));}
 assert.equal(callbacks,0);assert.equal(getters,0);
});
test('the prepared request is private and returns no mutable source/owner capability',()=>{
 for(const name of ['prepareRecordCutCapture','encodePhysicalRoomRecordCut'])assert.equal(name in api,false);
});

test('later participant records must still match the admitted entry pin', async () => {
 const row=template.participants.find(row=>row.family==='original');
 const original=row.payload.state;
 const alternate=structuredClone(original);
 alternate.parent.format='x'+original.parent.format.slice(1);
 const raw=new TextEncoder().encode(JSON.stringify(original));
 const replacement=new TextEncoder().encode(JSON.stringify(alternate));
 assert.equal(raw.byteLength,replacement.byteLength);
 assert.ok(raw.byteLength<=1024*1024);
 assert.notDeepEqual(raw,replacement);

 const header=await recordCutHeader(new Blob([bytes]),context);
 const manifest=readRecordCutManifest(header.text);
 const entry=manifest.participants.find(participant=>participant.id===row.id).records;
 const offset=manifest.entries.slice(0,entry).reduce((start,part)=>start+part.bytes,header.offset);
 const modified=Buffer.from(bytes);
 assert.deepEqual(modified.subarray(offset,offset+raw.byteLength),Buffer.from(raw));
 modified.set(replacement,offset);
 const modifiedSelection={...selection,sha256:createHash('sha256').update(modified).digest('hex')};
 await assert.rejects(Archive.read(new Blob([modified]),modifiedSelection,options),{code:'record_cut_integrity'});

 const readBuffer=Blob.prototype.arrayBuffer;
 let armed=false,injected=0,readable=true,disposeOnRead=false;
 let admitted;
 try {
  Blob.prototype.arrayBuffer=function(){
   if(disposeOnRead&&this.size===replacement.byteLength)admitted.dispose();
   if(armed&&this.size===replacement.byteLength){
    injected++;
    return Promise.resolve(replacement.buffer.slice(0));
   }
   return readBuffer.call(this);
  };
  const {PhysicalRoomRecordCutArchive:MeasuredArchive}=await import(
   '../packages/breditor-collaboration/dist/physical_room_record_cut/archive.js?record-reread'
  );
  admitted=await MeasuredArchive.read(new Blob([bytes]),selection,{
   ...options,checkAuthority(){assert.ok(readable);},
  });
  readable=false;
  assert.deepEqual(await admitted.records(row.id),original);
  armed=true;
  await assert.rejects(admitted.records(row.id),{code:'record_cut_integrity'});
  assert.equal(injected,1);
  armed=false;
  assert.deepEqual(await admitted.records(row.id),original);
  disposeOnRead=true;
  await assert.rejects(admitted.records(row.id),{code:'record_cut_closed'});
 }finally{
  Blob.prototype.arrayBuffer=readBuffer;
  admitted?.dispose();
 }
});

test('participant input routing comes from the header included in the whole-file digest', async () => {
 const file=new Blob([bytes]);
 const {text,offset}=await recordCutHeader(file,context);
 const manifest=readRecordCutManifest(text);
 const original=manifest.participants.find(row=>row.family==='original');
 const independent=manifest.participants.find(row=>row.family==='independent-local');
 const first=original.files[0],second=independent.files[0];
 assert.notEqual(manifest.entries[first.entry].sha256,manifest.entries[second.entry].sha256);
 [first.entry,second.entry]=[second.entry,first.entry];
 const replacement=new TextEncoder().encode(JSON.stringify(manifest));
 assert.equal(replacement.byteLength,new TextEncoder().encode(text).byteLength);
 const originalFile=archive.inputs(original.id)[0].file;
 const nativeRead=Blob.prototype.arrayBuffer;
 let mode='separate',separateReads=0,alteredDigestRead=false;
 let admitted;
 try{
  Blob.prototype.arrayBuffer=async function(){
   if(mode==='separate'&&this.size===replacement.byteLength){
    separateReads++;
    return replacement.buffer.slice(0);
   }
   const raw=await nativeRead.call(this);
   if(mode==='digest'&&this.size===1024*1024){
    const view=new Uint8Array(raw);
    if(Buffer.from(view.subarray(0,offset)).equals(bytes.subarray(0,offset))){
     view.set(replacement,offset-replacement.byteLength);
     alteredDigestRead=true;
    }
   }
   return raw;
  };
  admitted=await Archive.read(file,selection,options);
  assert.equal(admitted.inputs(original.id)[0].file.size,originalFile.size);
  assert.deepEqual(await admitted.inputs(original.id)[0].file.arrayBuffer(),await originalFile.arrayBuffer());
  assert.equal(separateReads,0);
  mode='digest';
  await assert.rejects(Archive.read(file,selection,options),{code:'record_cut_integrity'});
  assert.equal(alteredDigestRead,true);
 }finally{
  Blob.prototype.arrayBuffer=nativeRead;
  admitted?.dispose();
 }
});
