/** Real SDK observer/source work, held before any network connection. No token,
 * server response, accepted clock or receipt is invented by this lifetime law. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import * as api from '../packages/breditor-collaboration/dist/index.js';import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {reserveNativeRecovery} from '../packages/breditor-collaboration/dist/core.js';import {environment} from './fixtures/room-participant-inventory/environment.mjs';import {cleanupSession,nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
for(const scope of [0,1,2])for(const natural of [false,true])test('observer / scope '+scope+' / '+(natural?'typing-v1':'explicit')+': a pending original token request prevents native recovery admission',{timeout:120000},async()=>{
 const reset=environment(),profile=nativeProfile(native,3,true),selected=cleanupSession(api,profile,{family:'original',language:3,scope,mask:natural?1:0,database:'observer-work-'+scope+'-'+natural});let source,observer,unexpected,pending;const entered=deferred(),release=deferred();
 try{const seed=new api.SharedRichEditor(profile.create(selected.document,'701'));try{const frame=seed.updateFrame();selected.options.create=()=>profile.join_frame('room','101',frame);}finally{seed.dispose();}source=await selected.open();assert.equal(source.core.writerClockV2('101').through,'0');observer=new api.SharedSuggestionObserverRelay({identity:{endpoint:'ws://127.0.0.1:1/ws',principal:'alice',room:'room',documentWriter:'101',writerTransport:'atomic-v2',binding:'a'.repeat(64),effectWriter:'900',observerCredential:'b'.repeat(64)},storage:source,autoConnect:false,requestTimeoutMs:5000,async getToken(){entered.resolve();await release.promise;return 'c'.repeat(64);}});
  pending=observer.connect();void pending.catch(()=>{});await entered.promise;
  assert.throws(()=>{unexpected=reserveNativeRecovery([source.core]);},e=>e.code==='native_recovery_busy','Native recovery must see the actual pending observer connection');
 }finally{unexpected?.close();observer?.dispose();release.resolve();await pending?.catch(()=>{});await observer?.waitForDisconnected?.();await source?.discardAndClose();profile.free();reset();}
});
