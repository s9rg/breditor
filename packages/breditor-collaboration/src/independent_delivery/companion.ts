/** Exact two-lane native cut and delivery state, committed through one actual session transaction. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryHead,IndependentHistoryIdentity} from '../independent_history/contract.js';
import type {IndependentHistoryCompanion} from '../independent_history/driver.js';
import {readIndependentHistoryHead} from '../independent_history/cut.js';
import {independentOptionsIdentity} from '../independent_history/identity.js';
import {SharedRelayError,transportVersion} from '../relay/validation.js';
import {closed,relayBinding,relayProgress,initialRelayProgress,forwardProgress} from '../segmented_relay/validation.js';
import type {SharedSegmentedRelayProgress} from '../segmented_relay/contract.js';
import type {SharedSegmentedRetainedBinding,SegmentedRetainedKind,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {deliveryRetainedBinding,deliveryRetainedRecords,emptyDeliveryRetainedRecords,admitDeliveryRetainedRecords} from '../delivery_state/retained.js';
import {admitNativeDeliveryProgress} from '../delivery_state/native_progress.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {MAX_INDEPENDENT_DELIVERY_HEAD_BYTES,type SharedIndependentDeliveryOptions,type SharedIndependentDeliveryBinding,type SharedIndependentDeliveryRecovery} from './contract.js';

export class IndependentDeliveryCompanion implements IndependentHistoryCompanion {
 readonly binding:SharedIndependentDeliveryBinding;readonly retainedBinding:SharedSegmentedRetainedBinding;
 readonly #identity:IndependentHistoryIdentity;
 #current:SharedSegmentedRelayProgress;#durable:SharedSegmentedRelayProgress;
 #records:SegmentedRetainedRecords;#durableRecords:SegmentedRetainedRecords;
 #core:SharedRichEditor<SharedSelectionPolicy>|undefined;#stamp:object=Object.freeze({});#retired=false;#retireHook:(()=>void)|undefined;
 constructor(options:SharedIndependentDeliveryOptions,initial?:Pick<SharedIndependentDeliveryRecovery,'relay'|'retainedBinding'|'retained'>){
  this.#identity=independentOptionsIdentity(options);const binding=relayBinding(options.binding),d=binding.document,r=binding.review,id=this.#identity;
  if(!r||d.room!==id.native.room||d.writer!==id.native.writer||d.principal!==id.review.principal||r.actor!==id.review.actor||r.principal!==id.review.principal||r.reviewEditing==='read_only'&&options.review.access!=='read_only'||(id.native.selectionEditing==='document-v1'||id.native.reviewedHistory!==null)&&transportVersion(d.writerTransport)!==2)throw new SharedRelayError('independent_delivery_binding');
  this.binding=binding as SharedIndependentDeliveryBinding;this.retainedBinding=deliveryRetainedBinding(options.retained,binding,id.native.reviewedHistory);
  if(initial&&JSON.stringify(initial.retainedBinding)!==JSON.stringify(this.retainedBinding))throw new SharedRelayError('independent_delivery_binding');
  this.#current=initial?relayProgress(initial.relay,binding):initialRelayProgress(binding);this.#durable=structuredClone(this.#current);
  this.#records=deliveryRetainedRecords(initial?.retained??emptyDeliveryRetainedRecords(this.retainedBinding),this.retainedBinding);this.#durableRecords=structuredClone(this.#records);
 }
 #decode(input:string){
  if(typeof input!=='string'||new TextEncoder().encode(input).length>MAX_INDEPENDENT_DELIVERY_HEAD_BYTES)throw new SharedRelayError('independent_delivery_head');
  const value=closed(JSON.parse(input),'format,formatVersion,relay,retained,retainedBinding,source');
  if(value['format']!=='breditor/shared-independent-delivery-head'||value['formatVersion']!==1||JSON.stringify(value['retainedBinding'])!==JSON.stringify(this.retainedBinding))throw new SharedRelayError('independent_delivery_head');
  const source=readIndependentHistoryHead(JSON.stringify(value['source']));if(JSON.stringify(source.identity)!==JSON.stringify(this.#identity))throw new SharedRelayError('independent_delivery_binding');
  const relay=relayProgress(value['relay'],this.binding),retained=deliveryRetainedRecords(value['retained'],this.retainedBinding);
  if(JSON.stringify({format:'breditor/shared-independent-delivery-head',formatVersion:1,source,relay,retainedBinding:this.retainedBinding,retained})!==input)throw new SharedRelayError('independent_delivery_head');return{source,relay,retained};
 }
 readonly readHead=(input:string):IndependentHistoryHead=>this.#decode(input).source;
 load(input:string):void{const state=this.#decode(input);this.#current=state.relay;this.#durable=structuredClone(state.relay);this.#records=state.retained;this.#durableRecords=structuredClone(state.retained);this.#stamp=Object.freeze({});}
 capture():string{return JSON.stringify({relay:this.#current,retained:this.#records});}
 #admit(core:SharedRichEditor<SharedSelectionPolicy>,relay:SharedSegmentedRelayProgress,retained:SegmentedRetainedRecords):void{
  if((native.segmentedHistoryPolicy.call(core)??'original')!==this.#identity.documentHistory||native.reviewHistoryPolicy.call(core)!==this.#identity.reviewHistory)throw new SharedRelayError('independent_delivery_source');
  const local=core.localReviewClock();if(local.actor!==this.#identity.review.actor||this.binding.review.reviewEditing==='read_only'&&local.through!=='0')throw new SharedRelayError('independent_delivery_review_source');
  admitNativeDeliveryProgress(core,relay);admitDeliveryRetainedRecords(core,this.retainedBinding,retained);
 }
 admit(core:SharedRichEditor<SharedSelectionPolicy>):void{if(this.#core)throw new SharedRelayError('independent_delivery_reused');this.#admit(core,this.#current,this.#records);this.#core=core;}
 wrap(source:IndependentHistoryHead,capture:string):string{const value=closed(JSON.parse(capture),'relay,retained'),relay=relayProgress(value['relay'],this.binding),retained=deliveryRetainedRecords(value['retained'],this.retainedBinding),head=JSON.stringify({format:'breditor/shared-independent-delivery-head',formatVersion:1,source,relay,retainedBinding:this.retainedBinding,retained});this.#decode(head);return head;}
 acknowledged(capture:string):void{const value=closed(JSON.parse(capture),'relay,retained'),relay=relayProgress(value['relay'],this.binding),retained=deliveryRetainedRecords(value['retained'],this.retainedBinding);forwardProgress(this.#durable,relay);this.#durable=relay;this.#durableRecords=retained;}
 current():SharedSegmentedRelayProgress{return structuredClone(this.#current);}
 durable():SharedSegmentedRelayProgress{return structuredClone(this.#durable);}
 records():SegmentedRetainedRecords{return structuredClone(this.#records);}
 durableRecords():SegmentedRetainedRecords{return structuredClone(this.#durableRecords);}
 sourceStamp():object{return this.#stamp;}
 propose(input:unknown):void{const next=relayProgress(input,this.binding);forwardProgress(this.#current,next);if(!this.#core)throw new SharedRelayError('independent_delivery_source');this.#admit(this.#core,next,this.#records);if(JSON.stringify(next)!==JSON.stringify(this.#current))this.#stamp=Object.freeze({});this.#current=next;}
 proposeRecord<K extends SegmentedRetainedKind>(kind:K,input:NonNullable<SegmentedRetainedRecords[K]>):void{if(!this.#core)throw new SharedRelayError('independent_delivery_source');const next=deliveryRetainedRecords({...this.#records,[kind]:input},this.retainedBinding);this.#admit(this.#core,this.#current,next);if(JSON.stringify(next[kind])!==JSON.stringify(this.#records[kind]))this.#stamp=Object.freeze({});this.#records=next;}
 setRetireHook(hook:()=>void):void{if(this.#retired)throw new SharedRelayError('independent_delivery_retired');this.#retireHook=hook;}
 retire():void{if(this.#retired)return;this.#retired=true;this.#retireHook?.();}
 releaseRecords():void{this.#records={suggestions:null,revisions:null,versions:null};this.#durableRecords={suggestions:null,revisions:null,versions:null};this.#core=undefined;this.#stamp=Object.freeze({});}
}
