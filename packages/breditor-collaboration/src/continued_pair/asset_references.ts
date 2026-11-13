import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {disposeOwnedCore} from '../owned_core_lifetime.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {continuedPairReadFailure,ContinuedPairRecordRead,type ContinuedPairRecords} from './read_records.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import {portableRecoveryReferences} from '../independent_operation/portable_references.js';
import {ContinuedDeliveryCompanion} from '../continued_delivery/companion.js';
import {forwardProgress} from '../segmented_relay/validation.js';
import type {ContinuedDeliveryRecords,SharedContinuedDeliveryRecovery} from '../continued_delivery/contract.js';
import type {SharedContinuedPairRecovery} from './contract.js';

export type ContinuedPairSlot='committed'|'attempt'|'pending'|'live';
export interface SharedContinuedPairAssetReferences {
 readonly format:'breditor/continued-pair-asset-references';
 readonly formatVersion:1;
 readonly identity:SharedContinuedPairRecovery['identity'];
 readonly committedHead:string;
 readonly states:readonly Readonly<{slot:ContinuedPairSlot;references:readonly RichRetainedAssetReference[]}>[];
 readonly references:readonly RichRetainedAssetReference[];
}
const order=(a:RichRetainedAssetReference,b:RichRetainedAssetReference)=>
 a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0;
const key=(row:RichRetainedAssetReference)=>JSON.stringify([row.asset,row.generation]);
const {verifyRecoveryOrigin:verifyOriginal,verifySegmentedRecoveryOrigin:verifyGeneration}=SharedRichEditor.prototype;
const {check:checkRead,verify:verifyRead,metadata:readMetadata}=ContinuedPairRecordRead.prototype;

/** Only genuine read-only native replay supplies asset references for a slot. */
export async function readContinuedPairAssetReferences<P extends SharedSelectionPolicy>(
 read:ContinuedPairRecordRead,replay:(recovery:SharedContinuedPairRecovery,check:()=>void)=>Promise<SharedRichEditor<P>>,
):Promise<SharedContinuedPairAssetReferences>{
 const check=()=>checkRead.call(read);
 const references=await replayContinuedPairAssetReferences(readMetadata.call(read),replay,check);
 await verifyRead.call(read);
 return references;
}

/** Shared by the live held read and the independently selected portable reader. */
export async function replayContinuedPairAssetReferences<P extends SharedSelectionPolicy>(
 records:Pick<ContinuedPairRecords,'committed'|'attempt'|'pending'|'live'>,replay:(recovery:SharedContinuedPairRecovery,check:()=>void)=>Promise<SharedRichEditor<P>>,check:()=>void,
 delivery?:Readonly<{records:ContinuedDeliveryRecords;pending:SharedAssetCapturePending[]}>,
):Promise<SharedContinuedPairAssetReferences>{
 const selected:readonly [ContinuedPairSlot,SharedContinuedPairRecovery|null][]=[
  ['committed',records.committed.recovery],['attempt',records.attempt?.capture??null],['pending',records.pending],['live',records.live],
 ];
 const states:SharedContinuedPairAssetReferences['states'][number][]=[],union=new Map<string,RichRetainedAssetReference>();
 let previous:{core:SharedRichEditor<P>;recovery:SharedContinuedPairRecovery;delivery?:SharedContinuedDeliveryRecovery}|undefined;
 const selectedDelivery=delivery?.records;
 const deliverySlots=selectedDelivery&&{committed:selectedDelivery.committed.recovery,attempt:selectedDelivery.attempt?.capture,
  pending:selectedDelivery.pending,live:selectedDelivery.live};
 try{
  for(const [slot,recovery] of selected){
   if(!recovery)continue;
   check();
   const core=await replay(recovery,check);
   let retained=false;
   try{
    check();
    if(previous){
     if(previous.recovery.versions.some((packet,index)=>packet!==recovery.versions[index]))
      throw continuedPairReadFailure('version_prefix');
     if(recovery.identity.documentHistory==='original')verifyOriginal.call(core,previous.core);
     else verifyGeneration.call(core,previous.core);
    }
    const saved=deliverySlots?.[slot];
    if(saved){
     const identity=saved.source.identity;
     const {document,review}=saved.relay.binding;
     if(!review)throw continuedPairReadFailure('identity');
     const companion=new ContinuedDeliveryCompanion({
      database:'portable-continued-delivery',...identity,review:{...identity.review,access:'read_only'},
      readOnly:true,binding:{document,review},retained:saved.retainedBinding,
      restoreDocument(){throw continuedPairReadFailure('identity');},
     },saved);
     companion.admit(core);
     if(previous?.delivery)forwardProgress(previous.delivery.relay,saved.relay);
    }
    const selected=portableRecoveryReferences(core,{source:recovery,retained:saved?.retained??{
     versions:null,suggestions:null,revisions:null,
    }},check);
    if(selected.pending.length){
     if(!delivery)throw continuedPairReadFailure('asset_pending');
     delivery.pending.push(...selected.pending);
    }
    const references=new Map(selected.references.map(row=>[key(row),row]));
    for(const [id,row] of references)union.set(id,row);
    if(union.size>100000)throw continuedPairReadFailure('asset_budget');
    states.push({slot,references:[...references.values()].sort(order)});
    if(previous)disposeOwnedCore(previous.core);
    previous={core,recovery,...(saved?{delivery:saved}:{})};
    retained=true;
   }finally{if(!retained)disposeOwnedCore(core);}
  }
 }finally{if(previous)disposeOwnedCore(previous.core);}
 check();
 return frozen({format:'breditor/continued-pair-asset-references',formatVersion:1,identity:structuredClone(records.live.identity),
  committedHead:records.committed.head,states,references:[...union.values()].sort(order)});
}


/** The delivery archive uses the same native pair proof plus all retained packets. */
export async function replayContinuedDeliveryAssetReferences<P extends SharedSelectionPolicy>(
 records:ContinuedDeliveryRecords,replay:(recovery:SharedContinuedPairRecovery,check:()=>void)=>Promise<SharedRichEditor<P>>,check:()=>void,
){
 const {committed,attempt,pending,live}=records,missing:SharedAssetCapturePending[]=[];
 const references=await replayContinuedPairAssetReferences({
  committed:{head:committed.head,recovery:committed.recovery.source},
  attempt:attempt?{capture:attempt.capture.source,cut:null}:null,
  pending:pending?.source??null,live:live.source,
 },replay,check,{records,pending:missing});
 return {references,missing};
}
