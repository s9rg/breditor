/** Actual native facade exclusion and original public relay lifecycle. No
 * substitute native state, packet ACK or invented storage family is used. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SharedRichEditor,SharedRelaySync,SharedReviewRelaySync} from '../packages/breditor-collaboration/dist/index.js';
import {reserveNativeRecovery} from '../packages/breditor-collaboration/dist/core.js';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
let profile,document;
before(async()=>{await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});profile=native.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/relay-quiescence',version:1},extensions:[]}));const descriptor=JSON.parse(profile.descriptor_json());document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:'element',type:'breditor/document',entityId:null,properties:{'breditor/document-id':'room'},children:[{kind:'element',type:'breditor/paragraph',entityId:null,properties:{'breditor/block-id':'p'},children:[{kind:'text',text:'seed',formats:[]}]}]}});});
after(()=>profile?.free());
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function owner(){const core=new SharedRichEditor(profile.create(document,'101'));core.enableReview({actor:'comments-alice',principal:'alice',access:'comment'});return core;}
function adapter(lane,core,input={}){
 const identity={endpoint:'ws://127.0.0.1:49999/ws',principal:'alice',room:'room',writer:'101',credential:'a'.repeat(64)},options={getToken:()=> 'b'.repeat(64),autoConnect:false,...input};
 if(lane==='document')return new SharedRelaySync(core,{...options,identity});
 const review={endpoint:identity.endpoint,principal:'alice',room:'room',documentWriter:'101',actor:'comments-alice',binding:'c'.repeat(64),credential:'d'.repeat(64)};
 const{credential,...binding}=review,storage={core,flush:async()=>{},reviewRelayIdentity:()=>binding,reviewRelayProgress:()=>({accepted:null,sequence:null,cursor:null}),persistReviewRelayProgress:async()=>{}};
 return new SharedReviewRelaySync({...options,identity:review,storage});
}
const busy=error=>error?.code==='native_recovery_busy';
for(const lane of ['document','review']){
 test(lane+': active actual transport cannot enter native recovery',async()=>{
  const core=owner(),token=deferred(),entered=deferred(),sync=adapter(lane,core,{getToken:()=>{entered.resolve();return token.promise;}});let pending,reservation;
  try{pending=sync.connect();void pending.catch(()=>{});await entered.promise;assert.equal(sync.state().status,'connecting');assert.throws(()=>{reservation=reserveNativeRecovery([core]);},busy);}
  finally{reservation?.close();sync.dispose();token.reject(Error('test provider ended'));await Promise.allSettled([pending]);await sync.waitForDisconnected?.();core.dispose();}
 });
 test(lane+': disconnected wait pins epoch and permits a later real reservation',async()=>{
  const core=owner(),sync=adapter(lane,core);
  try{sync.disconnect();await sync.waitForDisconnected();const reservation=reserveNativeRecovery([core]);try{await assert.rejects(sync.connect(),error=>error?.code?.endsWith('recovery_in_use'));assert.equal(sync.state().status,'offline');}finally{reservation.close();}await sync.waitForDisconnected();}
  finally{sync.dispose();await sync.waitForDisconnected?.();core.dispose();}
 });
 test(lane+': genuine recovery prevents adapter admission and copied methods grant nothing',async()=>{
  const core=owner(),reservation=reserveNativeRecovery([core]);let sync;
  try{assert.throws(()=>{sync=adapter(lane,core);},error=>error?.code?.endsWith('recovery_in_use'));assert.equal(sync,undefined);}
  finally{sync?.dispose();reservation.close();sync=adapter(lane,core);await assert.rejects(sync.waitForDisconnected.call({}));sync.dispose();await sync.waitForDisconnected?.();core.dispose();}
 });
}
test('all-member refusal leaves earlier genuine cores unreserved',async()=>{
 const a=owner(),b=owner(),token=deferred(),entered=deferred(),sync=adapter('document',b,{getToken:()=>{entered.resolve();return token.promise;}});let pending,reservation;
 try{pending=sync.connect();void pending.catch(()=>{});await entered.promise;assert.throws(()=>{reservation=reserveNativeRecovery([a,b]);},busy);const first=reserveNativeRecovery([a]);first.check();first.close();}
 finally{reservation?.close();sync.dispose();token.reject(undefined);await Promise.allSettled([pending]);await sync.waitForDisconnected?.();a.dispose();b.dispose();}
});
