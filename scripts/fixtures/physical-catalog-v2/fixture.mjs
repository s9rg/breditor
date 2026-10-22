/** Real current and historical owners. No file is converted to a different family;
 * native graph source borrows always target the actually reopened archive. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {dirname,resolve} from 'node:path';
import {environment} from '../room-participant-inventory/environment.mjs';
import {recoverParticipant} from '../room-participant-inventory/participant.mjs';
import {generationParticipant} from '../room-participant-inventory/generation-participant.mjs';
import {independentParticipant} from '../independent-inventory/independent-participant.mjs';
import {localParticipant} from '../independent-inventory/local-participant.mjs';
import {restoredParticipant} from '../independent-inventory/restored-participant.mjs';
export async function makePhysicalCatalogV2Participant(family,input,counts){
 if(family==='original')return recoverParticipant({...input,counts});
 if(family.startsWith('generation-'))return generationParticipant({...input,kind:family.slice(11),counts});
 if(family==='independent-local')return localParticipant(input);
 if(family==='independent-delivery')return independentParticipant(input);
 if(family==='restored-graph')return restoredParticipant(input);
 throw Error('Unknown native participant fixture family');
}
export const physicalCatalogV2FileRow=(id,family,owner)=>({id,family:family.startsWith('generation-')?'generation':family,file:owner.backup.file(),expected:owner.backup.selection()});
export const physicalCatalogV2GraphPolicy=(id,owner)=>({id,original:owner.backup.selection().original,options:owner.readOptions});
export async function physicalCatalogV2Fixture({api,rich,internals,fixtures,item=fixtures.manifest.cases[1],family='independent-delivery',documentSegmented=true,reviewSegmented=true,historic=true,olderIndex=0,tag}){
 const reset=environment(),fixture=fixtures.fixture(item),profile=fixtures.profile(fixture),inventory=await api.readSharedServerLogGenerationParticipantInventory(fixtures.inventory(item),fixture.selected),metadata=inventory.metadata().native,folder=dirname(item.path),counts={networkCalls:0,restoredParticipants:0,restoredComponents:0};let older,current,archive,store;
 const historical=[],historicalPolicies=[],captures=[],{PhysicalRoomCatalogV2Archive:Archive,PhysicalRoomCatalogV2:Store,archiveState,storeState,restoredGraphNativeSource:nativeSource}=internals;
 const archiveClient=(owner,id)=>(owner instanceof Archive?archiveState(owner):storeState(owner)).clients.get(id);
 try{
  if(historic)for(const kind of['original','generation-retained','independent-local','independent-delivery','restored-graph']){const owner=await makePhysicalCatalogV2Participant(kind,{api,rich,profile,fixture,metadata,client:fixture.clients[0],documentSegmented,reviewSegmented,tag:tag+'-historic-'+kind},counts);try{const id='historic-'+kind;historical.push(physicalCatalogV2FileRow(id,kind,owner));if(kind==='restored-graph')historicalPolicies.push(physicalCatalogV2GraphPolicy(id,owner));}finally{await owner.close();}}
  older=await makePhysicalCatalogV2Participant(family,{api,rich,profile,fixture,metadata,client:fixture.clients[olderIndex],documentSegmented,reviewSegmented,tag:tag+'-older'},counts);
  current=await makePhysicalCatalogV2Participant('restored-graph',{api,rich,profile,fixture,metadata,client:fixture.clients[1-olderIndex],documentSegmented,reviewSegmented,tag:tag+'-current'},counts);
  const options={wasm:fixtures.native,checkAuthority(){},graphPolicies:[physicalCatalogV2GraphPolicy('b-current',current),...historicalPolicies]},participants=[physicalCatalogV2FileRow('a-older',family,older),physicalCatalogV2FileRow('b-current','restored-graph',current),...historical],capture={catalog:tag,origin:{file:new Blob([readFileSync(resolve(folder,'server.backup'))]),expected:fixture.afterRecoveryState.origin},current:{server:{file:new Blob([readFileSync(resolve(folder,'server-after.backup'))]),expected:fixture.afterRecoveryState.server},participants:{file:new Blob([readFileSync(resolve(folder,'inventory-after.json'))]),expected:fixture.afterRecoveryState.participants}},participants,...options};
  archive=await Archive.capture(capture);const expected=archive.selection(),originalFiles=archive.files(),manifest=archive.manifestJson();
  const h={Archive,Store,options,capture,expected,originalFiles,manifest,archive,store,older,current,fixture,profile,inventory,counts,participants,historical,archiveClient,
   sources(owner=h.store??h.archive){const client=archiveClient(owner,'b-current');assert.equal(client.family,'restored-graph');const source=nativeSource.capture({source:current.source,backup:client.backup,checkAuthority:current.readOptions.checkAuthority});captures.push(source);return[{id:'a-older',family:participants[0].family,source:older.source},{id:'b-current',family:'restored-graph',source}];},
   release(){for(const capture of captures.splice(0))nativeSource.dispose(capture);},
   async begin(extra={}){h.store=await Store.begin({...options,database:tag,expected,archive:h.archive,...extra});return h.store;},
   async resume(extra={}){h.store=await Store.resume({...options,database:tag,expected,...extra});return h.store;},
   async closeStore(){h.release();await h.store?.close();h.store=undefined;},
   async close(){h.release();await h.store?.close();h.archive?.dispose();await current?.close();await older?.close();inventory.dispose();profile.free();reset();},
  };return h;
 }catch(error){for(const capture of captures)nativeSource.dispose(capture);await store?.close();archive?.dispose();await current?.close();await older?.close();inventory.dispose();profile.free();reset();throw error;}
}
