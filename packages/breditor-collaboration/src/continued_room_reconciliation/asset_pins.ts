import {RichAssetArchive} from '@breditor/experimental-rich-content';
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {assetReferenceKey,generationAssetRequirements} from '../generation_recovery_control/asset_requirements.js';
import type {SharedServerLogGenerationRecoveryAssetInfo,SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import {continuedCatalogDeliveryBackup,continuedCatalogGenerationBackup,continuedCatalogIndependentBackup,SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {generationParticipantAssetMetadata,SharedGenerationParticipantBackup} from '../generation_participant/backup.js';
import {independentRecoveryArchive as independent} from '../independent_recovery/archive.js';
import {deliveryRecoveryArchive as delivery} from '../independent_delivery_recovery/archive.js';
import type {ContinuedRoomDeliveryRecoveryPolicy,ContinuedRoomGenerationRecoveryPolicy,ContinuedRoomIndependentRecoveryPolicy} from '../continued_room_recovery/contract.js';
import type {ContinuedRoomReconciliationRead} from './contract.js';
import {SharedEditorError} from '../core.js';

export const continuedReconciliationFailure=(suffix:string)=>new SharedEditorError(
 'continued_reconciliation_'+suffix,'Check the exact continued participant and provider data at one selected server cut',
);
const {metadata,participantMetadata,participantUploads}=SharedContinuedRoomCatalog.prototype;
const {read:readUploads,prototype:{entries,dispose}}=RichAssetArchive;
const generationUploads=SharedGenerationParticipantBackup.prototype.uploadBackup;
const shape=(row:Omit<SharedServerLogGenerationRecoveryAssetInfo,'asset'>)=>JSON.stringify([row.mime,row.bytes,row.width,row.height]);

export async function continuedProviderPins(
 archive:SharedContinuedRoomCatalog,context:ArchiveIntegrityContext,signal:AbortSignal,
 policies:ReadonlyMap<string,ContinuedRoomIndependentRecoveryPolicy>,
 deliveryPolicies:ReadonlyMap<string,ContinuedRoomDeliveryRecoveryPolicy>,
 generationPolicies:ReadonlyMap<string,ContinuedRoomGenerationRecoveryPolicy>,
){
 const content=new Map<string,string>(),bindings=new Map<string,{asset:string;generation:string;contentAsset:string}>(),identities=new Map<string,string>();
 const uploads:ContinuedRoomReconciliationRead['uploads'][number][]=[];
 const selected=metadata.call(archive).participants.filter(row=>row.family==='continued-local'||
  policies.has(row.id)||deliveryPolicies.has(row.id)||generationPolicies.has(row.id));
 let uploadBytes=0;
 function addContent(asset:string,row:Omit<SharedServerLogGenerationRecoveryAssetInfo,'asset'>){
  const previous=content.get(asset),current=shape(row);
  if(previous!==undefined&&previous!==current)throw continuedReconciliationFailure('diverged');
  content.set(asset,current);
 }
 const uploadIds=new Set<string>();
 for(const {id,family} of selected){
  context.guard();
  const policy=policies.get(id)??deliveryPolicies.get(id)??generationPolicies.get(id);
  const backup=family==='independent-local'?continuedCatalogIndependentBackup(archive,id):undefined;
  const deliveryBackup=family==='independent-delivery'?continuedCatalogDeliveryBackup(archive,id):undefined;
  const generationBackup=family==='generation'?continuedCatalogGenerationBackup(archive,id):undefined;
  const info=backup?independent.metadata.call(backup):deliveryBackup?delivery.metadata.call(deliveryBackup):
   generationBackup?generationParticipantAssetMetadata(generationBackup):participantMetadata.call(archive,id);
  for(const raster of info.assets)addContent(raster.contentAsset,raster);
  for(const binding of info.bindings){
   const {asset,generation,contentAsset}=binding,key=assetReferenceKey(binding);
   if(identities.has(asset)&&identities.get(asset)!==contentAsset)throw continuedReconciliationFailure('diverged');
   identities.set(asset,contentAsset);
   bindings.set(key,{asset,generation,contentAsset});
  }
  const file=backup?independent.uploadBackup.call(backup):deliveryBackup?delivery.uploadBackup.call(deliveryBackup):
   generationBackup?generationUploads.call(generationBackup):participantUploads.call(archive,id);
  if((uploadBytes+=file.size)>512*1024*1024)throw continuedReconciliationFailure('budget');
  const parsed=await readUploads.call(RichAssetArchive,file,{signal,...(policy?.limits?{limits:policy.limits}:{})});
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
