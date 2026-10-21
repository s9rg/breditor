/** Genuine generation custody plus complete native/packet image references. Never flushes or uploads. */
import type {RichRetainedAssetReference} from "@breditor/experimental-rich-content";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedAssetCapturePending} from "../asset_references_capture.js";
import type {SharedPacketAssetIdentity,SharedPacketAssetReferencesRead} from "../packet_asset_references.js";
import type {SharedSegmentedRetainedRecovery} from "../segmented_relay/retained_contract.js";
import {generationSource} from "./admission.js";
import {generationIdentity,generationFields,freezeGeneration,SharedGenerationSourceError,sourceFailure} from "./identity.js";
import {checkGenerationRecords} from "./validate_records.js";
import {generationNativeRead} from "./native_read.js";
import {sourceCoreMethods as nativeCore} from '../source_native_read.js';
import {registerCapturedNativeHistory,releaseCapturedNativeHistory} from '../native_history_read/registry.js';
import type {SharedCapturedRecoveryRead} from "../asset_references_capture.js";
import type {SharedGenerationSourceIdentity,SharedGenerationSourceRecord,SharedGenerationSourceSelection,GenerationSourcePort} from "./contract.js";
export interface SharedGenerationSourceMetadata {
 readonly format:"breditor/shared-generation-asset-reference-capture";readonly formatVersion:1;
 readonly identity:SharedGenerationSourceIdentity;readonly document:string;readonly revision:string;
 readonly packets:readonly SharedPacketAssetIdentity[];
 readonly outcome:Readonly<{kind:"ready";references:readonly RichRetainedAssetReference[]}>|Readonly<{kind:"pending";pending:readonly SharedAssetCapturePending[]}>;
}
const key=Object.freeze({}),states=new WeakMap<SharedGenerationSourceCapture,{port:GenerationSourcePort;records:readonly SharedGenerationSourceRecord[];check:()=>void;native:SharedCapturedRecoveryRead}>();
const closed=()=>new SharedGenerationSourceError("generation_source_closed","The source capture is closed or was not created by this SDK");
function checkGenerationSource(source:SharedGenerationSourceCapture):void{const state=states.get(source);if(!state)throw closed();state.check();if(states.get(source)!==state)throw closed();}
export class SharedGenerationSourceCapture {
 readonly #metadata:SharedGenerationSourceMetadata;
 private constructor(token:object,metadata:SharedGenerationSourceMetadata,state:{port:GenerationSourcePort;records:readonly SharedGenerationSourceRecord[];check:()=>void;native:SharedCapturedRecoveryRead}){if(token!==key)throw closed();this.#metadata=metadata;states.set(this,state);Object.freeze(this);}
 metadata():SharedGenerationSourceMetadata{return this.#metadata;}
 records():readonly SharedGenerationSourceRecord[]{const s=states.get(this);if(!s)throw closed();return s.records;}
 check():void{checkGenerationSource(this);}
 dispose():void{states.delete(this);releaseCapturedNativeHistory(this);}
 static capture<P extends SharedSelectionPolicy>(input:SharedGenerationSourceSelection<P>):SharedGenerationSourceCapture{
  if(!generationFields(input,"kind,session"))throw sourceFailure();const port=generationSource(input.session),identity=generationIdentity(port.identity);if(input.kind!==identity.kind)throw sourceFailure();
  const stamp=port.stamp(),records=port.read(),{core}=port,admitted=checkGenerationRecords(identity,records),base=nativeCore.retainedAssetReferences.call(core),revision=base.revision;
  if(base.document!==identity.native.room)throw sourceFailure();const references=new Map<string,RichRetainedAssetReference>(),packets:SharedPacketAssetIdentity[]=[],seen=new Set<string>(),pending:SharedAssetCapturePending[]=[];
  const add=(rows:readonly RichRetainedAssetReference[])=>{for(const r of rows){references.set(JSON.stringify([r.asset,r.generation]),{asset:r.asset,generation:r.generation});if(references.size>100000)throw new SharedGenerationSourceError("generation_source_budget","Complete native/packet reference budget exceeded");}};add(base.references);
  const consume=(id:string,read:()=>SharedPacketAssetReferencesRead)=>{if(seen.has(id))return;seen.add(id);if(seen.size>1024)throw sourceFailure();const r=read();nativeCore.checkPacketAssetReferences.call(core,r,revision);packets.push(r.packet);if(r.outcome.kind==="ready")add(r.outcome.references);else pending.push({kind:"source",packet:r.packet,missing:r.outcome.missing});};
  const version=(packet:string)=>consume("version:"+packet,()=>nativeCore.versionAssetReferences.call(core,packet,revision));for(const packet of admitted.source.versions)version(packet);
  if(identity.kind==="retained"){
   const r=(admitted.recovery as SharedSegmentedRetainedRecovery).retained;
   for(const row of r.suggestions?.retained??[])consume("suggestion:"+row.packet,()=>nativeCore.suggestionAssetReferences.call(core,row.packet,revision));
   for(const row of r.revisions?.retained??[])consume(JSON.stringify(["revision",row.previousPacket,row.packet]),()=>nativeCore.suggestionRevisionAssetReferences.call(core,row.previousPacket,row.packet,revision));
   const cached=new Set<string>();for(const row of r.versions?.packets??[]){version(row.packet);cached.add(nativeCore.readVersion.call(core,row.packet).id);}for(const row of r.versions?.catalog?.entries??[])if(!cached.has(row.version.id))pending.push({kind:"uncached_version",id:row.version.id});
  }
  const native=generationNativeRead(core);
  // The genuine private session stamp remains the constant-work history guard. Do not
  // reserialize complete checkpoint strings on every inspection or widen old failure order.
  nativeCore.checkRetainedAssetReferences.call(core,base,revision);const check=()=>{port.check();const now=port.stamp();if(now.length!==stamp.length||now.some((v,i)=>v!==stamp[i]))throw new SharedGenerationSourceError("generation_source_changed","The complete generation source changed");};check();
  const sorted=[...references.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0);
  const metadata=freezeGeneration({format:"breditor/shared-generation-asset-reference-capture" as const,formatVersion:1 as const,identity,document:base.document,revision,packets,outcome:pending.length?{kind:"pending" as const,pending}:{kind:"ready" as const,references:sorted}});
  const source=new SharedGenerationSourceCapture(key,metadata,{port,records,check,native}),review=records.find(record=>record.kind==='review');
  registerCapturedNativeHistory(source,core,{document:{kind:'segmented-v1',checkpoint:records[0]!.json},review:review?{kind:'original',checkpoint:review.json}:null},()=>checkGenerationSource(source));return source;
 }
}
export const captureSharedGenerationSource=<P extends SharedSelectionPolicy>(input:SharedGenerationSourceSelection<P>):SharedGenerationSourceCapture=>SharedGenerationSourceCapture.capture(input);
/** Canonical methods and private state, never a user-supplied metadata/check lookalike. */
export function generationSourceSnapshot(source:SharedGenerationSourceCapture){const check=()=>SharedGenerationSourceCapture.prototype.check.call(source);check();return{metadata:SharedGenerationSourceCapture.prototype.metadata.call(source),records:SharedGenerationSourceCapture.prototype.records.call(source),check};}
/** Internal genuine-capture read port. Old bounded-journal capture remains unavailable
 * for generation owners; no flattening or conversion into its old file family occurs. */
export function capturedGenerationRecoveryRead(source:SharedGenerationSourceCapture):SharedCapturedRecoveryRead{const s=states.get(source);if(!s)throw closed();s.check();if(states.get(source)!==s)throw closed();return s.native;}
