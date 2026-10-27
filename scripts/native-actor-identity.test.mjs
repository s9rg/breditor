/** A genuine factory callback can retain its actual normalized `this` options.
 * Actor handoff must not read those host-reachable objects at the native cut. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {NativeActorRetirement} from '../packages/breditor-collaboration/dist/persistence/native_actor_cohort.js';
import {cleanupEnvironment} from './fixtures/owned-core-cleanup/environment.mjs';
import {nativeProfile,cleanupSession} from './fixtures/owned-core-cleanup/session.mjs';
const runtime=new URL('../target/promoted-shared-web',import.meta.url).pathname;let profile,sequence=0;
before(async()=>{const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native);});after(()=>profile?.free());
for(const family of ['original','paired','generation-paired'])test('actor readiness and stopped transfer never reread factory-reachable identity options: '+family,async()=>{
 const host=cleanupEnvironment(),selected=cleanupSession(api,profile,{family,database:'actor-factory-identity-'+sequence++}),create=selected.options.create,changed=[];let source,cohort,escaped,calls=0;
 selected.options.create=function(...args){escaped=this;return create.apply(this,args);};
 const restore=()=>{for(const [object,name,descriptor]of changed)Object.defineProperty(object,name,descriptor);changed.length=0;};
 try{source=await selected.open();assert.ok(escaped);assert.equal(escaped.room,'room');
  for(const [object,name]of [[escaped,'room'],[escaped,'writer'],...(family==='original'?[]:[[escaped.review,'actor']])]){const descriptor=Object.getOwnPropertyDescriptor(object,name);assert.ok(descriptor&&'value'in descriptor);changed.push([object,name,descriptor]);Object.defineProperty(object,name,{configurable:true,enumerable:true,get(){calls++;return descriptor.value;}});}
  const ready=NativeActorRetirement.prepare([{id:'member',core:source.core}]);ready.checkBeforeRetirement();assert.equal(calls,0,'Pre-retirement readiness must use captured immutable identity, not invoke retained host options');
  api.SharedRichEditor.prototype.retire.call(source.core);cohort=ready.takeAfterRetirement();assert.equal(calls,0,'No host identity getter may run after irreversible native retirement');
  restore();await source.discardAndClose();source=undefined;assert.equal(host.held.size,selected.paired?2:1);await cohort.close();assert.equal(host.held.size,0);
 }finally{restore();await source?.discardAndClose();await cohort?.close();assert.equal(host.held.size,0);host.restore();}
});
