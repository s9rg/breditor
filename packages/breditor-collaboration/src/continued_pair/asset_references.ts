import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {disposeOwnedCore} from '../owned_core_lifetime.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {continuedPairReadFailure,ContinuedPairRecordRead} from './read_records.js';
import type {SharedContinuedPairRecovery} from './contract.js';

type Slot='committed'|'attempt'|'pending'|'live';
export interface SharedContinuedPairAssetReferences {
 readonly format:'breditor/continued-pair-asset-references';
 readonly formatVersion:1;
 readonly identity:SharedContinuedPairRecovery['identity'];
 readonly committedHead:string;
 readonly states:readonly Readonly<{slot:Slot;references:readonly RichRetainedAssetReference[]}>[];
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
 const check=()=>checkRead.call(read),records=readMetadata.call(read);
 const selected:readonly [Slot,SharedContinuedPairRecovery|null][]=[
  ['committed',records.committed.recovery],['attempt',records.attempt?.capture??null],['pending',records.pending],['live',records.live],
 ];
 const states:SharedContinuedPairAssetReferences['states'][number][]=[],union=new Map<string,RichRetainedAssetReference>();
 let previous:{core:SharedRichEditor<P>;recovery:SharedContinuedPairRecovery}|undefined;
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
    const base=native.retainedAssetReferences.call(core);
    if(base.document!==recovery.identity.native.room)throw continuedPairReadFailure('identity');
    const references=new Map(base.references.map(row=>[key(row),row]));
    for(const packet of recovery.versions){
     const version=native.versionAssetReferences.call(core,packet,base.revision);
     native.checkPacketAssetReferences.call(core,version,base.revision);
     if(version.outcome.kind!=='ready')throw continuedPairReadFailure('asset_pending');
     for(const row of version.outcome.references)references.set(key(row),row);
    }
    native.checkRetainedAssetReferences.call(core,base,base.revision);
    for(const [id,row] of references)union.set(id,row);
    if(union.size>100000)throw continuedPairReadFailure('asset_budget');
    states.push({slot,references:[...references.values()].sort(order)});
    if(previous)disposeOwnedCore(previous.core);
    previous={core,recovery};
    retained=true;
   }finally{if(!retained)disposeOwnedCore(core);}
  }
 }finally{if(previous)disposeOwnedCore(previous.core);}
 await verifyRead.call(read);
 return frozen({format:'breditor/continued-pair-asset-references',formatVersion:1,identity:structuredClone(records.live.identity),
  committedHead:records.committed.head,states,references:[...union.values()].sort(order)});
}
