/** Explicit dependency preparation before taking the final reconstruction cut.
 * Actual existing source caches receive real packet bodies through their Native
 * loans. No document/comment socket, catalog refresh or version publication is
 * started. The complete pre-change cut is returned intact alongside the result. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {selectedNativeDeliverySources} from '../relay/native_delivery.js';
import {SelectedLocalMetadataDelivery as Metadata} from '../selected_local_metadata_delivery/coordinator.js';
import {prepareCompoundMetadata} from '../metadata/compound_preparation.js';
import {createNativeVersionDelivery,type NativeVersionDelivery} from '../versions/native_delivery.js';
import {SharedDocumentVersions} from '../versions/catalog.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {coreReadStamp} from '../core_read_stamp.js';
import type {SelectedRoomCurrentFile,SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {jointIntentFailure as fail,jointEqual as equal} from './intent_policy.js';
export interface SourceVersionMaterializationChoice {
 readonly format:'breditor/source-version-materialization-choice';readonly formatVersion:1;
 readonly before:SelectedRoomCurrentSelection;
 readonly members:readonly Readonly<{id:string;versions:readonly string[]}>[];
}
export interface SourceVersionMaterializationInput {
 readonly getToken:(participant:string,signal:AbortSignal)=>string|Promise<string>;
 readonly checkAuthority:()=>void;
 readonly approve:(choice:SourceVersionMaterializationChoice)=>boolean|Promise<boolean>;
 readonly requestTimeoutMs?:number;
}
export interface SourceVersionMaterializationResult {
 readonly format:'breditor/source-version-materialization-result';readonly formatVersion:1;
 readonly choice:SourceVersionMaterializationChoice;readonly before:SelectedRoomCurrentFile;readonly after:SelectedRoomCurrentFile;
 readonly materialized:number;readonly scope:'actual-existing-catalog-packet-bodies-only';
}
const delivery=Metadata.prototype.createDelivery,recovery=Metadata.prototype.recovery,add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
const catalogVersions=SharedDocumentVersions.prototype.versions,catalogStatus=SharedDocumentVersions.prototype.versionStatus;
/** Genuine same-source metadata composition only. DATA and source-shaped
 * objects cannot supply the actual Native contexts or cache write authority. */
export async function materializeSelectedSourceVersions(scope:SelectedNativeRecoveryScope,metadata:Metadata,provided:SourceVersionMaterializationInput):Promise<SourceVersionMaterializationResult>{
 const sources=selectedNativeDeliverySources(scope);scope.check();const r=fields(provided,['getToken','checkAuthority','approve'],['requestTimeoutMs']);if(typeof r['getToken']!=='function'||typeof r['approve']!=='function')throw fail();
 const authority=participantAuthority(r['checkAuthority'] as ()=>void),getToken=r['getToken'] as SourceVersionMaterializationInput['getToken'],check=()=>{scope.check();authority();scope.check();},before=await scope.retainCurrent();check();
 const originalLocalRecords=recovery.call(metadata).current.lanes.map(row=>({id:row.id,records:row.records})),stamps=new Map(sources.map(row=>[row.id,coreReadStamp(row.source.core)])),owned:{id:string;catalog:Parameters<typeof createNativeVersionDelivery>[0];source:typeof sources[number]['source'];missing:readonly string[]}[]=[];
 let materialized=0;
  for(const row of sources){
   // Independent-local metadata is preserved separately by continuation. Its
   // caches are not part of the concrete source recipe's retained catalog.
   const parent=row.source.parent;if(parent.kind==='independent-local'||parent.kind==='generation'&&parent.source.kind==='local')continue;
   check();const context=delivery.call(metadata,row.source,'comment');
   try{let children;if(parent.kind==='original')children=parent.packets;else if(parent.kind==='generation'){if(parent.source.kind==='local')continue;children=await prepareCompoundMetadata(parent.source.session,context);}else children=await prepareCompoundMetadata(parent.session,context);check();if(!children.versions)continue;
    const catalog=children.versions,missing=catalogVersions.call(catalog).filter(info=>!catalogStatus.call(catalog,info.id).cached).map(info=>info.id).sort();
    owned.push({id:row.id,catalog,source:row.source,missing});
   }finally{
    // Preparation opens children owned by their genuine source. The temporary
    // delivery port owns no child: a fresh port can lend that same catalog.
    // Release the port before retaining records, so no active loan blocks the
    // final source-cut read. Each subsequent write gets fresh current admission.
    await context.close();
   }
  }
  const choice=frozen({format:'breditor/source-version-materialization-choice' as const,formatVersion:1 as const,before:before.current.selection,members:owned.filter(row=>row.missing.length).map(row=>({id:row.id,versions:row.missing}))});
  let active:NativeVersionDelivery|undefined;const cancel=()=>active?.disconnect();add.call(scope.signal,'abort',cancel,{once:true});
  try{
   await decideFreshAssetChoice(choice,r['approve'] as SourceVersionMaterializationInput['approve'],{check,signal:scope.signal,watchClosing:notify=>{add.call(scope.signal,'abort',notify,{once:true});return()=>remove.call(scope.signal,'abort',notify);}});check();
   if(!equal((await scope.retainCurrent()).current.selection,before.current.selection))throw fail('joint_activation_intent_stale');check();
   for(const row of owned){if(!row.missing.length)continue;check();const context=delivery.call(metadata,row.source,'comment');let versions:NativeVersionDelivery|undefined;
    try{versions=createNativeVersionDelivery(row.catalog,context,{getToken:signal=>{check();return getToken(row.id,signal);},...(r['requestTimeoutMs']===undefined?{}:{requestTimeoutMs:r['requestTimeoutMs'] as number})});active=versions;
     for(const id of row.missing){check();await versions.materializeVersion(id);check();materialized++;}
    }finally{try{await versions?.close();}finally{active=undefined;await context.close();}}
   }
  }finally{remove.call(scope.signal,'abort',cancel);}
  check();for(const row of sources)if(!equal(coreReadStamp(row.source.core),stamps.get(row.id)))throw fail('joint_activation_intent_stale');
  if(!equal(recovery.call(metadata).current.lanes.map(row=>({id:row.id,records:row.records})),originalLocalRecords))throw fail('joint_activation_intent_stale');
  const after=await scope.retainCurrent();check();return Object.freeze({format:'breditor/source-version-materialization-result',formatVersion:1,choice,before:before.current,after:after.current,materialized,scope:'actual-existing-catalog-packet-bodies-only'});
}
