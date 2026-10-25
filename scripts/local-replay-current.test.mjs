/** Actual readonly Rust replicas: currentness is not byte admission. Routine
 * held-replica checks avoid checkpoint exports; full checks still reject raw
 * native edits, disposal and access-policy changes. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {replayLocalOperationRecovery as replay} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_replay.js';
import {completeImageNativeFixtures} from './fixtures/physical-operation-v3/image-seven-native.mjs';
import {localRecoveryFixture,localRecoveryOptions} from './fixtures/independent-recovery/session.mjs';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
let fixtures;before(async()=>{fixtures=await completeImageNativeFixtures(new URL('../',import.meta.url).pathname);});after(async()=>{await fixtures?.close();});
const root=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8'));
function trackedFactory(session,counters,raws){const history=session.documentHistory,key=history.kind==='original'?'restoreOriginal':'restoreSegmented';return{...session,documentHistory:{...history,[key]:async(...args)=>{const raw=await Reflect.apply(history[key],history,args);raws.push(raw);for(const name of['checkpoint','segmented_checkpoint','review_checkpoint','review_segmented_checkpoint'])if(typeof raw[name]==='function'){const method=raw[name];Object.defineProperty(raw,name,{configurable:true,value:function(...args){counters.calls++;return method.apply(this,args);}});}return raw;}}};}
for(const[documentSegmented,reviewSegmented]of[[false,false],[false,true],[true,false],[true,true]])test('held readonly currentness avoids checkpoint encoding while full admission stays exact '+documentSegmented+'/'+reviewSegmented,async()=>{
 const restore=environment(),profile=nativeProfile(fixtures.native,3,true),counters={calls:0},raws=[];let f,victim,checks=0;
 try{f=await localRecoveryFixture({api,rich,profile,root,tag:'local-replay-current-'+documentSegmented+'-'+reviewSegmented,documentSegmented,reviewSegmented});const session=trackedFactory(localRecoveryOptions(f.options,f.backup,f.tag).session,counters,raws),open=()=>replay(f.selection,session,f.recovery,()=>{checks++;});victim=await open();counters.calls=0;const grants=checks;for(let i=0;i<1000;i++)victim.checkCurrent();assert.equal(counters.calls,0);assert.equal(checks,grants,'current epoch checks do not invoke a host grant');victim.check();assert.ok(counters.calls>0,'full checks still encode and compare actual native checkpoints');assert.ok(checks>grants);
  assert.equal(victim.core.setReadOnly(false),true);assert.throws(()=>victim.checkCurrent(),error=>error.code==='independent_local_operation_read_changed');assert.throws(()=>victim.check(),error=>error.code==='independent_local_operation_read_changed');victim.dispose();victim=await open();assert.equal(victim.core.setReviewAccess('comment'),true);assert.throws(()=>victim.checkCurrent(),error=>error.code==='independent_local_operation_read_changed');victim.dispose();assert.throws(()=>victim.checkCurrent(),error=>error.code==='independent_local_operation_read_closed');victim=await open();victim.core.dispose();assert.throws(()=>victim.checkCurrent());
 }finally{victim?.dispose();await f?.close();restore();profile.free();}
});
test('an out-of-band raw native edit still fails the unchanged full byte check',async()=>{
 const restore=environment(),profile=nativeProfile(fixtures.native,3,true),counters={calls:0},raws=[];let f,victim,peer;
 try{f=await localRecoveryFixture({api,rich,profile,root,tag:'local-replay-raw-edit'});const session=trackedFactory(localRecoveryOptions(f.options,f.backup,f.tag).session,counters,raws);victim=await replay(f.selection,session,f.recovery,()=>{});peer=new api.SharedRichEditor(profile.join_frame('room','222',victim.core.updateFrame()));insertCleanupText(peer,'raw edit outside the facade ');raws.at(-1).receive_frame(peer.updateFrame());counters.calls=0;assert.throws(()=>victim.check(),error=>error.code==='independent_local_operation_read_changed');assert.ok(counters.calls>0,'full boundary reads actual Rust bytes rather than trusting facade epochs');
 }finally{peer?.dispose();victim?.dispose();await f?.close();restore();profile.free();}
});
