import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {captureSharedAssetReferences,SharedAssetReferenceCapture} from '../asset_references_capture.js';
import {continuedCatalogOriginalBackup,type SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {checkManagedSource} from '../managed_custody.js';
import {dormantMetadataTransportForCore,unconfiguredMetadataToken} from '../metadata/dormant_transport.js';
import {stagedReadOnlyFactory} from '../native_restore_factory.js';
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {participantSelection} from '../participant_backup/policy.js';
import {checkComponent,discardRecoveryOwners,inspectOriginalRecoveryComponent,ownerSources,restoreComponent,type RecoveryOwners} from '../participant_recovery/components.js';
import {prepareRecovery} from '../participant_recovery/prepare.js';
import type {SharedParticipantRecoverySession} from '../participant_recovery/types.js';
import {physicalCatalogName} from '../physical_room_catalog/policy.js';
import {physicalCatalogV2Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {queueIdentity} from '../suggestions/validation.js';
import {revisionsBinding} from '../suggestion_revisions/transport.js';
import {versionIdentity} from '../versions/validation.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {ContinuedRoomOriginalRecoveryPolicy,ContinuedRoomRecoveryDestination} from './contract.js';
import {recoveryFailure as fail,type ContinuedDestinationHold} from './destination.js';
import {snapshotPolicies} from './policy.js';

const {uploadBackup,verifySource}=SharedParticipantBackup.prototype;
const {dispose:disposeCapture}=SharedAssetReferenceCapture.prototype;

export function snapshotContinuedRoomOriginalPolicies(input:readonly ContinuedRoomOriginalRecoveryPolicy[]|undefined){
 const failure=()=>fail('policy');
 return snapshotPolicies(input,failure,value=>{
  physicalCatalogV2Options(value,['id','expected','session'],['suggestions','revisions','versions','limits']);
  const {id,expected,session,suggestions,revisions,versions,limits}=snapshotReadFactoryData(value);
  physicalCatalogV2Options(session,['kind','options'],[]);
  if(suggestions)physicalCatalogV2Options(suggestions,['identity'],['ownedHistory']);
  if(revisions)physicalCatalogV2Options(revisions,['binding'],[]);
  if(versions)physicalCatalogV2Options(versions,['identity'],[]);
  return {id:physicalCatalogName(id),expected:participantSelection(expected),session,limits:checkRichAssetLimits(limits),
   ...(suggestions?{suggestions:{...suggestions,identity:queueIdentity(suggestions.identity)}}:{}),
   ...(revisions?{revisions:revisionsBinding(revisions)}:{}),
   ...(versions?{versions:{identity:versionIdentity(versions.identity)}}:{})};
 });
}

/** The host factory supplies the original protocol. The room initializes only the
 * unobserved native replica, preserving the stored checkpoint and relay binding. */
function stagedSession(session:SharedParticipantRecoverySession,guard:()=>void):SharedParticipantRecoverySession{
 const readOnly=<T>(factory:T)=>stagedReadOnlyFactory(factory,session.options,guard);
 switch(session.kind){
  case 'document':return {...session,options:{...session.options,restore:readOnly(session.options.restore)}};
  case 'document-selection':return {...session,options:{...session.options,restoreDocument:readOnly(session.options.restoreDocument)}};
  case 'search-document':return {...session,options:{...session.options,restoreSearch:readOnly(session.options.restoreSearch)}};
  case 'paired':return {...session,options:{...session.options,review:{...session.options.review,access:'read_only'},restore:readOnly(session.options.restore)}};
  case 'reviewed-paired':return {...session,options:{...session.options,review:{...session.options.review,access:'read_only'},restoreReviewed:readOnly(session.options.restoreReviewed)}};
  case 'search-paired':return {...session,options:{...session.options,review:{...session.options.review,access:'read_only'},restoreSearch:readOnly(session.options.restoreSearch)}};
  default:throw fail('policy');
 }
}

export async function prepareOriginalRoomDestination(
 archive:SharedContinuedRoomCatalog,destination:ContinuedRoomRecoveryDestination,policy:ContinuedRoomOriginalRecoveryPolicy,
 database:string,guard:()=>void,signal?:AbortSignal,
){
 const backup=continuedCatalogOriginalBackup(archive,destination.id),{suggestions,revisions,versions}=policy;
 if(!destination.original||revisions&&!suggestions)throw fail('policy');
 const owners:RecoveryOwners<SharedSelectionPolicy>={};
 const prepared=await prepareRecovery({
  database,backup,expected:policy.expected,destinations:{document:destination.source,uploads:destination.uploads,...destination.original},
  session:stagedSession(policy.session,guard),checkAuthority:guard,...(policy.limits?{limits:policy.limits}:{}),
  ...(signal?{signal}:{}),...(suggestions?{suggestions}:{}),
  ...(revisions?{revisions:{...revisions,transport:dormantMetadataTransportForCore(
   ()=>owners.session!.core,suggestions!.identity,revisions.binding,guard,
  )}}:{}),
  ...(versions?{versions:{...versions,getToken:unconfiguredMetadataToken}}:{}),
 });
 const steps=prepared.record.steps.map(row=>row.step).filter(step=>step!=='uploads');
 let capture:SharedAssetReferenceCapture|undefined,closed=false;
 const close=async()=>{
  closed=true;
  if(capture){disposeCapture.call(capture);capture=undefined;}
  await discardRecoveryOwners(owners);
 };
 return {
  steps,uploads:uploadBackup.call(backup),limits:prepared.limits,close,
  name:(step:typeof steps[number])=>prepared.destinations[step]!,
  async restore(step:typeof steps[number],completed:boolean){
   await restoreComponent(prepared,owners,step,completed,true);
  },
  async hold():Promise<ContinuedDestinationHold>{
   const sources=ownerSources(prepared,owners),stamp=coreReadStamp(sources.core);
   const retained=Object.values(owners);
   capture=captureSharedAssetReferences(sources);
   const check=()=>{
    if(closed)throw fail('diverged');
    for(const owner of retained)checkManagedSource(owner,sources.core);
    const current=coreReadStamp(sources.core);
    if(current.document!==stamp.document||current.review!==stamp.review)throw fail('diverged');
   };
   const verify=async()=>{
    guard();check();
    if(!native.view.call(sources.core).readOnly)throw fail('diverged');
    verifySource.call(backup,capture!);
    for(const step of steps){
     checkComponent(prepared,owners,step);
     if(await inspectOriginalRecoveryComponent(prepared,step)!=='exact')throw fail('diverged');
    }
    guard();verifySource.call(backup,capture!);check();
   };
   await verify();
   return {check,verify,close};
  },
 };
}
