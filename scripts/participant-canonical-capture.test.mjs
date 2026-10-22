/** Actual portable captures cannot replace private verification with mutable public facade hooks. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {deliveryParticipantSession} from './fixtures/independent-delivery-participant/session.mjs';
import {pixel} from './fixtures/review-assets/pixels.mjs';
const runtime=process.env.BREDITOR_DELIVERY_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;
let profile,root,sequence=0;
before(async()=>{const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native,3,true);root=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8'));});after(()=>profile?.free());
for(const full of [false,true])test((full?'complete delivery':'local-only')+' participant capture pins actual read and source verification',async()=>{
 const restore=environment(),selected=deliveryParticipantSession(api,profile,root,{database:'canonical-participant-'+sequence++}),Owner=full?api.SharedIndependentDeliveryParticipantBackup:api.SharedIndependentParticipantBackup,capture=full?api.captureSharedIndependentDeliveryParticipant:api.captureSharedIndependentParticipant,originalRead=Owner.read,originalVerify=Object.getOwnPropertyDescriptor(Owner.prototype,'verifySource'),fake=Object.freeze({fake:true,dispose(){}});let session,uploads,backup;
 try{session=await(full?api.SharedIndependentDeliverySession.open(selected.options):api.SharedIndependentHistoryPersistentSession.open(selected.options));uploads=await rich.RichAssetStore.open(selected.database+'-uploads');await uploads.ingest(new Blob([pixel],{type:'image/png'}));const before=session.exportRecovery();let overriddenCalls=0;Owner.read=async()=>{overriddenCalls++;return fake;};Object.defineProperty(Owner.prototype,'verifySource',{configurable:true,value:()=>{overriddenCalls++;}});const result=await capture({participant:'canonical',principal:'alice',source:{session},assets:uploads,checkAuthority(){}});assert.equal(result.kind,'ready');backup=result.backup;assert.ok(backup instanceof Owner,'A fake facade return must never become a ready participant');assert.equal(overriddenCalls,0);assert.deepEqual(backup.sourceRecovery(),before);assert.deepEqual(session.exportRecovery(),before);}
 finally{Owner.read=originalRead;Object.defineProperty(Owner.prototype,'verifySource',originalVerify);backup?.dispose();uploads?.close();await session?.discardAndClose();restore();}
});
