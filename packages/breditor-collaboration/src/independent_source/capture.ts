/** Genuine two-lane history custody and native/version image references, without saves or uploads. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryIdentity} from '../independent_history/contract.js';
import type {SharedPacketAssetIdentity} from '../packet_asset_references.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import {canonicalIndependentHistoryIdentity} from '../independent_history/cut.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {registerCapturedNativeHistory,releaseCapturedNativeHistory} from '../native_history_read/registry.js';
import {freezeGeneration,generationFields} from '../generation_source/identity.js';
import {independentSource} from './admission.js';
import {independentFailure,independentRecords,independentRecovery} from './records.js';
import type {SharedIndependentSourceSelection,SharedIndependentSourceRecord} from './contract.js';
export interface SharedIndependentSourceMetadata {
 readonly format:'breditor/shared-independent-source-capture';readonly formatVersion:1;
 readonly identity:IndependentHistoryIdentity;readonly document:string;readonly revision:string;
 readonly packets:readonly SharedPacketAssetIdentity[];
 readonly outcome:Readonly<{kind:'ready';references:readonly RichRetainedAssetReference[]}>|Readonly<{kind:'pending';pending:readonly SharedAssetCapturePending[]}>;
}
const key=Object.freeze({}),states=new WeakMap<SharedIndependentSourceCapture,{records:readonly SharedIndependentSourceRecord[];check:()=>void}>();
function checkIndependentSource(source:SharedIndependentSourceCapture):void{const state=states.get(source);if(!state)throw independentFailure('independent_source_closed');state.check();if(states.get(source)!==state)throw independentFailure('independent_source_closed');}
export class SharedIndependentSourceCapture {
 readonly #metadata:SharedIndependentSourceMetadata;
 private constructor(token:object,metadata:SharedIndependentSourceMetadata,state:{records:readonly SharedIndependentSourceRecord[];check:()=>void}){if(token!==key)throw independentFailure();this.#metadata=metadata;states.set(this,state);Object.freeze(this);}
 metadata():SharedIndependentSourceMetadata{return this.#metadata;}
 records():readonly SharedIndependentSourceRecord[]{const state=states.get(this);if(!state)throw independentFailure('independent_source_closed');return state.records;}
 check():void{checkIndependentSource(this);}
 dispose():void{states.delete(this);releaseCapturedNativeHistory(this);}
 static capture<P extends SharedSelectionPolicy>(input:SharedIndependentSourceSelection<P>):SharedIndependentSourceCapture{
  if(!generationFields(input,'session'))throw independentFailure();const port=independentSource(input.session),identity=canonicalIndependentHistoryIdentity(port.identity),stamp=port.stamp(),records=independentRecords(port.read()),recovery=independentRecovery(identity,records),core=port.core;
  const base=native.retainedAssetReferences.call(core);if(base.document!==identity.native.room)throw independentFailure();const references=new Map<string,RichRetainedAssetReference>(),packets:SharedPacketAssetIdentity[]=[],pending:SharedAssetCapturePending[]=[];
  const add=(rows:readonly RichRetainedAssetReference[])=>{for(const row of rows){references.set(JSON.stringify([row.asset,row.generation]),{asset:row.asset,generation:row.generation});if(references.size>100000)throw independentFailure('independent_source_budget');}};add(base.references);
  for(const packet of recovery.versions){const read=native.versionAssetReferences.call(core,packet,base.revision);native.checkPacketAssetReferences.call(core,read,base.revision);packets.push(read.packet);if(read.outcome.kind==='ready')add(read.outcome.references);else pending.push({kind:'source',packet:read.packet,missing:read.outcome.missing});}
  native.checkRetainedAssetReferences.call(core,base,base.revision);
  const check=()=>{port.check();if(port.stamp()!==stamp)throw independentFailure('independent_source_changed');};check();
  const sorted=[...references.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0);
  const source=new SharedIndependentSourceCapture(key,freezeGeneration({format:'breditor/shared-independent-source-capture' as const,formatVersion:1 as const,identity,document:base.document,revision:base.revision,packets,outcome:pending.length?{kind:'pending' as const,pending}:{kind:'ready' as const,references:sorted}}),{records,check});
  registerCapturedNativeHistory(source,core,{document:{kind:identity.documentHistory,checkpoint:records[0]!.json},review:{kind:identity.reviewHistory,checkpoint:records[1]!.json}},()=>checkIndependentSource(source));return source;
 }
}
export const captureSharedIndependentSource=<P extends SharedSelectionPolicy>(input:SharedIndependentSourceSelection<P>)=>SharedIndependentSourceCapture.capture(input);
const metadataRead=SharedIndependentSourceCapture.prototype.metadata,recordsRead=SharedIndependentSourceCapture.prototype.records,checkRead=SharedIndependentSourceCapture.prototype.check;
/** Internal canonical borrowed methods. DTOs and caller-provided check methods are not source proof. */
export function independentSourceSnapshot(source:SharedIndependentSourceCapture){const check=()=>checkRead.call(source);check();return{metadata:metadataRead.call(source),records:recordsRead.call(source),check};}
