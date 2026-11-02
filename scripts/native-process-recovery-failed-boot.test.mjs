/** A failed fresh owner must preserve the original refusal and complete cleanup. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {nativeProcessHost} from './fixtures/native-process/host.mjs';
import {nativeProcessRoot} from './fixtures/native-process/native-root.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function authoritySnapshot(directory){const files=new Map();function walk(relative=''){for(const item of readdirSync(join(directory,relative),{withFileTypes:true})){assert.equal(item.isSymbolicLink(),false);const name=join(relative,item.name);if(item.isDirectory())walk(name);else if(item.name!=='.owner'){assert.ok(files.size<64);const bytes=readFileSync(join(directory,name));assert.ok(bytes.length<1024*1024);files.set(name,bytes);}}}walk();assert.ok(files.size>0);return files;}

test('corrupt checkpoint refuses fresh process boot without masking its error or advancing authority',{timeout:180000},async()=>{
 const root=nativeProcessRoot(resolve(new URL('../',import.meta.url).pathname)),fetch=globalThis.fetch;let host;
 globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return fetch(url,{...options,headers});};
 try{
  host=await nativeProcessHost(root,{suggestionGrants:true});
  const first=host.initial,client=host.fixture(first).clients[0],offer=await host.prepareActivation(first.selection.source),capsule=await host.prepareProcessRecovery(offer);
  const nativeRoot=join(host.directory,'language-3-standard-true-atomic-true'),authorityRoot=join(nativeRoot,'authority'),authority=authoritySnapshot(authorityRoot);
  const file=join(nativeRoot,'native-checkpoint-restart-'+offer.case.sequence,'target.backup'),bytes=readFileSync(file),originalSha256=sha(bytes);bytes[bytes.length-1]^=1;writeFileSync(file,bytes);const corruptSha256=sha(bytes);assert.notEqual(corruptSha256,originalSha256);
  let cause;await assert.rejects(host.crashAndReopen(capsule),error=>{cause=error;return true;});assert.ok(cause instanceof Error);assert.doesNotMatch(cause.message,/Native selected-delivery shutdown/);
  const crash=host.processRecoveryObservation();assert.equal(crash.actualOldProcessExited,true);assert.equal(crash.signal,'SIGKILL');
  await assert.rejects(host.authentication(client));await host.stop();await host.stop();
  assert.deepEqual(authoritySnapshot(authorityRoot),authority);assert.equal(sha(readFileSync(file)),corruptSha256,'Refusal must not silently overwrite evidence with an old backup');
  console.log('NATIVE_PROCESS_FAILED_BOOT '+JSON.stringify({format:'breditor/native-process-failed-boot-observation',formatVersion:1,actualOldProcessExited:true,corruptCheckpointRefused:true,originalErrorPreserved:true,cleanupCompleted:true,repeatedCleanupCompleted:true,oldOwnerRemainsClosed:true,authorityUnchanged:true,corruptDataPreserved:true,artifact:{file,bytes:bytes.length,sha256:corruptSha256},originalSha256,wholeRoomActivated:false}));
 }finally{if(host)await host.stop();globalThis.fetch=fetch;}
});
