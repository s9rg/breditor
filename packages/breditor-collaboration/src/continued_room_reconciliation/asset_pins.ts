import {RichAssetArchive} from '@breditor/experimental-rich-content';
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {assetReferenceKey,generationAssetRequirements} from '../generation_recovery_control/asset_requirements.js';
import type {SharedServerLogGenerationRecoveryAssetInfo,SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import {SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import type {ContinuedRoomReconciliationRead} from './contract.js';
import {SharedEditorError} from '../core.js';

export const continuedReconciliationFailure=(suffix:string)=>new SharedEditorError(
 'continued_reconciliation_'+suffix,'Check the exact continued participant and provider data at one selected server cut',
);
const {metadata,participantMetadata,participantUploads}=SharedContinuedRoomCatalog.prototype;
const {read:readUploads,prototype:{entries,dispose}}=RichAssetArchive;
const shape=(row:Omit<SharedServerLogGenerationRecoveryAssetInfo,'asset'>)=>JSON.stringify([row.mime,row.bytes,row.width,row.height]);

export async function continuedProviderPins(archive:SharedContinuedRoomCatalog,context:ArchiveIntegrityContext,signal?:AbortSignal){
 const content=new Map<string,string>(),bindings=new Map<string,{asset:string;generation:string;contentAsset:string}>(),identities=new Map<string,string>();
 const uploads:ContinuedRoomReconciliationRead['uploads'][number][]=[];
 const sizes=metadata.call(archive).participants.filter(row=>row.family==='continued-local');
 let uploadBytes=0;
 function addContent(asset:string,row:Omit<SharedServerLogGenerationRecoveryAssetInfo,'asset'>){
  const previous=content.get(asset),current=shape(row);
  if(previous!==undefined&&previous!==current)throw continuedReconciliationFailure('diverged');
  content.set(asset,current);
 }
 const uploadIds=new Set<string>();
 for(const {id} of sizes){
  context.guard();
  const selected=participantMetadata.call(archive,id);
  for(const raster of selected.assets)addContent(raster.contentAsset,raster);
  for(const binding of selected.bindings){
   const {asset,generation,contentAsset}=binding,key=assetReferenceKey(binding);
   if(identities.has(asset)&&identities.get(asset)!==contentAsset)throw continuedReconciliationFailure('diverged');
   identities.set(asset,contentAsset);
   bindings.set(key,{asset,generation,contentAsset});
  }
  const file=participantUploads.call(archive,id);
  if((uploadBytes+=file.size)>512*1024*1024)throw continuedReconciliationFailure('budget');
  const parsed=await readUploads.call(RichAssetArchive,file,signal?{signal}:{});
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
