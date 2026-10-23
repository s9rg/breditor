/** Data-only capture encoding. Native/asset continuity and fresh authority are
 * verified by the actual capture pipeline; this serializer issues no owner. */
import type {SharedAssetByteBinding,SharedAssetBytePayload} from '../asset_bytes/types.js';
import type {NativeInputCutIntent,NativeInputJournalIdentity} from '../native_input_operation/journal_contract.js';
import type {LocalOperationBackupSelection} from '../independent_local_operation/portable_contract.js';
import type {SharedIndependentHistoryRecovery,IndependentHistoryCut} from '../independent_history/contract.js';
import {MAX_INDEPENDENT_HISTORY_HEAD_BYTES} from '../independent_history/contract.js';
import {independentRecords,independentRecordLimit} from '../independent_source/records.js';
import {assetBytesDigest,assetBytesUtf8} from '../asset_bytes/format.js';
import {copyOperationCut} from '../independent_operation/cut_codec.js';
import {MAX_FLAT_LOCAL_STATE_BYTES,MAX_FLAT_LOCAL_PAYLOAD_BYTES} from './limits.js';
import {flatLocalFailure as fail} from './failure.js';
export interface FlatLocalPayloadReference{readonly bytes:number;readonly sha256:string}
export interface FlatLocalCaptureData{readonly operation:NativeInputJournalIdentity;readonly selection:LocalOperationBackupSelection;readonly intent:NativeInputCutIntent;readonly observed:string|null;readonly current:IndependentHistoryCut|null;readonly pending:IndependentHistoryCut|null;readonly live:SharedIndependentHistoryRecovery;readonly uploads:Blob;readonly bindings:readonly SharedAssetByteBinding[];readonly assets:readonly SharedAssetBytePayload[];readonly assetBytes:number;readonly payloads:ReadonlyMap<string,Blob>}
export async function encodeFlatLocalCaptureState(input:FlatLocalCaptureData,providedCheck:()=>void):Promise<{state:Blob;extras:readonly Blob[]}>{
 const check=()=>{if(typeof providedCheck!=='function'||providedCheck()!==undefined)throw fail('flat_local_capture_policy');};
 const extras:Blob[]=[],payload=async(blob:Blob):Promise<FlatLocalPayloadReference>=>{check();if(!(blob instanceof Blob)||blob.size<1||blob.size>MAX_FLAT_LOCAL_PAYLOAD_BYTES)throw fail('flat_local_capture_budget');const bytes=await blob.arrayBuffer();check();const sha256=await assetBytesDigest(new Uint8Array(bytes));check();extras.push(blob);return{bytes:blob.size,sha256};},text=(value:string,max:number)=>new Blob([assetBytesUtf8(value,max)]);
 const cut=async(value:IndependentHistoryCut|null)=>{if(value===null)return null;const c=copyOperationCut(value),head=await payload(text(c.head,MAX_INDEPENDENT_HISTORY_HEAD_BYTES+2048)),files=[];for(const f of c.files)files.push({lane:f.lane,generation:f.generation,kind:f.kind,sha256:f.sha256,payload:await payload(text(f.json,16*1024*1024))});return{head,files};};
 const current=await cut(input.current),pending=await cut(input.pending),live=[];for(const r of independentRecords(input.live))live.push({kind:r.kind,index:r.index,payload:await payload(text(r.json,independentRecordLimit(r.kind,input.selection.original.identity.source)))});
 const uploads=await payload(input.uploads),assets=[];for(const asset of input.assets){const file=input.payloads.get(asset.contentAsset);if(!file||file.size!==asset.bytes||file.type!==asset.mime)throw fail('flat_local_capture_assets');assets.push({...asset,payload:await payload(file)});}
 check();const value={format:'breditor/shared-flat-local-state',formatVersion:1,operation:input.operation,selection:input.selection,intent:input.intent,observed:input.observed,current,pending,live,uploads,bindings:input.bindings,assets,assetBytes:input.assetBytes},state=text(JSON.stringify(value),MAX_FLAT_LOCAL_STATE_BYTES);check();return{state,extras};
}
