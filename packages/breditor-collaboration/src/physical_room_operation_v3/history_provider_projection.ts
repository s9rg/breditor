/** SDK-private common whole-history/upload borrow. Only family-specific brand
 * checks select the port; data reports are never supplied as authority. */
import {RichAssetArchive,checkRichAssetLimits,type AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import type {PhysicalOperationV3Custody} from './operation.js';
import type {PhysicalOperationV3Participant} from './contract.js';
import type {PhysicalOperationV3HistoryReadOptions,PhysicalOperationV3HistoryRead} from './history_read_contract.js';
import type {PhysicalHistoryUploadPin} from './history_assets_contract.js';
import {projectPhysicalOperationV3History} from './history_read.js';
import {physicalOperationV3Failure as fail} from './policy.js';
interface AssetInfo {readonly asset:string;readonly mime:'image/png'|'image/jpeg'|'image/webp';readonly bytes:number;readonly width:number;readonly height:number}
export interface HistoryProviderRead {readonly assets:readonly AssetInfo[];readonly missing:readonly unknown[]}
export interface HistoryProviderPort<R extends HistoryProviderRead> {
 check(signal?:AbortSignal):Promise<void>;
 checkAssets(input:Readonly<{references:readonly Readonly<{asset:string;generation:string}>[];uploads:readonly string[]}>,signal?:AbortSignal):Promise<R>;
}
const read=RichAssetArchive.read,entries=RichAssetArchive.prototype.entries,dispose=RichAssetArchive.prototype.dispose;
function limits(input:PhysicalOperationV3Participant):Readonly<AssetLimits>{return checkRichAssetLimits(input.family==='original'||input.family==='generation'?input.recovery.limits:input.family==='independent-local'||input.family==='independent-delivery'?input.options.recovery.limits:input.options.limits);}
const info=(row:AssetInfo)=>JSON.stringify([row.asset,row.mime,row.bytes,row.width,row.height]);
/** Both native control families use the same actual seven-family reservation,
 * final complete rereads and cleanup acknowledgement. No authority is widened. */
export function projectHistoryProviderAssets<P extends SharedSelectionPolicy,R extends HistoryProviderRead,T>(s:PhysicalOperationV3Custody,held:()=>void,cleanup:RecoveryCleanupScope,port:HistoryProviderPort<R>,input:PhysicalOperationV3HistoryReadOptions<P>,project:(history:PhysicalOperationV3HistoryRead,pins:readonly PhysicalHistoryUploadPin[],provider:R|null)=>T):Promise<T>{
 const expected=s.held.state.metadata;
 const ids=new Set(s.children.map(child=>child.selected.target.id)),completeSelection=expected.participants.every(row=>ids.has(row.id));
 return projectPhysicalOperationV3History(s,held,input,{cleanup,visit:async scope=>{
  const pins:PhysicalHistoryUploadPin[]=[],content=new Map<string,AssetInfo>();
  for(const row of scope.uploads){const child=s.children.find(child=>child.selected.target.id===row.id),database=child?.selected.target.namespaces.find(ns=>ns.role==='uploads')?.database;if(!child||child.selected.target.family!==row.family||!database)throw fail('physical_operation_v3_diverged');
   const archive=await read.call(RichAssetArchive,row.file,{limits:limits(child.selected.input),...(scope.signal?{signal:scope.signal}:{})});
   try{scope.check();const admitted=entries.call(archive);for(const value of admitted){const item:AssetInfo={asset:value.asset,mime:value.mime,bytes:value.bytes,width:value.width,height:value.height},previous=content.get(item.asset);if(previous&&info(previous)!==info(item))throw fail('physical_operation_v3_diverged');content.set(item.asset,item);}pins.push({id:row.id,family:row.family,database,bytes:row.file.size,sha256:await scope.digest(row.file),entries:admitted});scope.check();}finally{dispose.call(archive);}
  }
  // Pending packets or retained unselected copies prevent a complete request.
  // Still reauthenticate the genuine current native host; never return a
  // checked subset that hides the missing participant or packet dependencies.
  if(scope.history.kind!=='ready'||!completeSelection){await port.check(scope.signal);scope.check();return{pins,provider:null};}
  const provider=await port.checkAssets({references:scope.history.references,uploads:[...content.keys()].sort()},scope.signal);scope.check();
  for(const actual of provider.assets){const local=content.get(actual.asset);if(local&&info(local)!==info(actual))throw fail('physical_operation_v3_diverged');}
  return{pins,provider};

 },project:(history,value)=>project(history,value.pins,value.provider)}) as Promise<T>;
}
