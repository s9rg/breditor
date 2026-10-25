/** SDK-private authenticated availability while actual current native parents,
 * selected queues and inherited whole-origin stores remain held. No data report
 * selects a store, settles a queue, covers a registration or activates a room. */
import {RichAssetArchive} from '@breditor/experimental-rich-content';
import {physicalRecoveryHostPort,type SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import type {SharedPhysicalRecoveryAssetInfo,SharedPhysicalRecoveryAssetRead} from '../physical_recovery_control/asset_contract.js';
import type {PhysicalRoomCatalogV3Metadata} from '../physical_room_catalog_v3/contract.js';
import type {RoomAssetAdoptionRecord} from '../physical_room_asset_adoption/contract.js';
import type {SelectedAssetCurrentCut} from '../physical_room_asset_successor/owner.js';
import type {PhysicalRecordCutVisit} from '../physical_room_operation_v3/record_cut.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail} from '../physical_room_asset_adoption/policy.js';
import type {SelectedRoomProviderRead,SelectedRoomUploadPin} from './contract.js';
const read=RichAssetArchive.read,entries=RichAssetArchive.prototype.entries,dispose=RichAssetArchive.prototype.dispose;
const info=(row:SharedPhysicalRecoveryAssetInfo)=>JSON.stringify([row.asset,row.mime,row.bytes,row.width,row.height]);
/** Resolve the actual brand and complete independent host pin before read
 * callbacks. A catalog cannot relabel the host's separately selected local origin. */
export function selectedRoomProvider(host:SharedPhysicalRoomRecoveryHost,catalog:PhysicalRoomCatalogV3Metadata,record:RoomAssetAdoptionRecord){
 const port=physicalRecoveryHostPort(host),source=port.selection.source;
 if(JSON.stringify(source.ancestor)!==JSON.stringify(catalog.origin.identity)||JSON.stringify(source.server)!==JSON.stringify(catalog.current.server.identity)||JSON.stringify(source.participants)!==JSON.stringify(catalog.current.participants.identity))throw fail('asset_adoption_diverged');
 return async(cut:SelectedAssetCurrentCut,scope:PhysicalRecordCutVisit,check:()=>void):Promise<SelectedRoomProviderRead>=>{
  const content=new Map<string,SharedPhysicalRecoveryAssetInfo>(),pins:SelectedRoomUploadPin[]=[],sources=[...scope.uploads.map(row=>({...row,role:'origin' as const})),...cut.uploads.map(row=>({...row,role:'selected' as const}))];
  if(sources.length>2048||sources.reduce((n,row)=>n+row.file.size,0)>512*1024*1024)throw fail('asset_adoption_budget');
  for(const row of sources){check();const selected=record.participants.find(value=>value.id===row.id);if(!selected)throw fail('asset_adoption_diverged');const archive=await read.call(RichAssetArchive,row.file,{limits:selected.limits,...(scope.signal?{signal:scope.signal}:{})});
   try{check();const values=entries.call(archive);for(const value of values){const next:SharedPhysicalRecoveryAssetInfo={asset:value.asset,mime:value.mime,bytes:value.bytes,width:value.width,height:value.height},previous=content.get(next.asset);if(previous&&info(previous)!==info(next))throw fail('asset_adoption_diverged');content.set(next.asset,next);}pins.push({id:row.id,role:row.role,bytes:row.file.size,sha256:await scope.assets.digest(row.file),entries:values});check();}finally{dispose.call(archive);}
  }
  let provider:SharedPhysicalRecoveryAssetRead|null=null;if(scope.history.history.kind!=='ready'||scope.history.unreconciledParticipants.length){await port.check(scope.signal);check();}else{provider=await port.checkAssets({references:scope.history.history.references,uploads:[...content.keys()].sort()},scope.signal);check();for(const actual of provider.assets){const local=content.get(actual.asset);if(local&&info(local)!==info(actual))throw fail('asset_adoption_diverged');}}
  return frozen(structuredClone({format:'breditor/selected-room-provider-read' as const,formatVersion:1 as const,scope:'held-current-native-selected-and-origin-whole-uploads' as const,kind:provider!==null&&!provider.missing.length?'checked' as const:'pending' as const,control:port.selection,approval:cut.approval.selection,current:cut.root.selection,history:scope.history,uploads:pins,provider}));
 };
}
