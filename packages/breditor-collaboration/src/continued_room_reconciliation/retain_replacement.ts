import {SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {SharedContinuedRoomCatalogStore as Store} from '../continued_room_catalog/storage.js';
import type {ContinuedRoomCatalogInput,ContinuedRoomCatalogPolicy} from '../continued_room_catalog/contract.js';
import {encodeContinuedDeliveryReplacement} from '../continued_participant/archive.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {physicalCatalogDatabase,physicalCatalogName} from '../physical_room_catalog/policy.js';
import {physicalCatalogV2Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {assetReferenceKey} from '../generation_recovery_control/asset_requirements.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {retainActivationChoice} from '../room_native_activation_intent/retain_choice.js';
import {withContinuedRoomCatchUp} from './catch_up.js';
import {continuedReconciliationFailure as fail} from './asset_pins.js';
import type {RecoveredContinuedRoomReconciliationOptions,RecoveredContinuedRoomReplacementChoice,RecoveredContinuedRoomReplacementOptions} from './contract.js';

const {capture,prototype:{metadata,selection,files,participantFile,participantDeliveryRecords,participantUploads,participantAsset,dispose}}=SharedContinuedRoomCatalog;
const {begin,prototype:{close}}=Store;

/** Preserve the exact reconstructed states in a fresh ordinary catalog. The
 * old catalog and the completed recovery remain available as the basis. */
export async function retainRecoveredContinuedRoomCatchUp(
 input:RecoveredContinuedRoomReconciliationOptions,options:RecoveredContinuedRoomReplacementOptions,
):Promise<RecoveredContinuedRoomReplacementChoice>{
 physicalCatalogV2Options(options,['database','catalog','retainChoice'],[]);
 const {database:provided,catalog:name,retainChoice}=options;
 const database=physicalCatalogDatabase(provided),catalog=physicalCatalogName(name);
 if(typeof retainChoice!=='function')throw fail('policy');
 return withContinuedRoomCatchUp(input,async (preview,read,held,host,check,signal)=>{
  if(held.namespaces.includes(database)||preview.catalog.catalog===catalog)throw fail('policy');
  const existing=await existingDatabase(database);
  if(existing){existing.close();throw fail('exists');}
  check();
  const provider=read.reconciliation.provider!;
  const bindings=new Map(provider.resolutions.map(row=>[assetReferenceKey(row.reference),row.contentAsset]));
  const assets=new Map(provider.assets.map(row=>[row.asset,row]));
  const rasters=new Map<string,Blob>();
  const previous=metadata.call(held.archive),archivedFiles=files.call(held.archive);
  const {wasm,policies:sourcePolicies,graphPolicies,localPolicies}=held.catalogOptions;
  const policies=new Map(sourcePolicies.map(row=>[row.id,row]));
  const advanced:RecoveredContinuedRoomReplacementChoice['advanced'][number][]=[];
  const participants:ContinuedRoomCatalogInput[]=[];
  const reconstructed=new Map(preview.participants.map(row=>[row.id,row.recovery]));
  for(const entry of previous.participants){
   check();
   if(entry.family!=='continued-delivery'){
    participants.push({id:entry.id,family:entry.family,expected:entry.selection,file:participantFile.call(held.archive,entry.id)} as ContinuedRoomCatalogInput);
    continue;
   }
   const {id}=entry,policy=policies.get(id),live=reconstructed.get(id);
   if(!policy||!live)throw fail('diverged');
   const records={...participantDeliveryRecords.call(held.archive,id),live};
   const encoded=await encodeContinuedDeliveryReplacement(entry.selection.identity,records,participantUploads.call(held.archive,id),{
    wasm,signal,checkAuthority:check,restoreDocument:policy.restoreDocument,...(policy.limits?{limits:policy.limits}:{}),
    async resolveAsset(reference){
     check();
     const archived=participantAsset.call(held.archive,id,reference.asset,reference.generation);
     let blob=archived;
     if(!blob){
      const content=bindings.get(assetReferenceKey(reference)),expected=content&&assets.get(content);
      if(!content||!expected)return undefined;
      blob=rasters.get(content);
      if(!blob){
       const {raster}=await host.readRaster(content,signal);
       check();
       if(!raster)return undefined;
       const {info}=raster;
       if(info.asset!==expected.asset||info.mime!==expected.mime||info.bytes!==expected.bytes||
          info.width!==expected.width||info.height!==expected.height)throw fail('diverged');
       blob=raster.blob;
       rasters.set(content,blob);
      }
     }
     return {...reference,blob,identity:/^sha256:[a-f0-9]{64}$/.test(reference.asset)?'content-addressed':'host-verified',check};
    },
   });
   advanced.push({id,expected:encoded.selection});
   policies.set(id,{...policy,expected:encoded.selection} satisfies ContinuedRoomCatalogPolicy);
   participants.push({id,family:entry.family,expected:encoded.selection,file:encoded.file});
  }
  const chosen={wasm,policies:[...policies.values()],signal,checkAuthority:check,
   ...(graphPolicies?{graphPolicies}:{}),...(localPolicies?{localPolicies}:{})};
  const replacement=await capture.call(SharedContinuedRoomCatalog,{...chosen,catalog,participants,
   origin:{file:archivedFiles.get('origin-server')!,expected:previous.origin.identity},
   current:{server:{file:archivedFiles.get('current-server')!,expected:previous.current.server.identity},
    participants:{file:archivedFiles.get('inventory')!,expected:previous.current.participants.identity}},
  });
  try{
   const expected=selection.call(replacement);
   const choice:RecoveredContinuedRoomReplacementChoice=frozen({format:'breditor/recovered-continued-room-replacement',formatVersion:1,
    database,source:preview.catalog,server:preview.server,replacement:expected,advanced});
   await retainActivationChoice(choice,retainChoice,check,[signal]);
   await host.check(signal);
   await held.verifyExact();
   const stored=await begin.call(Store,{...chosen,database,archive:replacement,expected});
   await close.call(stored);
   check();
   return choice;
  }finally{dispose.call(replacement);}
 });
}
