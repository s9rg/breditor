/** A real process reopen refuses damaged selected data without changing the
 * deployment ledger or rolling the current owner back to an older backup. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {selectedDeliveryNativeHost,reopenSelectedDeliveryJointNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativeJointProcessRoot} from './fixtures/native-publication/process-root.mjs';
import {SharedDurableNativeActivationHost as Activation} from '../packages/breditor-collaboration/dist/index.js';
function ledger(root){
 const result=[];function visit(relative=''){for(const entry of readdirSync(join(root,relative),{withFileTypes:true})){assert.equal(entry.isSymbolicLink(),false);const name=join(relative,entry.name);if(entry.isDirectory())visit(name);else if(entry.name!=='.owner'){assert.ok(result.length<64);const bytes=readFileSync(join(root,name));assert.ok(bytes.length<1024*1024);result.push([name,bytes]);}}}visit();assert.ok(result.length);return result.sort(([a],[b])=>a.localeCompare(b));
}
for(const committed of [false,true])test('joint process refuses a damaged '+(committed?'committed':'prepared')+' checkpoint and preserves authority',{timeout:180000},async()=>{
 const root=nativeJointProcessRoot(resolve(new URL('../',import.meta.url).pathname)),originalFetch=globalThis.fetch;let host,dead=false,control;
 globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return originalFetch(url,{...options,headers});};
 try{
  host=await selectedDeliveryNativeHost(root,{nativeActivation:true,nativePublication:true,jointProcessRecovery:true});const first=host.initial,offer=await host.prepareJointActivation(first.selection.source);
  control=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=>host.activationToken(offer),checkAuthority(){}});if(committed)await control.commit();
  const nativeRoot=join(host.directory,'language-3-standard-true-atomic-true'),referenceFile=join(nativeRoot,'native-joint-selected-checkpoint-'+offer.case.sequence+'.json'),referenceBytes=readFileSync(referenceFile),reference=JSON.parse(referenceBytes);
  // The separately named bootstrap still rejects a path escape before a kill.
  writeFileSync(referenceFile,JSON.stringify({...reference,checkpointName:'../target'}));await assert.rejects(host.prepareProcessRecovery(offer));writeFileSync(referenceFile,referenceBytes);
  const capsule=await host.prepareProcessRecovery(offer),authority=ledger(join(nativeRoot,'authority')),file=join(nativeRoot,reference.checkpointName,'target.backup'),bytes=readFileSync(file);bytes[bytes.length-1]^=1;writeFileSync(file,bytes);const digest=createHash('sha256').update(bytes).digest('hex');
  const crash=await host.crashForRecovery(capsule);dead=true;assert.equal(crash.signal,'SIGKILL');
  await assert.rejects(reopenSelectedDeliveryJointNativeHost(root,capsule),error=>{assert.ok(error instanceof Error);assert.doesNotMatch(error.message,/shutdown still pending|Native selected-delivery shutdown/);return true;});
  assert.deepEqual(ledger(join(nativeRoot,'authority')),authority);assert.deepEqual(readFileSync(file),bytes);assert.deepEqual(readFileSync(referenceFile),referenceBytes);await assert.rejects(host.authentication(host.fixture(first).clients[0]));
  console.log('NATIVE_JOINT_REFUSAL '+JSON.stringify({committed,actualExitSignal:crash.signal,corruptCheckpointRefused:true,authorityUnchanged:true,corruptBytesPreserved:true,corruptSha256:digest,pathEscapeRefused:true,wholeRoomActivated:false}));
 }finally{control?.close();if(host&&!dead)await host.stop();globalThis.fetch=originalFetch;}
});
