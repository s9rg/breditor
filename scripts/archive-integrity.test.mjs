/** Actual canonical Rust/Wasm SHA-256 and bounded opaque-transport admission. No native replay claim. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashSharedArchive,SharedServerLogGenerationRoomArchive as Reader,readSharedServerLogGenerationRoomArchive as read,MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES as CHUNK,MAX_SHARED_ARCHIVE_DIGEST_BYTES as MAX} from '../packages/breditor-collaboration/dist/index.js';
import {transportFixture,digest,magic} from './fixtures/server-generation-archive/transport.mjs';
const wasm=await import('../target/promoted-shared-web/breditor_shared.js');
const instance=await wasm.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),code=name=>error=>error?.code===name&&!String(error).includes('PRIVATE');
const options=(extra={})=>({wasm,checkAuthority(){},...extra});
function audited(onUpdate=()=>{}){const audit={created:0,released:0,active:0,maximumActive:0,maximumChunk:0,updates:0},Native=wasm.SharedArchiveDigest;return{audit,module:{SharedArchiveDigest:{version:()=>Native.version(),maximum_bytes:()=>Native.maximum_bytes(),maximum_chunk_bytes:()=>Native.maximum_chunk_bytes(),create(expected){const native=Native.create(expected);audit.created++;audit.active++;audit.maximumActive=Math.max(audit.maximumActive,audit.active);return{update(bytes){audit.maximumChunk=Math.max(audit.maximumChunk,bytes.byteLength);audit.updates++;native.update(bytes);onUpdate();},finish:()=>native.finish(),free(){audit.released++;audit.active--;native.free();}};}}}};}
test('the dedicated native owner has exact decimal limits, standard vectors and terminal state',()=>{assert.equal(wasm.SharedArchiveDigest.version(),'1');assert.equal(wasm.SharedArchiveDigest.maximum_bytes(),String(MAX));assert.equal(wasm.SharedArchiveDigest.maximum_chunk_bytes(),String(CHUNK));for(const[bytes,wanted]of [[new Uint8Array(),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],[new TextEncoder().encode('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad']]){const native=wasm.SharedArchiveDigest.create(String(bytes.length));try{for(const byte of bytes)native.update(Uint8Array.of(byte));assert.equal(native.finish(),wanted);assert.throws(()=>native.finish());assert.throws(()=>native.update(new Uint8Array()));}finally{native.free();}}});
test('native selected totals refuse noncanonical decimals rather than numeric ABI coercion',()=>{for(const value of ['', '01','-1','+1','1.0','1e3',String(MAX+1),'4294967296','18446744073709551616'])assert.throws(()=>wasm.SharedArchiveDigest.create(value));});
test('native refusals keep the exact prior hash appendable until successful completion',()=>{const native=wasm.SharedArchiveDigest.create('3');try{native.update(Uint8Array.of(97));assert.throws(()=>native.finish());assert.throws(()=>native.update(new Uint8Array(CHUNK+1)));assert.throws(()=>native.update(Uint8Array.of(1,2,3)));native.update(Uint8Array.of(98,99));assert.equal(native.finish(),sha('abc'));}finally{native.free();}});
for(const length of [0,1,55,56,63,64,65,CHUNK-1,CHUNK,CHUNK+1,5*CHUNK+19])test(`bounded whole-file digest matches independent Node crypto at ${length} bytes`,async()=>{const bytes=new Uint8Array(length);for(let i=0;i<length;i++)bytes[i]=i%251;const{audit,module}=audited(),result=await hashSharedArchive(new Blob([bytes]),options({wasm:module}));assert.deepEqual(result,{bytes:length,sha256:sha(bytes)});assert.ok(Object.isFrozen(result));assert.equal(audit.created,1);assert.equal(audit.released,1);assert.equal(audit.active,0);assert.ok(audit.maximumChunk<=CHUNK);});
test('large files never use whole-file ArrayBuffer reads and native working memory does not scale with total bytes',async()=>{const saved=Blob.prototype.arrayBuffer,base=new Blob([new Uint8Array(CHUNK).fill(29)]);let largest=0;try{Blob.prototype.arrayBuffer=function(){largest=Math.max(largest,this.size);assert.ok(this.size<=CHUNK,'Only bounded chunks may be read');return saved.call(this);};await hashSharedArchive(new Blob(Array(8).fill(base)),options());const warm=instance.memory.buffer.byteLength;await hashSharedArchive(new Blob(Array(64).fill(base)),options());const later=instance.memory.buffer.byteLength;assert.ok(later<=warm+2*CHUNK,'Native work memory must not grow with a 64MiB input');assert.equal(largest,CHUNK);}finally{Blob.prototype.arrayBuffer=saved;}});
test('abort and source-authority changes after a native update release the actual native owner',async()=>{for(const reason of ['abort','authority']){const controller=new AbortController();let live=true;const{audit,module}=audited(()=>{if(reason==='abort')controller.abort();else live=false;});await assert.rejects(hashSharedArchive(new Blob([new Uint8Array(CHUNK+1)]),options({wasm:module,signal:controller.signal,checkAuthority(){if(!live)throw Error('PRIVATE-AUTHORITY');}})),code(reason==='abort'?'archive_aborted':'archive_authority'));assert.equal(audit.created,1);assert.equal(audit.released,1);assert.equal(audit.active,0);}});
test('unavailable/old factories and asynchronous authority have no fallback to one-shot hashing',async()=>{for(const value of [{},{SharedArchiveDigest:{}},{SharedArchiveDigest:{...wasm.SharedArchiveDigest,version:()=> '0'}}])await assert.rejects(hashSharedArchive(new Blob(),options({wasm:value})),code('archive_capability'));await assert.rejects(hashSharedArchive(new Blob(),options({checkAuthority:async()=>{}})),code('archive_authority'));});
test('read failures are sanitized and free the live native owner',async()=>{const saved=Blob.prototype.arrayBuffer,{audit,module}=audited();try{Blob.prototype.arrayBuffer=async()=>{throw Error('PRIVATE-BYTES');};await assert.rejects(hashSharedArchive(new Blob(['x']),options({wasm:module})),code('archive_io'));assert.equal(audit.active,0);assert.equal(audit.released,1);}finally{Blob.prototype.arrayBuffer=saved;}});
test('complete outer transport retains all pins and supports disposal without activation',async()=>{const{file,expected}=transportFixture(),{audit,module}=audited(),reader=await read(file,expected,options({wasm:module}));assert.deepEqual(reader.identity(),expected);assert.equal(reader.metadata().bytes,file.size);assert.equal(reader.metadata().nativeBytes,3);assert.ok(Object.isFrozen(reader.identity().native.source));assert.equal(audit.active,0);assert.equal(audit.maximumActive,2);assert.equal(audit.created,4);for(const name of ['activate','verifyCredentials','router'])assert.equal(typeof reader[name],'undefined');reader.dispose();assert.deepEqual(reader.identity(),expected);assert.throws(()=>reader.file(),code('archive_closed'));assert.throws(()=>new Reader({},file,{}),code('archive_closed'));});
test('archive admission snapshots the independent complete selection before the first await',async()=>{const{file,expected}=transportFixture(),selected=structuredClone(expected),pending=read(file,expected,options());expected.native.manifest[0]^=1;expected.assets.archiveSha256[0]^=1;expected.archiveSha256[0]^=1;const reader=await pending;try{assert.deepEqual(reader.identity(),selected);}finally{reader.dispose();}});
for(const[name,change]of [['family',h=>{h.format='breditor/server-room-backup';}],['revision',h=>{h.formatVersion=2;}],['extra field',h=>{h.private='PRIVATE';}],['gap',h=>{h.rasters.offset++;}],['overlap',h=>{h.rasters.offset--;}],['zero section',h=>{h.log.bytes=0;}],['native component checksum',h=>{h.log.sha256[0]^=1;}],['raster component checksum',h=>{h.rasters.sha256[0]^=1;}],['foreign raster binding',h=>{h.assets.binding='sha256:'+'b'.repeat(64);}]] )test(`fresh outer checksums cannot admit inconsistent ${name}`,async()=>{const{file,expected}=transportFixture({change});await assert.rejects(read(file,expected,options()),error=>['archive_integrity','archive_policy'].includes(error?.code)&&!String(error).includes('PRIVATE'));});
test('independently selected wrong manifest or whole digest refuses even when document counters agree',async()=>{const{file,expected}=transportFixture();expected.native.manifest[0]^=1;await assert.rejects(read(file,expected,options()),code('archive_integrity'));const other=transportFixture();other.expected.archiveSha256[0]^=1;await assert.rejects(read(other.file,other.expected,options()),code('archive_integrity'));});
test('canonical header bytes cannot be replaced with pretty, reordered or BOM text',async()=>{for(const encode of [v=>JSON.stringify(v,null,2),v=>JSON.stringify(Object.fromEntries(Object.entries(v).reverse())),v=>'\ufeff'+JSON.stringify(v)]){const{file,expected}=transportFixture({encode});await assert.rejects(read(file,expected,options()),code('archive_integrity'));}});
test('header size is refused before any unbounded header buffer can be read',async()=>{const{bytes,expected}=transportFixture(),changed=Uint8Array.from(bytes);new DataView(changed.buffer).setUint32(magic.length,128*1024+1);const file=new Blob([changed]);await assert.rejects(read(file,expected,options()),code('archive_budget'));});
test('truncation, trailing bytes and corrupt body data produce no partial archive',async()=>{for(const mutate of [v=>v.subarray(0,v.length-1),v=>Buffer.concat([v,Uint8Array.of(0)]),v=>{const copy=Buffer.from(v);copy[copy.length-1]^=1;return copy;}]){const{bytes,expected}=transportFixture();await assert.rejects(read(new Blob([mutate(bytes)]),expected,options()),code('archive_integrity'));}});
test('independent section pins and the whole archive digest must describe the same transport bytes',async()=>{
 const {bytes,prefix,encoded,header,expected}=transportFixture();
 const body=prefix.length+encoded.length;
 const ranges=[[prefix.length,body],[body,body+header.log.bytes],[body+header.rasters.offset,bytes.length]];
 const slice=Blob.prototype.slice;
 for(const [start,end] of ranges){
  const changed=Buffer.from(bytes);
  changed[start]^=1;
  const selected={...expected,archiveSha256:digest(changed)};
  const originalRange=new Blob([bytes.subarray(start,end)]);
  Blob.prototype.slice=function(from,to){
   if(this.size===changed.length&&from===start&&(to??this.size)===end)return originalRange;
   return slice.call(this,from,to);
  };
  try{
   await assert.rejects(async()=>{
    const admitted=await read(new Blob([changed]),selected,options());
    admitted.dispose();
   },code('archive_integrity'),`section starting at ${start}`);
  }finally{Blob.prototype.slice=slice;}
 }
});
test('cancelling a transport section releases both active native digest owners',async()=>{
 const {file,expected}=transportFixture();
 const controller=new AbortController();
 const {audit,module}=audited(()=>{if(audit.active===2)controller.abort();});
 await assert.rejects(read(file,expected,options({wasm:module,signal:controller.signal})),code('archive_aborted'));
 assert.equal(audit.maximumActive,2);
 assert.equal(audit.created,3);
 assert.equal(audit.released,audit.created);
 assert.equal(audit.active,0);
});
test('a false public Blob size does not let a partial snapshot stand in for selected bytes',async()=>{class FalseSize extends Blob{get size(){return 1;}}const{bytes,expected}=transportFixture();await assert.rejects(read(new FalseSize([bytes]),expected,options()),code('archive_integrity'));});
test('large opaque transport sections use only bounded actual native hashing',async()=>{const{file,expected,prefix}=transportFixture({nativeBytes:new Uint8Array(3*CHUNK+17).fill(37),rasters:new Uint8Array(2*CHUNK+9).fill(41)}),saved=Blob.prototype.arrayBuffer,{audit,module}=audited();let maximum=0,total=0;try{Blob.prototype.arrayBuffer=function(){maximum=Math.max(maximum,this.size);total+=this.size;assert.ok(this.size<=CHUNK);return saved.call(this);};const reader=await read(file,expected,options({wasm:module}));try{assert.deepEqual(reader.identity(),expected);assert.equal(audit.active,0);assert.equal(maximum,CHUNK);assert.equal(total,file.size+prefix.length);assert.equal(audit.maximumChunk,CHUNK);}finally{reader.dispose();}}finally{Blob.prototype.arrayBuffer=saved;}});
