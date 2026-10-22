/** Actual borrowed native ownership, current read policy and cancellation.
 * Expired write scopes do not grant reads and do not prevent a separately authorized capture. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {captureLocalOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';import {prepareLocalPortableCase,portableBytes as bytes} from './fixtures/independent-local-operation/portable.mjs';import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
const runtime=process.env.BREDITOR_LOCAL_PORTABLE_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
function factory(options,run){const history=options.session.documentHistory,key=history.kind==='original'?'restoreOriginal':'restoreSegmented';return{...options.session,documentHistory:{...history,[key]:async(...args)=>run(()=>Reflect.apply(history[key],history,args))}};}
function tracked(raw){const free=raw.free;let frees=0;raw.free=function(...args){frees++;return free.apply(this,args);};return{raw,get frees(){return frees;}};}
test('nested factories and limits are snapshotted once before the first authority callback',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture),session={...value.readOptions.session,documentHistory:{...value.readOptions.session.documentHistory},review:{...value.readOptions.session.review}},limits={maxFileBytes:rich.checkRichAssetLimits().maxFileBytes};let sessions=0,budgets=0,armed=true,backup;
 try{const result=await capture({source:value.source,assets:value.parts.uploads,get session(){sessions++;return session;},get limits(){budgets++;return limits;},checkAuthority(){if(armed){armed=false;session.documentHistory.restoreSegmented=()=>{throw Error('Late factory');};session.review.actor='late-actor';limits.maxFileBytes=1;}}});assert.equal(result.kind,'ready');backup=result.backup;assert.equal(sessions,1);assert.equal(budgets,1);assert.deepEqual(backup.liveSource(),value.live);}finally{backup?.dispose();await value.close();}
});
test('ten already-aborted captures free their read scopes before any factory',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture),controller=new AbortController();controller.abort();let calls=0;
 try{const session=factory(value.readOptions,()=>{calls++;throw Error('Unexpected factory');});for(let i=0;i<10;i++)await assert.rejects(value.capture({signal:controller.signal,session}),error=>error.code==='asset_bytes_aborted');assert.equal(calls,0);assert.equal((await value.capture()).kind,'ready');}finally{await value.close();}
});
test('fresh read denial is independent of ended write authority and remains explicitly retryable',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture);try{value.setReadAllowed(false);for(let i=0;i<10;i++)await assert.rejects(value.capture(),error=>error.code==='participant_authority');assert.deepEqual(value.source.exportRecovery(),value.live);assert.deepEqual(await bytes(await value.parts.uploads.exportBackup()),value.uploads);value.setReadAllowed(true);assert.equal((await value.capture()).kind,'ready');}finally{value.setReadAllowed(true);await value.close();}
});
test('cancellation after an actual native factory result frees it exactly once',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture),controller=new AbortController();let owner;
 try{const session=factory(value.readOptions,async restore=>{owner=tracked(await restore());controller.abort();return owner.raw;});await assert.rejects(value.capture({session,signal:controller.signal}),error=>error.code==='asset_bytes_aborted');assert.equal(owner.frees,1);assert.deepEqual(value.source.exportRecovery(),value.live);assert.equal((await value.capture()).kind,'ready');}finally{await value.close();}
});
test('a reused actual Rust result stays owned by its first editor',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture),owner=tracked(host.profile.create(value.source.core.documentJson(),'999'));let spare;
 try{spare=new api.SharedRichEditor(owner.raw);const before=spare.checkpointJson(),session=factory(value.readOptions,()=>owner.raw);await assert.rejects(value.capture({session}),error=>error.code==='owner_reused');assert.equal(owner.frees,0);assert.equal(spare.checkpointJson(),before);}finally{spare?.dispose();await value.close();}assert.equal(owner.frees,1);
});
test('actual source close waits for a pending read and its fresh native-result cleanup',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture);let arrive,release,owner,capturing,closing,closed=false;const started=new Promise(resolve=>{arrive=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 try{const session=factory(value.readOptions,async restore=>{arrive();await gate;owner=tracked(await restore());return owner.raw;});capturing=value.capture({session}).then(result=>{if(result.kind==='ready')result.backup.dispose();return{ok:true};},error=>({ok:false,code:error.code}));await started;closing=value.source.discardAndClose().then(()=>{closed=true;});await Promise.resolve();assert.equal(closed,false);release();assert.equal((await capturing).ok,false);await closing;assert.equal(closed,true);assert.equal(owner.frees,1);}finally{release();await capturing;await closing;await value.close();}
});
test('a native publication in an authority callback cannot escape the capture stamp',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture);let armed=false,fired=false,owner;
 try{const session=factory(value.readOptions,async restore=>{owner=tracked(await restore());armed=true;return owner.raw;});await assert.rejects(value.capture({session,checkAuthority(){if(armed&&!fired){fired=true;insertCleanupText(value.source.core,'During actual read factory ');}}}),error=>error.code==='independent_local_operation_capture_changed');assert.equal(fired,true);assert.equal(owner.frees,1);const result=await value.capture();assert.equal(result.kind,'ready');assert.match(result.backup.liveSource().documentCheckpoint,/During actual read factory/);}finally{await value.close();}
});
test('a late original-wrapper cleanup denial refuses the unreturned result and releases the source scope',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture),dispose=rich.RichAssetArchive.prototype.dispose;let armed=false,fired=false;
 try{rich.RichAssetArchive.prototype.dispose=function(){const result=dispose.call(this);if(armed&&!fired){fired=true;value.setReadAllowed(false);}return result;};const session=factory(value.readOptions,async restore=>{const raw=await restore();armed=true;return raw;});await assert.rejects(value.capture({session}),error=>error.code==='participant_authority');assert.equal(fired,true);rich.RichAssetArchive.prototype.dispose=dispose;value.setReadAllowed(true);assert.equal((await value.capture()).kind,'ready');}finally{rich.RichAssetArchive.prototype.dispose=dispose;value.setReadAllowed(true);await value.close();}
});
