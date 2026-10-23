/** Actual admitted seven-family metadata for pure intent tests. This fixture
 * creates no operational V3 owner and makes no physical durability claim. */
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {PhysicalRoomCatalogV2Archive,physicalCatalogV2ArchiveState} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v2/archive.js';
import {PhysicalRoomCatalogV2,physicalRoomCatalogV2State} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v2/catalog.js';
import {restoredGraphNativeSource} from '../../../packages/breditor-collaboration/dist/restored_graph/native_source.js';
import {PhysicalRoomCatalogV3Archive,physicalCatalogV3ArchiveState} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v3/archive.js';
import {nativeInventoryFixtures} from '../independent-inventory/native.mjs';
import {physicalCatalogV2Fixture} from '../physical-catalog-v2/fixture.mjs';
import {roomLocalParticipant} from '../physical-catalog-v3/local-participant.mjs';
export async function operationalV3Manifest(inspect){
 const fixtures=await nativeInventoryFixtures(),internals={PhysicalRoomCatalogV2Archive,PhysicalRoomCatalogV2,archiveState:physicalCatalogV2ArchiveState,storeState:physicalRoomCatalogV2State,restoredGraphNativeSource};
 const h=await physicalCatalogV2Fixture({api,rich,internals,fixtures,tag:'v3-operation-record',documentSegmented:true,reviewSegmented:true});let local,archive;
 try{await h.older.close();local=await roomLocalParticipant({api,rich,profile:h.profile,fixture:h.fixture,metadata:h.inventory.metadata().native,client:h.fixture.clients[0],documentSegmented:true,reviewSegmented:true,tag:'v3-operation-record-local'});
  const extra=[{id:'local-snapshot',family:'local-operation-snapshot',file:local.snapshot.file(),expected:local.snapshot.selection()},{id:'local-flat',family:'local-operation-flat',file:local.flat.file(),expected:local.flat.selection()}],localPolicies=extra.map(row=>({id:row.id,family:row.family,original:row.expected.original,options:local.readOptions}));
  archive=await PhysicalRoomCatalogV3Archive.capture({...h.capture,localPolicies,participants:[...h.participants,...extra]});return inspect?await inspect({archive,source:physicalCatalogV3ArchiveState(archive),h,local}):{manifest:archive.manifestJson(),selection:archive.selection(),metadata:archive.metadata()};
 }finally{archive?.dispose();await local?.close();await h.close();}
}
