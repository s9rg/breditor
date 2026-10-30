/** Run with a genuine held metadata owner and an older, fully materialized
 * Native capture. Mutations are rehashed so transport digests alone cannot
 * satisfy these checks. Recorded provider data remains historical only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IDBObjectStore} from 'fake-indexeddb';
import {localReviewRaw} from '../selected-delivery/local-review-evidence.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function rewrite(bundle,edit){
 const bytes=Buffer.from(await bundle.rasters.file.arrayBuffer()),magic=Buffer.from('BREDITOR_METADATA_RASTERS_V1\n'),length=bytes.readUInt32LE(magic.length),start=magic.length+4+length;
 const header=JSON.parse(bytes.subarray(magic.length+4,start).toString('utf8')),body=Buffer.from(bytes.subarray(start));
 const replacement=edit(header,body)??body,encoded=Buffer.from(JSON.stringify(header)),prefix=Buffer.alloc(magic.length+4);prefix.set(magic);prefix.writeUInt32LE(encoded.length,magic.length);
 const file=new Blob([prefix,encoded,replacement]);return{...bundle,rasters:{file,bytes:file.size,sha256:sha(Buffer.from(await file.arrayBuffer()))}};
}
export async function testMaterializedInspection({metadata,bundle,check,fetchOriginal}){
 const before=metadata.recovery(),journalBefore=await localReviewRaw(before.current.choice.database),savedFetch=globalThis.fetch,savedPut=IDBObjectStore.prototype.put;
 let writes=0,network=0,cases=0;
 IDBObjectStore.prototype.put=function(...args){writes++;return savedPut.apply(this,args);};
 globalThis.fetch=(url,options)=>{if(String(url).startsWith('blob:'))return fetchOriginal(url,options);network++;throw Error('Native materialized inspection is offline');};
 try{
  let entered=false,nested;class ReentrantRasterBlob extends Blob{get type(){if(!entered){entered=true;nested=metadata.captureReferences();void nested.catch(()=>{});}return super.type;}}
  const mutable={...bundle,rasters:{...bundle.rasters,file:new ReentrantRasterBlob([bundle.rasters.file],{type:bundle.rasters.file.type})}},reading=metadata.inspectMaterializedAssets(mutable);
  // Changes after the method returns cannot rewrite its already detached cut.
  mutable.rasters.sha256='0'.repeat(64);const actual=await reading;cases++;
  await assert.rejects(nested,error=>error.code==='local_metadata_delivery_busy');assert.equal(entered,true);
  assert.equal(actual.scope,'native-client-cut-and-recorded-raster-payloads');assert.equal(actual.references.outcome.kind,'ready');assert.equal(actual.rasters.payloads.length,2);assert.equal(actual.recordedAvailability.uploads.length,14);assert.equal(Object.isFrozen(actual.recordedAvailability.provider.resolutions),true);assert.equal('activate'in actual,false);assert.equal('checkAssets'in actual,false);
  const reject=async(value,name)=>{await assert.rejects(metadata.inspectMaterializedAssets(value));cases++;assert.deepEqual(metadata.recovery(),before,name);check();console.log('MATERIALIZED_INSPECTION_REFUSED '+name);};
  await reject({...bundle,rasters:{...bundle.rasters,sha256:'0'.repeat(64)}},'raw-file-identity');
  await reject(await rewrite(bundle,header=>{header.availability.uploads.pop();}),'rehashed-missing-whole-upload-role');
  await reject(await rewrite(bundle,header=>{header.availability.provider.resolutions=header.availability.provider.resolutions.filter(row=>!row.reference.generation.startsWith('mref-'));}),'rehashed-missing-hidden-metadata-mappings');
  await reject(await rewrite(bundle,header=>{header.availability.control.selection.instance='f'.repeat(64);}),'rehashed-foreign-provider-selection');
  await reject(await rewrite(bundle,(header,body)=>{const removed=header.payloads.pop();return body.subarray(0,removed.offset);}),'rehashed-missing-payload-with-valid-prefix');
  const claims=JSON.parse(await bundle.references.references.file.text());claims.outcome.references=claims.outcome.references.filter(row=>!row.generation.startsWith('mref-'));
  const file=new Blob([JSON.stringify(claims)]),selection={file,bytes:file.size,sha256:sha(Buffer.from(await file.arrayBuffer()))};
  const forged=await rewrite({...bundle,references:{...bundle.references,references:selection}},header=>{header.references={bytes:selection.bytes,sha256:selection.sha256};header.availability.references={...header.references};});
  await reject(forged,'rehashed-incomplete-native-reference-union');
  await assert.rejects(metadata.inspectMaterializedAssets(bundle,{limits:{maxStoredBytes:1}}));cases++;
  // An invalid import must not retire the real current owner or write either
  // journal. Read the same old cut again after all refusals.
  const again=await metadata.inspectMaterializedAssets(bundle);cases++;assert.deepEqual(again,actual);
  assert.equal(writes,0);assert.equal(network,0);assert.deepEqual(metadata.recovery(),before);assert.deepEqual(await localReviewRaw(before.current.choice.database),journalBefore);
  console.log('MATERIALIZED_INSPECTION_NATIVE '+JSON.stringify({cases,metadataSources:3,nativeParticipants:7,payloads:2,uploads:14,networkRequests:network,journalWrites:writes,olderPortableCut:true,invalidImportLeavesOwnerUsable:true}));
  return actual;
 }finally{globalThis.fetch=savedFetch;IDBObjectStore.prototype.put=savedPut;}
}
/** Delay the actual raster hash IO, then close the genuine parent. Abort must
 * be immediate, but close must still drain that same outstanding byte read. */
export async function testMaterializedInspectionClose({metadata,parent,bundle}){
 const before=metadata.recovery(),savedRead=Blob.prototype.arrayBuffer;let release,reached,armed=true,entered=false,ended=false;
 const blocked=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{reached=resolve;}),magic=Buffer.from('BREDITOR_METADATA_RASTERS_V1\n');
 Blob.prototype.arrayBuffer=async function(){const bytes=await savedRead.call(this);if(armed&&bytes.byteLength===bundle.rasters.bytes&&Buffer.from(bytes).subarray(0,magic.length).equals(magic)){armed=false;entered=true;reached();await blocked;}return bytes;};
 try{
  const reading=metadata.inspectMaterializedAssets(bundle),observed=reading.then(value=>({value}),error=>({error}));await Promise.race([started,observed.then(()=>{throw Error('Inspection ended before reaching the actual raster hash');})]);
  const closing=parent.close().then(()=>{ended=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(ended,false,'Parent close must drain the actual outstanding hash IO');
  await assert.rejects(metadata.captureReferences());release();release=undefined;const outcome=await observed;assert.ok(outcome.error);await closing;assert.equal(entered,true);assert.equal(ended,true);
  const durable=await localReviewRaw(before.current.choice.database);assert.deepEqual(JSON.parse(durable.before),before.before);assert.deepEqual(JSON.parse(durable.current),before.current);
  console.log('MATERIALIZED_INSPECTION_CLOSE_NATIVE '+JSON.stringify({actualRasterHashHeld:true,parentCloseDrained:true,committedMetadataRetained:true,lateReadyResults:0}));
 }finally{release?.();Blob.prototype.arrayBuffer=savedRead;}
}
