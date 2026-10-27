/** Actual source moves use SDK intrinsics, not host-replaceable constructor
 * dispatch. Injected failure cleanup retains every real scope even on old code. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {ActorLeaseEscrow} from '../packages/breditor-collaboration/dist/persistence/actor_lease_escrow.js';
import {takeNativeActorCohort} from '../packages/breditor-collaboration/dist/persistence/native_actor_cohort.js';
import {cleanupEnvironment} from './fixtures/owned-core-cleanup/environment.mjs';
import {nativeProfile,cleanupSession,cleanupNativePair,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
let profile;
before(async()=>{const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname,native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native);});
after(()=>profile?.free());
for(const family of ['paired','generation-paired','independent-both'])test('two actual '+family+' writers move without dispatching a replaced escrow constructor',async()=>{
 const host=cleanupEnvironment(),create=ActorLeaseEscrow.create,selected=[0,1].map(i=>cleanupSession(api,profile,{family,database:'transfer-intrinsic-'+family+'-'+i,writer:String(101+i),actor:'actor-'+i})),sources=[],captured=[];let calls=0,actors;
 try{
  for(const s of selected){const source=await s.open();sources.push(source);insertCleanupText(source.core,'Keep native history ');await source.flush();}
  const pairs=sources.map((source,i)=>cleanupNativePair(source.core,selected[i]));for(const source of sources)api.SharedRichEditor.prototype.retire.call(source.core);
  ActorLeaseEscrow.create=function(...args){calls++;if(calls===2)throw Error('Replaced constructor after first actual move');const value=create.apply(this,args);captured.push(value);return value;};
  actors=takeNativeActorCohort(sources.map((source,i)=>({id:'member-'+i,core:source.core})));assert.equal(calls,0);
  for(const [i,source]of sources.entries()){assert.deepEqual(cleanupNativePair(source.core,selected[i]),pairs[i]);await source.discardAndClose();}
  assert.equal(host.held.size,4);await actors.close();assert.equal(host.held.size,0);
 }finally{ActorLeaseEscrow.create=create;for(const source of sources)await source.discardAndClose();await actors?.close();for(const actual of captured)await actual.close();assert.equal(host.held.size,0);host.restore();}
});
