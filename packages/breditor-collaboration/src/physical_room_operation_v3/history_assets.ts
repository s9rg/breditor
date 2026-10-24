/** Hold all genuine history records and actual whole-upload stores throughout
 * authenticated provider I/O. Re-admit actual native, persisted and upload cuts
 * after that I/O. A copied queue receipt is never current provider proof. */
import {RichAssetArchive,checkRichAssetLimits,type AssetLimits} from '@breditor/experimental-rich-content';
import {physicalRecoveryHostPort,type SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import type {SharedPhysicalRecoveryAssetInfo} from '../physical_recovery_control/asset_contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import type {PhysicalOperationV3Custody} from './operation.js';
import type {PhysicalOperationV3Participant} from './contract.js';
import type {PhysicalOperationV3HistoryReadOptions} from './history_read_contract.js';
import type {PhysicalOperationV3HistoryAssetsRead,PhysicalHistoryUploadPin} from './history_assets_contract.js';
import {projectPhysicalOperationV3History} from './history_read.js';
import {physicalOperationV3Failure as fail} from './policy.js';
const read=RichAssetArchive.read,entries=RichAssetArchive.prototype.entries,dispose=RichAssetArchive.prototype.dispose;
function limits(input:PhysicalOperationV3Participant):Readonly<AssetLimits>{return checkRichAssetLimits(input.family==='original'||input.family==='generation'?input.recovery.limits:input.family==='independent-local'||input.family==='independent-delivery'?input.options.recovery.limits:input.options.limits);}
const info=(row:SharedPhysicalRecoveryAssetInfo)=>JSON.stringify([row.asset,row.mime,row.bytes,row.width,row.height]);
export function readPhysicalOperationV3HistoryAssets<P extends SharedSelectionPolicy>(s:PhysicalOperationV3Custody,held:()=>void,cleanup:RecoveryCleanupScope,host:SharedPhysicalRoomRecoveryHost,input:PhysicalOperationV3HistoryReadOptions<P>):Promise<PhysicalOperationV3HistoryAssetsRead>{
 const port=physicalRecoveryHostPort(host),selected=port.selection.source,expected=s.held.state.metadata;
 if(JSON.stringify(selected.ancestor)!==JSON.stringify(expected.origin.identity)||JSON.stringify(selected.server)!==JSON.stringify(expected.current.server.identity)||JSON.stringify(selected.participants)!==JSON.stringify(expected.current.participants.identity))throw fail('physical_operation_v3_diverged');
 const ids=new Set(s.children.map(child=>child.selected.target.id)),completeSelection=expected.participants.every(row=>ids.has(row.id));
 return projectPhysicalOperationV3History(s,held,input,{cleanup,visit:async scope=>{
  const pins:PhysicalHistoryUploadPin[]=[],content=new Map<string,SharedPhysicalRecoveryAssetInfo>();
  for(const row of scope.uploads){const child=s.children.find(child=>child.selected.target.id===row.id),database=child?.selected.target.namespaces.find(ns=>ns.role==='uploads')?.database;if(!child||child.selected.target.family!==row.family||!database)throw fail('physical_operation_v3_diverged');
   const archive=await read.call(RichAssetArchive,row.file,{limits:limits(child.selected.input),...(scope.signal?{signal:scope.signal}:{})});
   try{scope.check();const admitted=entries.call(archive);for(const value of admitted){const item:SharedPhysicalRecoveryAssetInfo={asset:value.asset,mime:value.mime,bytes:value.bytes,width:value.width,height:value.height},previous=content.get(item.asset);if(previous&&info(previous)!==info(item))throw fail('physical_operation_v3_diverged');content.set(item.asset,item);}pins.push({id:row.id,family:row.family,database,bytes:row.file.size,sha256:await scope.digest(row.file),entries:admitted});scope.check();}finally{dispose.call(archive);}
  }
  // Pending packets or retained unselected copies prevent a complete request.
  // Still reauthenticate the genuine current native host; never return a
  // checked subset that hides the missing participant or packet dependencies.
  if(scope.history.kind!=='ready'||!completeSelection){await port.check(scope.signal);scope.check();return{pins,provider:null};}
  const provider=await port.checkAssets({references:scope.history.references,uploads:[...content.keys()].sort()},scope.signal);scope.check();
  for(const actual of provider.assets){const local=content.get(actual.asset);if(local&&info(local)!==info(actual))throw fail('physical_operation_v3_diverged');}
  return{pins,provider};
 },project:(history,value)=>frozen(structuredClone({format:'breditor/physical-operation-v3-assets-read' as const,formatVersion:1 as const,scope:'held-protected-history-and-whole-upload-provider-bytes' as const,kind:history.history.kind==='ready'&&!history.unreconciledParticipants.length&&value.provider!==null&&!value.provider.missing.length?'checked' as const:'pending' as const,control:port.selection,history,uploads:value.pins,provider:value.provider}))}) as Promise<PhysicalOperationV3HistoryAssetsRead>;
}
