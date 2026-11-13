import {canonicalContinuedPairIdentity,continuedPairStore} from '../continued_pair/cut.js';
import type {ContinuedPairHead,SharedContinuedPairRecovery} from '../continued_pair/contract.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import {admitNativeDeliveryProgress} from '../delivery_state/native_progress.js';
import {admitDeliveryRetainedRecords,deliveryRetainedBinding,deliveryRetainedRecords,emptyDeliveryRetainedRecords} from '../delivery_state/retained.js';
import {closed,forwardProgress,initialRelayProgress,relayBinding,relayProgress} from '../segmented_relay/validation.js';
import type {SharedSegmentedRelayProgress} from '../segmented_relay/contract.js';
import type {SegmentedRetainedKind,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {freezeGeneration} from '../generation_source/identity.js';
import {SharedRelayError,transportVersion} from '../relay/validation.js';
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedContinuedDeliveryOptions,SharedContinuedDeliveryRecovery} from './contract.js';

const fail=()=>new SharedRelayError('continued_delivery_binding');
const format='breditor/shared-continued-delivery-head';
const maxHeadBytes=416*1024*1024;
interface State {readonly relay:SharedSegmentedRelayProgress;readonly retained:SegmentedRetainedRecords}

/** Relay and retained records commit in the same transaction as both native
 * lanes. The continued local head and all older storage families stay closed. */
export class ContinuedDeliveryCompanion {
 readonly #identity;
 readonly binding;
 readonly retainedBinding;
 #current:State;
 #saved:State;
 readonly store={
  names:['continued_delivery_files','continued_delivery_heads'] as const,
  readHead:(head:string)=>this.#decode(head).source,
  join:continuedPairStore.join,
  makeCut:continuedPairStore.makeCut,
  wrapped:true,
 };
 constructor(options:SharedContinuedDeliveryOptions,initial?:SharedContinuedDeliveryRecovery){
  const history=this.#identity=canonicalContinuedPairIdentity({
   native:options.native,documentHistory:options.documentHistory,reviewHistory:options.reviewHistory,
   review:{actor:options.review.actor,principal:options.review.principal},
  });
  const binding=relayBinding(options.binding),{document,review}=binding;
  if(!review||document.room!==history.native.room||document.writer!==history.native.writer||
     document.principal!==history.review.principal||review.actor!==history.review.actor||
     review.reviewEditing==='read_only'&&options.review.access!=='read_only'||
     (history.native.selectionEditing==='document-v1'||history.native.reviewedHistory!==null)&&transportVersion(document.writerTransport)!==2)throw fail();
  this.binding=freezeGeneration({document,review});
  this.retainedBinding=freezeGeneration(deliveryRetainedBinding(options.retained,binding,history.native.reviewedHistory));
  if(initial){
   closed(initial,'format,formatVersion,relay,retained,retainedBinding,source');
   if(initial.format!=='breditor/shared-continued-delivery-recovery'||initial.formatVersion!==1||
      JSON.stringify(initial.retainedBinding)!==JSON.stringify(this.retainedBinding))throw fail();
  }
  this.#current=this.#state(initial??{relay:initialRelayProgress(binding),retained:emptyDeliveryRetainedRecords(this.retainedBinding)});
  this.#saved=this.#current;
 }
 #state(value:{readonly relay:unknown;readonly retained:unknown}):State{
  return {relay:relayProgress(value.relay,this.binding),retained:deliveryRetainedRecords(value.retained,this.retainedBinding)};
 }
 #encode(source:ContinuedPairHead,state:State):string{
  return JSON.stringify({format,formatVersion:1,source,relay:state.relay,retainedBinding:this.retainedBinding,retained:state.retained});
 }
 #decode(text:string){
  if(typeof text!=='string'||text.length>maxHeadBytes||new TextEncoder().encode(text).length>maxHeadBytes)throw fail();
  const input=closed(JSON.parse(text),'format,formatVersion,relay,retained,retainedBinding,source');
  const source=continuedPairStore.readHead(JSON.stringify(input['source']));
  const state=this.#state({relay:input['relay'],retained:input['retained']});
  if(JSON.stringify(source.identity)!==JSON.stringify(this.#identity)||this.#encode(source,state)!==text)throw fail();
  return {source,state};
 }
 load(head:string):void{this.#saved=this.#current=this.#decode(head).state;}
 recovery(source:SharedContinuedPairRecovery,state=this.#current):SharedContinuedDeliveryRecovery{
  return {format:'breditor/shared-continued-delivery-recovery',formatVersion:1,source,
   relay:structuredClone(state.relay),retainedBinding:structuredClone(this.retainedBinding),retained:structuredClone(state.retained)};
 }
 readRecovery(source:SharedContinuedPairRecovery,head:string):SharedContinuedDeliveryRecovery{
  return this.recovery(source,this.#decode(head).state);
 }
 capture():State{return this.#current;}
 durable():State{return this.#saved;}
 wrap(cut:IndependentHistoryCut,state:State):IndependentHistoryCut{
  const source=continuedPairStore.readHead(cut.head);
  if(JSON.stringify(source.identity)!==JSON.stringify(this.#identity))throw fail();
  const head=this.#encode(source,state);
  return {...cut,head};
 }
 acknowledge(state:State):void{this.#saved=state;}
 admit<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,state=this.#current):void{
  const local=core.localReviewClock();
  if(local.actor!==this.binding.review.actor||this.binding.review.reviewEditing==='read_only'&&local.through!=='0')throw fail();
  admitNativeDeliveryProgress(core,state.relay);
  admitDeliveryRetainedRecords(core,this.retainedBinding,state.retained);
 }
 propose<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,input:SharedSegmentedRelayProgress):void{
  const relay=relayProgress(input,this.binding);
  forwardProgress(this.#current.relay,relay);
  this.admit(core,{...this.#current,relay});
  if(JSON.stringify(this.#current.relay)!==JSON.stringify(relay))this.#current={...this.#current,relay};
 }
 proposeRecord<P extends SharedSelectionPolicy,K extends SegmentedRetainedKind>(core:SharedRichEditor<P>,kind:K,record:NonNullable<SegmentedRetainedRecords[K]>):void{
  const retained=deliveryRetainedRecords({...this.#current.retained,[kind]:record},this.retainedBinding);
  this.admit(core,{...this.#current,retained});
  if(JSON.stringify(this.#current.retained[kind])!==JSON.stringify(retained[kind]))this.#current={...this.#current,retained};
 }
}
