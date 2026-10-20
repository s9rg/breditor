/** One closed relay head wraps the unchanged local generation head; both lanes commit atomically. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SegmentedHead} from "../persistence/segmented_contract.js";
import type {SegmentedSessionCompanion} from "../persistence/segmented_driver.js";
import {readSegmentedHead} from "../persistence/segmented_head.js";
import {SharedRelayError,transportVersion} from "../relay/validation.js";
import {MAX_SEGMENTED_RELAY_HEAD_BYTES,type SharedSegmentedRelaySessionOptions,type SharedSegmentedRelayProgress,type SharedSegmentedRelayBinding} from "./contract.js";
import {closed,relayBinding,relayProgress,initialRelayProgress,forwardProgress} from "./validation.js";
import {admitRelayProgress} from "./native_progress.js";

export class SegmentedRelayCompanion implements SegmentedSessionCompanion {
 readonly binding:SharedSegmentedRelayBinding;
 #current:SharedSegmentedRelayProgress;#durable:SharedSegmentedRelayProgress;
 #core:SharedRichEditor<SharedSelectionPolicy>|undefined;
 #retired=false;#retireHook:(()=>void)|undefined;
 constructor(options:SharedSegmentedRelaySessionOptions,initial?:unknown){
  this.binding=relayBinding(options.binding);const d=this.binding.document,r=this.binding.review;
  if(d.room!==options.room||d.writer!==options.writer||options.selectionEditing==="document-v1"&&transportVersion(d.writerTransport)!==2||options.reviewedHistory&&(transportVersion(d.writerTransport)!==2||options.reviewedHistory.principal!==d.principal)||!!r!==!!options.review||r&&(r.actor!==options.review?.actor||r.principal!==options.review.principal||r.reviewEditing==="read_only"&&options.review.access!=="read_only"))throw new SharedRelayError("segmented_relay_binding");
  this.#current=initial===undefined?initialRelayProgress(this.binding):relayProgress(initial,this.binding);this.#durable=structuredClone(this.#current);
 }
 #read(input:string):{source:SegmentedHead;relay:SharedSegmentedRelayProgress}{
  if(typeof input!=="string"||new TextEncoder().encode(input).length>MAX_SEGMENTED_RELAY_HEAD_BYTES)throw new SharedRelayError("segmented_relay_head");
  const h=closed(JSON.parse(input),"format,formatVersion,relay,source");
  if(h["format"]!=="breditor/shared-relay-generation-head"||h["formatVersion"]!==1||JSON.stringify(h)!==input)throw new SharedRelayError("segmented_relay_head");
  return {source:readSegmentedHead(JSON.stringify(h["source"])),relay:relayProgress(h["relay"],this.binding)};
 }
 readonly readHead=(input:string):SegmentedHead=>this.#read(input).source;
 load(input:string):void{const h=this.#read(input);this.#current=h.relay;this.#durable=structuredClone(h.relay);}
 capture():string{return JSON.stringify(this.#current);}
 admit(core:SharedRichEditor<SharedSelectionPolicy>):void{if(this.#core)throw new SharedRelayError("segmented_relay_source_reused");admitRelayProgress(core,this.#current);this.#core=core;}
 wrap(source:SegmentedHead,capture:string):string{
  const relay=relayProgress(JSON.parse(capture),this.binding),head=JSON.stringify({format:"breditor/shared-relay-generation-head",formatVersion:1,source,relay});this.#read(head);return head;
 }
 current():SharedSegmentedRelayProgress{return structuredClone(this.#current);}
 durable():SharedSegmentedRelayProgress{return structuredClone(this.#durable);}
 propose(input:unknown):void{const next=relayProgress(input,this.binding);forwardProgress(this.#current,next);if(!this.#core)throw new SharedRelayError("segmented_relay_source");admitRelayProgress(this.#core,next);this.#current=next;}
 confirm(encoded:string|null):void{if(encoded===null)throw new SharedRelayError("segmented_relay_unsaved");const saved=relayProgress(JSON.parse(encoded),this.binding);forwardProgress(this.#durable,saved);this.#durable=saved;}
 acknowledged(capture:string):void{this.confirm(capture);}
 setRetireHook(hook:()=>void):void{if(this.#retired)throw new SharedRelayError("segmented_relay_source_retired");this.#retireHook=hook;}
 retire():void{this.#retired=true;this.#retireHook?.();}
}
