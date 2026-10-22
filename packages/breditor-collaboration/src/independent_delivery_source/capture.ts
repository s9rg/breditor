/** Complete real native/outbox source and native/packet raster references. Never saves, uploads or authenticates. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryIdentity} from '../independent_delivery/contract.js';
import type {SharedPacketAssetIdentity,SharedPacketAssetReferencesRead} from '../packet_asset_references.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import {readIndependentDeliveryIdentity} from '../independent_delivery/identity.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {registerCapturedNativeHistory,releaseCapturedNativeHistory} from '../native_history_read/registry.js';
import {freezeGeneration,generationFields} from '../generation_source/identity.js';
import {independentDeliverySource,independentDeliverySourceFailure as fail} from './admission.js';
import {independentDeliveryRecords,independentDeliveryRecovery} from './records.js';
import type {SharedIndependentDeliverySourceRecord,SharedIndependentDeliverySourceSelection} from './contract.js';
export interface SharedIndependentDeliverySourceMetadata{
 readonly format:'breditor/shared-independent-delivery-source-capture';readonly formatVersion:1;
 readonly identity:SharedIndependentDeliveryIdentity;readonly document:string;readonly revision:string;
 readonly packets:readonly SharedPacketAssetIdentity[];
 readonly outcome:Readonly<{kind:'ready';references:readonly RichRetainedAssetReference[]}>|Readonly<{kind:'pending';pending:readonly SharedAssetCapturePending[]}>;
}
const key=Object.freeze({}),states=new WeakMap<SharedIndependentDeliverySourceCapture,{records:readonly SharedIndependentDeliverySourceRecord[];check:()=>void}>();
function checkDeliverySource(source:SharedIndependentDeliverySourceCapture):void{const state=states.get(source);if(!state)throw fail('independent_delivery_source_closed');state.check();if(states.get(source)!==state)throw fail('independent_delivery_source_closed');}
export class SharedIndependentDeliverySourceCapture{
 readonly #metadata:SharedIndependentDeliverySourceMetadata;
 private constructor(token:object,metadata:SharedIndependentDeliverySourceMetadata,state:{records:readonly SharedIndependentDeliverySourceRecord[];check:()=>void}){if(token!==key)throw fail();this.#metadata=metadata;states.set(this,state);Object.freeze(this);}
 metadata():SharedIndependentDeliverySourceMetadata{return this.#metadata;}
 records():readonly SharedIndependentDeliverySourceRecord[]{const state=states.get(this);if(!state)throw fail('independent_delivery_source_closed');return state.records;}
 check():void{checkDeliverySource(this);}
 dispose():void{states.delete(this);releaseCapturedNativeHistory(this);}
 static capture<P extends SharedSelectionPolicy>(input:SharedIndependentDeliverySourceSelection<P>):SharedIndependentDeliverySourceCapture{
  if(!generationFields(input,'session'))throw fail();const port=independentDeliverySource(input.session),identity=readIndependentDeliveryIdentity(port.identity),stamp=port.stamp(),records=independentDeliveryRecords(port.read()),recovery=independentDeliveryRecovery(identity,records),core=port.core,base=native.retainedAssetReferences.call(core),revision=base.revision;
  if(base.document!==identity.history.native.room)throw fail();const references=new Map<string,RichRetainedAssetReference>(),packets:SharedPacketAssetIdentity[]=[],seen=new Set<string>(),pending:SharedAssetCapturePending[]=[];
  const add=(rows:readonly RichRetainedAssetReference[])=>{for(const row of rows){references.set(JSON.stringify([row.asset,row.generation]),{asset:row.asset,generation:row.generation});if(references.size>100000)throw fail('independent_delivery_source_budget');}};add(base.references);
  const consume=(id:string,read:()=>SharedPacketAssetReferencesRead)=>{if(seen.has(id))return;seen.add(id);if(seen.size>1024)throw fail('independent_delivery_source_budget');const value=read();native.checkPacketAssetReferences.call(core,value,revision);packets.push(value.packet);if(value.outcome.kind==='ready')add(value.outcome.references);else pending.push({kind:'source',packet:value.packet,missing:value.outcome.missing});};
  const version=(packet:string)=>consume('version:'+packet,()=>native.versionAssetReferences.call(core,packet,revision));for(const packet of recovery.source.versions)version(packet);
  for(const row of recovery.retained.suggestions?.retained??[])consume('suggestion:'+row.packet,()=>native.suggestionAssetReferences.call(core,row.packet,revision));
  for(const row of recovery.retained.revisions?.retained??[])consume(JSON.stringify(['revision',row.previousPacket,row.packet]),()=>native.suggestionRevisionAssetReferences.call(core,row.previousPacket,row.packet,revision));
  const cached=new Set<string>();for(const row of recovery.retained.versions?.packets??[]){version(row.packet);cached.add(native.readVersion.call(core,row.packet).id);}for(const row of recovery.retained.versions?.catalog?.entries??[])if(!cached.has(row.version.id))pending.push({kind:'uncached_version',id:row.version.id});
  native.checkRetainedAssetReferences.call(core,base,revision);const check=()=>{port.check();const now=port.stamp();if(now.length!==stamp.length||now.some((value,index)=>value!==stamp[index]))throw fail('independent_delivery_source_changed');};check();
  const sorted=[...references.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),metadata=freezeGeneration({format:'breditor/shared-independent-delivery-source-capture' as const,formatVersion:1 as const,identity,document:base.document,revision,packets,outcome:pending.length?{kind:'pending' as const,pending}:{kind:'ready' as const,references:sorted}}),source=new SharedIndependentDeliverySourceCapture(key,metadata,{records,check});
  registerCapturedNativeHistory(source,core,{document:{kind:identity.history.documentHistory,checkpoint:records[0]!.json},review:{kind:identity.history.reviewHistory,checkpoint:records[1]!.json}},()=>checkDeliverySource(source));return source;
 }
}
export const captureSharedIndependentDeliverySource=<P extends SharedSelectionPolicy>(input:SharedIndependentDeliverySourceSelection<P>)=>SharedIndependentDeliverySourceCapture.capture(input);
const metadataRead=SharedIndependentDeliverySourceCapture.prototype.metadata,recordsRead=SharedIndependentDeliverySourceCapture.prototype.records,checkRead=SharedIndependentDeliverySourceCapture.prototype.check;
/** Canonical borrowed methods and genuine private state. DTOs and public overrides are not source proof. */
export function independentDeliverySourceSnapshot(source:SharedIndependentDeliverySourceCapture){const check=()=>checkRead.call(source);check();return{metadata:metadataRead.call(source),records:recordsRead.call(source),check};}
