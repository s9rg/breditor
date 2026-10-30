/** Real filesystem allocation and deletion races; no compiler or Native proof is fabricated. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,linkSync,symlinkSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {buildArtifactBytes} from './candidate-release/build-artifact-bytes.mjs';
test('build allocation counts hardlinked outputs once and never follows outside symlinks',()=>{
 const root=mkdtempSync(join(tmpdir(),'breditor-build-allocation-'));
 try{mkdirSync(join(root,'target'));writeFileSync(join(root,'target','one'),Buffer.alloc(128*1024));linkSync(join(root,'target','one'),join(root,'target','two'));writeFileSync(join(root,'outside'),Buffer.alloc(1024*1024));symlinkSync(join(root,'outside'),join(root,'target','linked'));
  const amount=buildArtifactBytes(join(root,'target'),16*1024*1024),file=statSync(join(root,'target','one'));assert.ok(amount>=file.blocks*512);assert.ok(amount<256*1024);assert.ok(buildArtifactBytes(join(root,'target'),1)>1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('active temporary-file deletion never crashes the build allocation observer',{timeout:30000},async()=>{
 const root=mkdtempSync(join(tmpdir(),'breditor-build-allocation-race-')),shared=new SharedArrayBuffer(8),state=new Int32Array(shared);let worker;
 for(let index=0;index<256;index++)writeFileSync(join(root,String(index)),Buffer.alloc(4096));
 try{
  worker=new Worker(`const {workerData,parentPort}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path'),state=new Int32Array(workerData.shared);parentPort.postMessage('ready');let index=0;while(!Atomics.load(state,0)){const file=path.join(workerData.root,String(index++%256));try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}fs.writeFileSync(file,Buffer.alloc(4096));Atomics.add(state,1,1);}`,{eval:true,workerData:{root,shared}});
  await once(worker,'message');
  for(let index=0;index<100;index++){const size=buildArtifactBytes(root,16*1024*1024);assert.ok(Number.isSafeInteger(size)&&size>=0&&size<16*1024*1024);}
  assert.ok(Atomics.load(state,1)>0,'The directory must actually change during observation');
 }finally{Atomics.store(state,0,1);if(worker)await once(worker,'exit');rmSync(root,{recursive:true,force:true});}
});
