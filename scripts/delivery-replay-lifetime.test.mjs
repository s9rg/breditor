/** Actual paired native delivery readers: the last policy callback cannot
 * dispose the reader and still return a successful lifetime check. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {replayPortableRecovery as replay} from '../packages/breditor-collaboration/dist/independent_operation/portable_replay.js';
import {deliveryParticipantSession} from './fixtures/independent-delivery-participant/session.mjs';
import {recoveryFactory} from './fixtures/independent-delivery-recovery/session.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
let profile;const runtime=new URL('../target/promoted-shared-web/',import.meta.url),seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8'));before(async()=>{const native=await import(new URL('breditor_shared.js',runtime).href);await native.default({module_or_path:readFileSync(new URL('breditor_shared_bg.wasm',runtime))});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
for(const[documentSegmented,reviewSegmented]of[[false,false],[false,true],[true,false],[true,true]])test('final callback disposal refuses exact delivery native reader '+documentSegmented+'/'+reviewSegmented,async()=>{
 const restore=environment(),selected=deliveryParticipantSession(api,profile,seed,{documentSegmented,reviewSegmented,retained:'none',database:'last-delivery-replay-'+documentSegmented+'-'+reviewSegmented});let source,victim,armed=false,calls=0;
 try{source=await selected.open();victim=await replay(recoveryFactory(selected.options),source.exportRecovery(),()=>{if(armed&&++calls===2)victim.dispose();});armed=true;assert.throws(()=>victim.check(),error=>error.code==='independent_operation_read_closed');assert.equal(calls,2);}finally{armed=false;victim?.dispose();await source?.discardAndClose();restore();}
});
