/** Deliberate transport faults verify diagnostics, not the historical failure. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashSharedArchive,SharedArchiveIntegrityError} from '../packages/breditor-collaboration/dist/index.js';
import {prepareArchiveIntegrity} from '../packages/breditor-collaboration/dist/archive_integrity/context.js';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
const options={wasm:native,checkAuthority(){}};
async function withRead(read,work){const original=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=read;try{return await work();}finally{Blob.prototype.arrayBuffer=original;}}
function audited(){let released=0;return {module:{SharedArchiveDigest:{version:()=>native.SharedArchiveDigest.version(),maximum_bytes:()=>native.SharedArchiveDigest.maximum_bytes(),maximum_chunk_bytes:()=>native.SharedArchiveDigest.maximum_chunk_bytes(),create(bytes){const owner=native.SharedArchiveDigest.create(bytes);return{update:value=>owner.update(value),finish:()=>owner.finish(),free(){owner.free();released++;}};}}},released:()=>released};}
function failure(expected){return error=>{assert.ok(error instanceof SharedArchiveIntegrityError);assert.equal(error.code,'archive_integrity');assert.deepEqual(error.readFailure,expected);assert.ok(Object.isFrozen(error.readFailure));assert.equal(Reflect.set(error.readFailure,'actualBytes',99),false);assert.equal(Object.getOwnPropertyDescriptor(error,'readFailure').writable,false);assert.equal(String(error).includes('PRIVATE'),false);return true;};}
test('correct bounded reads retain exact bytes and ordinary errors keep their old shape',async()=>{
 const context=prepareArchiveIntegrity(options);assert.deepEqual(await context.read(new Blob(['abc']),1,2),Uint8Array.of(98,99));
 const error=new SharedArchiveIntegrityError('archive_io','existing message');assert.equal('readFailure'in error,false);assert.equal(error.code,'archive_io');assert.equal(error.message,'existing message');
});
test('an already bounded whole Blob is read directly without slicing it again',async()=>{
 const base=new Blob([new Uint8Array(1542).fill(19)]);
 const bytes=base.slice(31,785),slice=Blob.prototype.slice;
 let extraSlices=0;
 try{
  Blob.prototype.slice=function(start,end,...args){
   if(this.size===754&&start===0&&end===754){extraSlices++;return new Blob();}
   return slice.call(this,start,end,...args);
  };
  const context=prepareArchiveIntegrity(options);
  const result=await context.readAndDigest(bytes,754);
  assert.equal(result.bytes.byteLength,754);
  assert.ok(result.bytes.every(byte=>byte===19));
  assert.equal(result.sha256,createHash('sha256').update(new Uint8Array(754).fill(19)).digest('hex'));
  assert.equal(extraSlices,0);
 }finally{Blob.prototype.slice=slice;}
});
test('short transport results report exact lengths and release the genuine Native digest owner',async()=>{
 const file=new Blob(['PRIVATE-INPUT']),audit=audited();
 await withRead(async()=>new ArrayBuffer(0),async()=>{await assert.rejects(hashSharedArchive(file,{...options,wasm:audit.module}),failure({kind:'read-length',offset:0,expectedBytes:file.size,observedBeforeAuthorityBytes:0,actualBytes:0}));});assert.equal(audit.released(),1);
});
test('oversized transport results refuse instead of clipping to the selected range',async()=>{
 await withRead(async()=>new ArrayBuffer(4),async()=>{const context=prepareArchiveIntegrity(options);await assert.rejects(context.read(new Blob(['abcdefgh']),2,3),failure({kind:'read-length',offset:2,expectedBytes:3,observedBeforeAuthorityBytes:4,actualBytes:4}));});
});
test('a transport buffer detached by authority is distinguished from an already short read',async()=>{
 const buffer=new ArrayBuffer(1);let checks=0;
 await withRead(async()=>buffer,async()=>{const context=prepareArchiveIntegrity({...options,checkAuthority(){if(++checks===3)structuredClone(buffer,{transfer:[buffer]});}});await assert.rejects(context.read(new Blob(['x']),0,1),failure({kind:'read-length',offset:0,expectedBytes:1,observedBeforeAuthorityBytes:1,actualBytes:0}));});assert.equal(checks,3);
});
test('non-numerical transport observations are sanitized rather than copied into error details',async()=>{
 await withRead(async()=>({byteLength:'PRIVATE-OBSERVATION'}),async()=>{const context=prepareArchiveIntegrity(options);await assert.rejects(context.read(new Blob(['x']),0,1),error=>{assert.equal(error.code,'archive_integrity');assert.equal('readFailure'in error,false);assert.equal(String(error).includes('PRIVATE'),false);return true;});});
});
test('read exceptions retain the original IO code and release Native ownership without fabricated lengths',async()=>{
 const audit=audited();await withRead(async()=>{throw Error('PRIVATE-IO');},async()=>{await assert.rejects(hashSharedArchive(new Blob(['x']),{...options,wasm:audit.module}),error=>{assert.equal(error.code,'archive_io');assert.equal('readFailure'in error,false);assert.equal(String(error).includes('PRIVATE'),false);return true;});});assert.equal(audit.released(),1);
});
