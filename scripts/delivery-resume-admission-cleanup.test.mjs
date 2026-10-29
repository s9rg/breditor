import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {WebSocket as Socket} from 'undici';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {generationSelectedSession} from './fixtures/selected-generation-reconciliation/session.mjs';
import {controls} from './fixtures/selected-delivery/cold-continuation.mjs';
import {withSelectedNativeDeliverySources} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {previewSelectedNativeDeliveryPreparation,prepareSelectedNativeDelivery,resumePreparedSelectedNativeDelivery} from '../packages/breditor-collaboration/dist/selected_delivery_preparation/coordinator.js';
import {SelectedNativeDeliveryJournal as Journal} from '../packages/breditor-collaboration/dist/selected_delivery_journal/coordinator.js';
import {previewSelectedNativeDeliveryJournalResume as previewResume} from '../packages/breditor-collaboration/dist/selected_delivery_journal/resume_preview.js';
import {deliveryResumeInputs,authorizeDeliveryResume} from '../packages/breditor-collaboration/dist/selected_delivery_journal/resume_admission.js';
import {DeliveryJournalResources} from '../packages/breditor-collaboration/dist/selected_delivery_journal/resources.js';
import {DeliveryPreparationResources} from '../packages/breditor-collaboration/dist/selected_delivery_preparation/resources.js';
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
test('real consumed resume admission closes preparation namespace after fresh policy refusal before gate construction',{timeout:2400000},async()=>{
 const root=resolve(new URL('../',import.meta.url).pathname),host=await selectedDeliveryNativeHost(root),first=host.initial,fetchBefore=globalThis.fetch,socketBefore=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');let session;
 globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return fetchBefore(url,{...options,headers});};Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:class extends Socket{constructor(url){super(url,{headers:{Origin:'http://127.0.0.1:4187'}});}}});
 const fixtures={native,manifest:{cases:[first]},controls:{token:path=>host.operatorToken({path})},fixture(item){const value=host.fixture(item),source=value.generationRecoveryState;return {...value,selected:source.participants,afterSelected:source.participants,afterRecoveryState:source};},profile:value=>native.SharedRichProfile.from_standard_configuration_json_v3(value.configuration)};
 try{session=await generationSelectedSession(fixtures,'actual-admission-close',{clientEndpoint:first.clientEndpoint});
  await withSelectedNativeDeliverySources(session.owner,session.input(),async scope=>{
   const before=await previewSelectedNativeDeliveryPreparation(scope,session.host,'actual-admission-close-before'),gate=await prepareSelectedNativeDelivery(scope,session.host,before.choice,()=>true),server=await api.SharedServerLogGenerationRoomArchive.read(new Blob([readFileSync(join(dirname(first.path),'server-after.backup'))]),first.selection.source.server,{wasm:native,checkAuthority:()=>scope.check()}),inventory=await api.SharedServerLogGenerationParticipantInventory.read(new Blob([readFileSync(join(dirname(first.path),'inventory.json'))]),first.selection.source.participants);let identity;
   try{const owner=await Journal.open(scope,gate,{database:'actual-admission-close-journal',host:session.host,server,inventory,checkAuthority:()=>scope.check()});identity=owner.identity();await owner.close();}finally{inventory.dispose();server.dispose();await gate.close();}
   const current=await controls(host,first,scope),journal=new DeliveryJournalResources(),reopened=new DeliveryPreparationResources();let allowed=true;
   const guard=()=>{scope.check();if(!allowed)throw Error('Fresh current permission revoked');},input={identity,baseline:current.baseline,previous:current.previous,path:current.path,server:current.server,inventory:current.inventory,checkAuthority:guard};
   try{const expected=await previewResume(scope,input),actual=await scope.retainCurrent();await journal.open(identity,{wasm:native,checkAuthority:guard,signal:scope.signal});
    const authorized=await authorizeDeliveryResume(scope,journal,deliveryResumeInputs({...input,expected,approve:()=>true},true),guard);console.log('BEFORE_STAGE genuine full-history fresh-approved admission');
    allowed=false;await assert.rejects(resumePreparedSelectedNativeDelivery(scope,authorized.admission));allowed=true;
    try{const recovered=await reopened.open(identity.prepared,{wasm:actual.integrity.wasm,checkAuthority:guard,signal:scope.signal});assert.deepEqual(recovered.choice,identity.prepared);await assert.rejects(resumePreparedSelectedNativeDelivery(scope,authorized.admission),e=>e.code==='delivery_journal_policy');assert.throws(()=>scope.clients[0].core.select(null),e=>e.code==='native_recovery_busy');assert.deepEqual((await scope.retainCurrent()).current.selection,before.current.selection);}catch(error){console.log('BEFORE_STAGE preparation namespace still held: '+error.code);throw error;}
   }finally{allowed=true;await reopened.close();await journal.close();current.close();}
  });
  for(const {core}of session.owner.clients){const document=core.documentJson();assert.equal(core.undo(),true);assert.equal(core.redo(),true);assert.equal(core.documentJson(),document);assert.equal(core.undoReview().kind,'committed');assert.equal(core.redoReview().kind,'committed');}
 }finally{await session?.close();globalThis.fetch=fetchBefore;if(socketBefore)Object.defineProperty(globalThis,'WebSocket',socketBefore);else delete globalThis.WebSocket;await host.stop();}
});
