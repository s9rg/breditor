import {RichAssetArchive,type AssetLimits} from '@breditor/experimental-rich-content';
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {assetReferenceKey,generationAssetRequirements} from '../generation_recovery_control/asset_requirements.js';
import type {SharedServerLogGenerationRecoveryAssetInfo,SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import {continuedCatalogClient,SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {generationParticipantAssetMetadata,SharedGenerationParticipantBackup} from '../generation_participant/backup.js';
import {originalParticipantAssetMetadata,SharedParticipantBackup} from '../participant_backup/archive.js';
import {independentRecoveryArchive as independent} from '../independent_recovery/archive.js';
import {deliveryRecoveryArchive as delivery} from '../independent_delivery_recovery/archive.js';
import {portableLocalOperationArchive as snapshot} from '../independent_local_operation/portable_backup.js';
import {flatLocalArchive as flat} from '../flat_local_operation/archive.js';
import {restoredGraphArchive as graph,restoredGraphAssetMetadata} from '../restored_graph/archive.js';
import type {SharedAssetByteBinding,SharedAssetBytePayload} from '../asset_bytes/types.js';
import type {ContinuedRoomReconciliationRead} from './contract.js';
import {SharedEditorError} from '../core.js';

export const continuedReconciliationFailure=(suffix:string)=>new SharedEditorError(
 'continued_reconciliation_'+suffix,'Check the exact continued participant and provider data at one selected server cut',
);
const {metadata,participantMetadata,participantUploads}=SharedContinuedRoomCatalog.prototype;
const {read:readUploads,prototype:{entries,dispose}}=RichAssetArchive;
const generationUploads=SharedGenerationParticipantBackup.prototype.uploadBackup;
const originalUploads=SharedParticipantBackup.prototype.uploadBackup;
const shape=(row:Omit<SharedServerLogGenerationRecoveryAssetInfo,'asset'>)=>JSON.stringify([row.mime,row.bytes,row.width,row.height]);
type Pins=Readonly<{bindings:readonly SharedAssetByteBinding[];assets:readonly SharedAssetBytePayload[]}>;
function participantAssets(archive:SharedContinuedRoomCatalog,id:string,isContinued:boolean):{metadata:Iterable<Pins>;file:Blob}{
 if(isContinued)return {metadata:[participantMetadata.call(archive,id)],file:participantUploads.call(archive,id)};
 const client=continuedCatalogClient(archive,id);
 switch(client.family){
  case 'independent-local':return {metadata:[independent.metadata.call(client.backup)],file:independent.uploadBackup.call(client.backup)};
  case 'independent-delivery':return {metadata:[delivery.metadata.call(client.backup)],file:delivery.uploadBackup.call(client.backup)};
  case 'generation':return {metadata:[generationParticipantAssetMetadata(client.backup)],file:generationUploads.call(client.backup)};
  case 'original':return {metadata:[originalParticipantAssetMetadata(client.backup)],file:originalUploads.call(client.backup)};
  case 'restored-graph':return {metadata:restoredGraphAssetMetadata(client.backup),file:graph.uploads.call(client.backup)};
  case 'local-operation-snapshot':return {metadata:[snapshot.metadata.call(client.backup)],file:snapshot.uploads.call(client.backup)};
  case 'local-operation-flat':return {metadata:[flat.metadata.call(client.backup)],file:flat.uploads.call(client.backup)};
 }
}

export async function continuedProviderPins(
 archive:SharedContinuedRoomCatalog,context:ArchiveIntegrityContext,signal:AbortSignal,
 admitted:ReadonlyMap<string,Partial<AssetLimits>|undefined>,
){
 const content=new Map<string,string>(),bindings=new Map<string,{asset:string;generation:string;contentAsset:string}>(),identities=new Map<string,string>();
 const uploads:ContinuedRoomReconciliationRead['uploads'][number][]=[];
 const selected=metadata.call(archive).participants.filter(row=>admitted.has(row.id));
 let uploadBytes=0;
 function addContent(asset:string,row:Omit<SharedServerLogGenerationRecoveryAssetInfo,'asset'>){
  const previous=content.get(asset),current=shape(row);
  if(previous!==undefined&&previous!==current)throw continuedReconciliationFailure('diverged');
  content.set(asset,current);
 }
 const uploadIds=new Set<string>();
 for(const {id,family} of selected){
  context.guard();
  const limits=admitted.get(id),{metadata,file}=participantAssets(archive,id,family==='continued-local');
  for(const info of metadata){
   context.guard();
   for(const raster of info.assets)addContent(raster.contentAsset,raster);
   for(const binding of info.bindings){
    const {asset,generation,contentAsset}=binding,key=assetReferenceKey(binding);
    if(identities.has(asset)&&identities.get(asset)!==contentAsset)throw continuedReconciliationFailure('diverged');
    identities.set(asset,contentAsset);
    bindings.set(key,{asset,generation,contentAsset});
   }
  }
  if((uploadBytes+=file.size)>512*1024*1024)throw continuedReconciliationFailure('budget');
  const parsed=await readUploads.call(RichAssetArchive,file,{signal,...(limits?{limits}:{})});
  try{
   context.guard();
   const rows=entries.call(parsed);
   for(const row of rows){addContent(row.asset,row);uploadIds.add(row.asset);}
   uploads.push({id,bytes:file.size,sha256:await context.digest(file),entries:rows});
  }finally{dispose.call(parsed);}
 }
 const requirements=generationAssetRequirements({
  references:[...bindings.values()].map(({asset,generation})=>({asset,generation})),
  uploads:[...uploadIds],
 });
 return {
  requirements,uploads,
  verify(provider:SharedServerLogGenerationRecoveryAssetRead){
   for(const resolution of provider.resolutions){
    if(bindings.get(assetReferenceKey(resolution.reference))?.contentAsset!==resolution.contentAsset)
     throw continuedReconciliationFailure('diverged');
   }
   for(const asset of provider.assets){
    if(content.get(asset.asset)!==shape(asset))throw continuedReconciliationFailure('diverged');
   }
  },
 };
}
