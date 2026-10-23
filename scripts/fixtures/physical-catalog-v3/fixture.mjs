/** Actual retained seven-family archive and disconnected native descendants.
 * The local flat source is a real imported lineage, not a generated source DTO. */
import assert from 'node:assert/strict';
import {physicalCatalogV2Fixture} from '../physical-catalog-v2/fixture.mjs';
import {roomLocalParticipant} from './local-participant.mjs';
export async function physicalCatalogV3Fixture({api,rich,internals,fixtures,item,documentSegmented,reviewSegmented,tag}){
 const {PhysicalRoomCatalogV3Archive:Archive,PhysicalRoomCatalogV3:Store,v3ArchiveState,v3StoreState,nativeInputIncomingSource:incoming,restoredGraphNativeSource:graph}=internals;
 const h=await physicalCatalogV2Fixture({api,rich,internals,fixtures,item,tag,documentSegmented,reviewSegmented}),captures=[];let local,archive,store;
 try{
  await h.older.close();local=await roomLocalParticipant({api,rich,profile:h.profile,fixture:h.fixture,metadata:h.inventory.metadata().native,client:h.fixture.clients[0],documentSegmented,reviewSegmented,tag:tag+'-local'});
  const locals=[{id:'local-snapshot',family:'local-operation-snapshot',file:local.snapshot.file(),expected:local.snapshot.selection()},{id:'local-flat',family:'local-operation-flat',file:local.flat.file(),expected:local.flat.selection()}],localPolicies=locals.map(row=>({id:row.id,family:row.family,original:row.expected.original,options:local.readOptions})),options={...h.options,localPolicies};
  const before={native:local.source.exportRecovery(),view:local.source.core.view(),uploads:await local.uploads.exportBackup()};
  archive=await Archive.capture({...h.capture,...options,participants:[...h.participants,...locals]});const expected=archive.selection(),manifest=archive.manifestJson(),files=archive.files();assert.equal(files.size,12);assert.equal(new Set(archive.metadata().participants.map(row=>row.family)).size,7);
  const value={archive,store,expected,manifest,files,options,local,h,before,
   async sources(owner=value.store??value.archive){const state=owner instanceof Archive?v3ArchiveState(owner):v3StoreState(owner),l=await incoming.capture({...local.readOptions,input:{kind:'flat-local-v1',backup:state.clients.get('local-flat').backup},source:local.source});let g;
    try{g=graph.capture({source:h.current.source,backup:state.clients.get('b-current').backup,checkAuthority:h.current.readOptions.checkAuthority});captures.push({local:l,graph:g});return[{id:'local-flat',family:'local-operation-flat',source:l},{id:'b-current',family:'restored-graph',source:g}];}catch(error){incoming.dispose(l);if(g)graph.dispose(g);throw error;}
   },
   release(){for(const row of captures.splice(0)){incoming.dispose(row.local);graph.dispose(row.graph);}},
   async begin(){value.store=await Store.begin({...options,database:tag+'-catalog',archive:value.archive,expected});return value.store;},
   async resume(){value.store=await Store.resume({...options,database:tag+'-catalog',expected});return value.store;},
   async closeStore(){value.release();await value.store?.close();value.store=undefined;},
   async close(){value.release();await value.store?.close();value.archive?.dispose();await local?.close();await h.close();},
  };return value;
 }catch(error){for(const row of captures){incoming.dispose(row.local);graph.dispose(row.graph);}await store?.close();archive?.dispose();await local?.close();await h.close();throw error;}
}
