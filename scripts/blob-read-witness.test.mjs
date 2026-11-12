/** Injected transport faults test the observer, not the historical short read. */
import {tmpdir} from 'node:os';
import test from 'node:test';import assert from 'node:assert/strict';
import {watchBlobReadLengths} from './fixtures/blob-read-witness.mjs';
import {probeRetainedBlobRead} from './probe-retained-blob-read.mjs';
import fs from 'node:fs';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
const original=Object.getOwnPropertyDescriptor(Blob.prototype,'arrayBuffer');
async function host(read,work){Object.defineProperty(Blob.prototype,'arrayBuffer',{...original,value:read});let observer;try{observer=watchBlobReadLengths();await work(observer);}finally{observer?.uninstall();Object.defineProperty(Blob.prototype,'arrayBuffer',original);}}
test('ordinary complete reads retain exact buffers and restore the host descriptor',async()=>{
 const observer=watchBlobReadLengths();try{const bytes=await new Blob(['日本 🙂']).arrayBuffer();assert.equal(new TextDecoder().decode(bytes),'日本 🙂');assert.equal(observer.first(),undefined);assert.equal(observer.failures(),0);}finally{assert.equal(observer.uninstall(),true);}assert.deepEqual(Object.getOwnPropertyDescriptor(Blob.prototype,'arrayBuffer'),original);
});
test('a short read retains the actual physical Blob handle and identical result, with no second call',async()=>{
 const result=new ArrayBuffer(0),file=new Blob(['original']);let calls=0;
 await host(async()=>{calls++;return result;},async observer=>{
  assert.equal(await file.arrayBuffer(),result);assert.equal(calls,1);
  const witness=observer.first();assert.equal(witness.file,file);assert.equal(witness.expectedBytes,8);assert.equal(witness.actualBytes,0);assert.ok(Object.isFrozen(witness));assert.equal(observer.failures(),1);
 });assert.equal(calls,1);
});
test('oversized reads are observed without clipping; only the first Blob is retained',async()=>{
 const result=new ArrayBuffer(4),first=new Blob(['a']),second=new Blob(['bc']);
 await host(async()=>result,async observer=>{assert.equal(await first.arrayBuffer(),result);assert.equal(await second.arrayBuffer(),result);assert.equal(observer.first().file,first);assert.equal(observer.first().actualBytes,4);assert.equal(observer.failures(),2);});
});
test('the exact original rejection or synchronous throw survives observation',async()=>{
 const error=Object.freeze(Error('original read error'));
 for(const read of [async()=>{throw error;},()=>{throw error;}])await host(read,async observer=>{await assert.rejects(async()=>new Blob(['x']).arrayBuffer(),actual=>actual===error);assert.equal(observer.first(),undefined);});
});
test('uninstall does not overwrite a later host owner',async()=>{
 const observer=watchBlobReadLengths(),later=()=>Promise.resolve(new ArrayBuffer(0));try{Object.defineProperty(Blob.prototype,'arrayBuffer',{...original,value:later});assert.equal(observer.uninstall(),false);assert.equal(Blob.prototype.arrayBuffer,later);}finally{Object.defineProperty(Blob.prototype,'arrayBuffer',original);}
});
test('the explicit worker experiment is separate from the original refusal and rejects large inputs',async()=>{
 const bytes=new TextEncoder().encode('unchanged 🙂'),part=new Blob([bytes]),file=new Blob([new Blob([]),part]).slice(0,part.size);
 await host(async()=>new ArrayBuffer(0),async observer=>{assert.equal((await file.arrayBuffer()).byteLength,0);const before=observer.failures(),result=await probeRetainedBlobRead(observer.first());assert.equal(result.original.actualBytes,0);assert.equal(result.rows.length,4);assert.ok(result.rows.every(row=>row.actualBytes===bytes.length));assert.equal(new Set(result.rows.map(row=>row.sha256)).size,1);assert.equal(observer.failures(),before);assert.equal(observer.first().actualBytes,0);});
 await assert.rejects(probeRetainedBlobRead({format:'breditor/test-blob-read-witness',formatVersion:1,file:new Blob([new Uint8Array(1024*1024+1)]),expectedBytes:1024*1024+1,actualBytes:0}),/bounded/);
});
test('the explicit preload records a real child failure while preserving its exit status and one original read',()=>{
 const directory=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'breditor-blob-witness-law-'));
 try{
  const patch=join(directory,'inject.mjs');fs.writeFileSync(patch,"globalThis.calls=0;Blob.prototype.arrayBuffer=async function(){calls++;return new ArrayBuffer(0);};");
  const child=spawnSync(process.execPath,['--import',pathToFileURL(patch).href,'--import',new URL('./fixtures/preload-blob-read-witness.mjs',import.meta.url).href,'--input-type=module','--eval',"const b=await new Blob(['x']).arrayBuffer();console.log(JSON.stringify({calls,actual:b.byteLength}));process.exitCode=23;"],{cwd:directory,encoding:'utf8',timeout:15000});
  assert.equal(child.error,undefined);assert.equal(child.status,23);assert.equal(child.signal,null);assert.deepEqual(JSON.parse(child.stdout),{calls:1,actual:0});
  const files=fs.readdirSync(join(directory,'target'));assert.equal(files.length,1);const report=JSON.parse(fs.readFileSync(join(directory,'target',files[0]),'utf8'));
  assert.equal(report.qualification,false);assert.equal(report.expectedBytes,1);assert.equal(report.actualBytes,0);assert.equal(report.failures,1);assert.equal(report.probe.original.actualBytes,0);assert.ok(report.probe.rows.every(row=>row.actualBytes===1));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('the actual Node test runner preserves its failing assertion and writes the separate witness',()=>{
 const directory=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'breditor-blob-witness-runner-law-'));
 try{
  const patch=join(directory,'inject.mjs'),fixture=join(directory,'failing.test.mjs');fs.writeFileSync(patch,"Blob.prototype.arrayBuffer=async function(){return new ArrayBuffer(0);};");
  fs.writeFileSync(fixture,"import test from 'node:test';import assert from 'node:assert/strict';test('original fault',async()=>assert.equal((await new Blob(['x']).arrayBuffer()).byteLength,1));");
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const child=spawnSync(process.execPath,['--import',pathToFileURL(patch).href,'--import',new URL('./fixtures/preload-blob-read-witness.mjs',import.meta.url).href,'--test',fixture],{cwd:directory,env,encoding:'utf8',timeout:15000});
  assert.equal(child.error,undefined);assert.equal(child.status,1);assert.equal(child.signal,null);assert.match(child.stdout,/not ok 1 - original fault/);assert.match(child.stdout,/# fail 1/);
  const files=fs.readdirSync(join(directory,'target'));assert.equal(files.length,1);const report=JSON.parse(fs.readFileSync(join(directory,'target',files[0]),'utf8'));assert.equal(report.actualBytes,0);assert.equal(report.qualification,false);assert.ok(report.probe.rows.every(row=>row.actualBytes===1));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
