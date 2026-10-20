/** One atomic cut retains source, relay receipts and exact proposal/revision/version intents. */
import {SegmentedRelayCompanion} from "./companion.js";
import {closed} from "./validation.js";
import {SharedRelayError} from "../relay/validation.js";
import {queueIdentity} from "../suggestions/validation.js";
import {versionIdentity} from "../versions/validation.js";
import {revisionsBinding} from "../suggestion_revisions/transport.js";
import {checkQueueRecord} from "../suggestions/database.js";
import {checkRevisionRecord} from "../suggestion_revisions/database.js";
import {checkCatalogRecord} from "../versions/database.js";
import {checkSuggestionSourcePolicy,admitSuggestionRecord} from "../suggestions/record_admission.js";
import {admitRevisionRecord} from "../suggestion_revisions/record_admission.js";
import {admitVersionRecord} from "../versions/record_admission.js";
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
  super(options,initial?.relay);const b=options.retained;closed(b,"revisions,suggestions,versions");
  if(b.suggestions!==null)closed(b.suggestions,"identity,ownedHistory");if(b.revisions!==null)closed(b.revisions,"binding");
  if(b.suggestions!==null)closed(b.suggestions.identity,"binding,documentWriter,effectWriter,endpoint,principal,room,writerTransport");
  if(b.versions!==null)closed(b.versions,b.versions.writerTransport===undefined?"binding,documentWriter,endpoint,principal,room":"binding,documentWriter,endpoint,principal,room,writerTransport");
  const suggestions=b.suggestions===null?null:{identity:queueIdentity(b.suggestions.identity),ownedHistory:b.suggestions.ownedHistory};
  if(suggestions&&suggestions.ownedHistory!==null&&suggestions.ownedHistory!=="reviewed-v1")throw new SharedRelayError("segmented_retained_binding");
  const revisions=b.revisions===null?null:revisionsBinding(b.revisions),versions=b.versions===null?null:versionIdentity(b.versions),d=this.binding.document;
  for(const identity of [suggestions?.identity,versions])if(identity&&(identity.endpoint!==d.endpoint||identity.principal!==d.principal||identity.room!==d.room||identity.documentWriter!==d.writer||identity.writerTransport!==d.writerTransport))throw new SharedRelayError("segmented_retained_binding");
  if(revisions&&!suggestions||suggestions&&(suggestions.ownedHistory==="reviewed-v1")!==!!options.reviewedHistory||suggestions?.ownedHistory==="reviewed-v1"&&(options.reviewedHistory?.binding!==suggestions.identity.binding||options.reviewedHistory.effectWriter!==suggestions.identity.effectWriter))throw new SharedRelayError("segmented_retained_binding");
  this.retainedBinding={suggestions,revisions,versions};
  if(initial&&JSON.stringify(initial.retainedBinding)!==JSON.stringify(this.retainedBinding))throw new SharedRelayError("segmented_retained_binding");
  const empty:SegmentedRetainedRecords={suggestions:suggestions?{format:suggestions.ownedHistory?"breditor/shared-owned-suggestion-queue":"breditor/shared-suggestion-queue",formatVersion:1,identity:suggestions.identity,retained:[]}:null,revisions:revisions?{format:"breditor/shared-suggestion-revisions",formatVersion:1,identity:suggestions!.identity,binding:revisions.binding,retained:[]}:null,versions:versions?{format:"breditor/shared-version-catalog-cache",formatVersion:1,identity:versions,catalog:null,packets:[]}:null};
  this.#records=this.#validate(initial?.retained??empty);this.#durableRecords=structuredClone(this.#records);
 }
 #validate(input:unknown):SegmentedRetainedRecords{
  const r=closed(input,"revisions,suggestions,versions"),b=this.retainedBinding;
  for(const kind of ["suggestions","revisions","versions"] as const)if((r[kind]!==null)!==(b[kind]!==null))throw new SharedRelayError("segmented_retained_binding");
  return {suggestions:b.suggestions?checkQueueRecord(r["suggestions"],b.suggestions.identity,b.suggestions.ownedHistory??undefined):null,revisions:b.revisions?checkRevisionRecord(r["revisions"],b.suggestions!.identity,b.revisions.binding):null,versions:b.versions?checkCatalogRecord(r["versions"],b.versions):null};
 }
 #admit(core:SharedRichEditor<SharedSelectionPolicy>,r:SegmentedRetainedRecords):void{
  if(r.suggestions){checkSuggestionSourcePolicy(core,r.suggestions.identity,this.retainedBinding.suggestions!.ownedHistory??undefined);admitSuggestionRecord(core,r.suggestions,this.retainedBinding.suggestions!.ownedHistory??undefined);}
  if(r.revisions){if(!core.supportsSuggestionRevisions())throw new SharedRelayError("suggestion_revisions_unavailable");admitRevisionRecord(core,r.revisions);}
  if(r.versions){if(!core.supportsVersionSourceProofs())throw new SharedRelayError("version_source_unavailable");admitVersionRecord(core,r.versions);}
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
 proposeRecord<K extends SegmentedRetainedKind>(kind:K,record:NonNullable<SegmentedRetainedRecords[K]>):void{if(!this.#owner)throw new SharedRelayError("segmented_relay_source");const next=this.#validate({...this.#records,[kind]:record});this.#admit(this.#owner,next);if(JSON.stringify(next[kind])!==JSON.stringify(this.#records[kind]))this.sourceChanged();this.#records=next;}
}
