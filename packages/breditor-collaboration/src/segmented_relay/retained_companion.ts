/** One atomic cut retains source, relay receipts and exact proposal/revision/version intents. */
import {SegmentedRelayCompanion} from "./companion.js";
import {closed} from "./validation.js";
import {SharedRelayError} from "../relay/validation.js";
import {checkManagedCore} from "../managed_custody.js";
import {deliveryRetainedBinding,deliveryRetainedRecords,emptyDeliveryRetainedRecords,admitDeliveryRetainedRecords} from '../delivery_state/retained.js';
import type {SegmentedHead} from "../persistence/segmented_contract.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSegmentedRelayProgress} from "./contract.js";
import {MAX_SEGMENTED_RETAINED_HEAD_BYTES,type SharedSegmentedRetainedSessionOptions,type SharedSegmentedRetainedBinding,type SegmentedRetainedRecords,type SegmentedRetainedKind} from "./retained_contract.js";

export class SegmentedRetainedCompanion extends SegmentedRelayCompanion {
 readonly retainedBinding:SharedSegmentedRetainedBinding;
 #records:SegmentedRetainedRecords;#durableRecords:SegmentedRetainedRecords;
 #owner:SharedRichEditor<SharedSelectionPolicy>|undefined;
 constructor(options:SharedSegmentedRetainedSessionOptions,initial?:{relay:SharedSegmentedRelayProgress;retainedBinding:SharedSegmentedRetainedBinding;retained:SegmentedRetainedRecords}){
  super(options,initial?.relay);this.retainedBinding=deliveryRetainedBinding(options.retained,this.binding,options.reviewedHistory);
  if(initial&&JSON.stringify(initial.retainedBinding)!==JSON.stringify(this.retainedBinding))throw new SharedRelayError("segmented_retained_binding");
  const empty=emptyDeliveryRetainedRecords(this.retainedBinding);
  this.#records=this.#validate(initial?.retained??empty);this.#durableRecords=structuredClone(this.#records);
 }
 #validate(input:unknown):SegmentedRetainedRecords{
  return deliveryRetainedRecords(input,this.retainedBinding);
 }
 #admit(core:SharedRichEditor<SharedSelectionPolicy>,r:SegmentedRetainedRecords):void{
  admitDeliveryRetainedRecords(core,this.retainedBinding,r);
 }
 #decodeHead(input:string){if(typeof input!=="string"||new TextEncoder().encode(input).length>MAX_SEGMENTED_RETAINED_HEAD_BYTES)throw new SharedRelayError("segmented_retained_head");const h=closed(JSON.parse(input),"format,formatVersion,retained,retainedBinding,source");if(h["format"]!=="breditor/shared-relay-generation-retained-head"||h["formatVersion"]!==1||JSON.stringify(h)!==input||JSON.stringify(h["retainedBinding"])!==JSON.stringify(this.retainedBinding))throw new SharedRelayError("segmented_retained_head");return {source:JSON.stringify(h["source"]),retained:this.#validate(h["retained"])};}
 override readonly readHead=(input:string):SegmentedHead=>{const h=this.#decodeHead(input);return super.decodeRelaySource(h.source);};
 override load(input:string):void{const h=this.#decodeHead(input);super.load(h.source);this.#records=h.retained;this.#durableRecords=structuredClone(h.retained);}
 override capture():string{return JSON.stringify({relay:JSON.parse(super.capture()),retained:this.#records});}
 override admit(core:SharedRichEditor<SharedSelectionPolicy>):void{super.admit(core);this.#admit(core,this.#records);this.#owner=core;}
 override wrap(source:SegmentedHead,capture:string):string{const c=closed(JSON.parse(capture),"relay,retained"),retained=this.#validate(c["retained"]),inner=super.wrap(source,JSON.stringify(c["relay"])),head=JSON.stringify({format:"breditor/shared-relay-generation-retained-head",formatVersion:1,source:JSON.parse(inner),retainedBinding:this.retainedBinding,retained});this.#decodeHead(head);return head;}
 override confirm(capture:string|null):void{if(capture===null)throw new SharedRelayError("segmented_relay_unsaved");const c=closed(JSON.parse(capture),"relay,retained"),retained=this.#validate(c["retained"]);super.confirm(JSON.stringify(c["relay"]));this.#durableRecords=retained;}
 records():SegmentedRetainedRecords{return structuredClone(this.#records);}
 durableRecords():SegmentedRetainedRecords{return structuredClone(this.#durableRecords);}
 releaseRecords():void{this.#records={suggestions:null,revisions:null,versions:null};this.#durableRecords={suggestions:null,revisions:null,versions:null};this.#owner=undefined;this.sourceChanged();}
 proposeRecord<K extends SegmentedRetainedKind>(kind:K,record:NonNullable<SegmentedRetainedRecords[K]>):void{if(!this.#owner)throw new SharedRelayError("segmented_relay_source");const next=this.#validate({...this.#records,[kind]:record});this.#admit(this.#owner,next);checkManagedCore(this.#owner);if(JSON.stringify(next[kind])!==JSON.stringify(this.#records[kind]))this.sourceChanged();this.#records=next;}
}
