import {RichAssetStore} from '@breditor/experimental-rich-content';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {continuedCatalogClient,type SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import type {ContinuedRoomCatalogReadOptions} from '../continued_room_catalog/contract.js';
import {flatLocalArchive as flat} from '../flat_local_operation/archive.js';
import {OperationalFlatLocalParticipant as Flat,reserveFlatLocalRead,resumeCompletedOperationalFlatLocalParticipant} from '../flat_local_operation/participant.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {portableLocalOperationArchive as snapshot} from '../independent_local_operation/portable_backup.js';
import {withExactOperationRecoveryInput} from '../operation_read/exact_recovery_input.js';
import type {OperationalReadReservation} from '../operation_read/reservation.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {restoredGraphArchive as graph} from '../restored_graph/archive.js';
import {OperationalRestoredLocalParticipant as Snapshot,reserveRestoredLocalRead,resumeCompletedOperationalRestoredLocalParticipant} from '../restored_local_operation/participant.js';
import {RestoredOperationParticipant as Graph,reserveRestoredOperationRead,reopenCompletedRestoredParticipant,resumeCompletedRestoredOperationParticipant} from '../restored_participant/participant.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import type {ContinuedRoomRecoveryDestination} from './contract.js';
import {recoveryFailure as fail,type ContinuedDestinationHold} from './destination.js';

const {exportBackup}=RichAssetStore.prototype;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
type Owner=Graph|Snapshot|Flat;
type Read=OperationalReadReservation<Readonly<{source:Readonly<{session:object}>;uploads:RichAssetStore}>>;

export function operationDestinationNames(destination:ContinuedRoomRecoveryDestination):readonly string[]{
 const {source,uploads,operation}=destination;
 return operation?[operation.parent,operation.journal,source,uploads]:[source,uploads];
}

/** Use the existing four-namespace participants and keep a live read witness
 * until the outer room journal has verified its entire cohort. */
export async function recoverOperationRoomDestination(
 archive:SharedContinuedRoomCatalog,destination:ContinuedRoomRecoveryDestination,options:ContinuedRoomCatalogReadOptions,
 completed:boolean,context:ArchiveIntegrityContext,signal:AbortSignal|undefined,
 retain:(close:()=>Promise<void>)=>()=>void,
):Promise<ContinuedDestinationHold>{
 const {id,operation,source,uploads}=destination;
 if(!operation)throw fail('policy');
 const client=continuedCatalogClient(archive,id),{parent,journal}=operation;
 const {guard}=context;
 const present=async(name:string)=>{
  guard();const db=await existingDatabase(name);
  try{guard();return db!==undefined;}finally{db?.close();}
 };
 const parentExists=await present(parent);
 if(!parentExists&&(completed||await present(journal)||await present(source)||await present(uploads)))throw fail('diverged');
 if(completed&&(!await present(journal)||!await present(source)||!await present(uploads)))throw fail('diverged');
 let owner:Owner|undefined,reservation:Read|undefined;
 const close=async()=>{
  try{reservation?.close();reservation=undefined;}
  finally{if(owner)await owner.discardAndClose();}
 };
 // The root opening owns cleanup even if a leaf finishes opening but fails verification.
 const transfer=retain(close);
 const input=(file:Blob,check:()=>void)=>{
  let selectedDigest:Promise<string>|undefined;
  return async(actual:Blob)=>{
   check();
   if(actual.size!==file.size)throw fail('diverged');
   if(actual!==file&&await context.digest(actual)!==await(selectedDigest??=context.digest(file)))throw fail('diverged');
   check();
  };
 };
 let readSource:((session:object)=>unknown),expected:unknown,uploadFile:Blob,check:()=>void;
 if(client.family==='restored-graph'){
  const policy=options.graphPolicies?.find(row=>row.id===id)?.options;
  if(!policy)throw fail('policy');
  check=()=>{guard();checkAssetBytesSignal(policy.signal);policy.checkAuthority();checkAssetBytesSignal(policy.signal);guard();};
  const file=graph.file.call(client.backup);
  const chosen=withExactOperationRecoveryInput({
   kind:'lineage-v2' as const,expected:graph.selection.call(client.backup),database:parent,journalDatabase:journal,
   sourceDatabase:source,uploadsDatabase:uploads,writerRecovery:'host-reacquired' as const,session:policy.session,
   checkAuthority:check,...(signal?{signal}:{}),...(policy.limits?{limits:policy.limits}:{}),
  },input(file,check));
  const restored=owner=parentExists?await(completed?resumeCompletedRestoredOperationParticipant(chosen):Graph.resume(chosen)):
   await Graph.begin(file,chosen);
  if(completed||(await restored.progress()).phase==='ready')await reopenCompletedRestoredParticipant(restored);
  else await restored.finish();
  reservation=reserveRestoredOperationRead([restored]);
  readSource=session=>independentDeliverySource(session).read();
  expected=graph.live.call(client.backup);uploadFile=graph.uploads.call(client.backup);
 }else if(client.family==='local-operation-snapshot'||client.family==='local-operation-flat'){
  const policy=options.localPolicies?.find(row=>row.id===id&&row.family===client.family)?.options;
  if(!policy)throw fail('policy');
  check=()=>{guard();checkAssetBytesSignal(policy.signal);policy.checkAuthority();checkAssetBytesSignal(policy.signal);guard();};
  const base={database:journal,sourceDatabase:source,cohort:{parentDatabase:parent,uploadsDatabase:uploads},
   writerRecovery:'host-reacquired' as const,sourceFactory:policy.session,checkAuthority:check,...(signal?{signal}:{}),
   ...(policy.limits?{limits:policy.limits}:{})};
  if(client.family==='local-operation-snapshot'){
   const file=snapshot.file.call(client.backup);
   const chosen=withExactOperationRecoveryInput({...base,kind:'snapshot-v1' as const,expected:snapshot.selection.call(client.backup)},input(file,check));
   const restored=owner=parentExists?await(completed?resumeCompletedOperationalRestoredLocalParticipant(chosen):Snapshot.resume(chosen)):
    await Snapshot.begin(file,chosen);
   reservation=reserveRestoredLocalRead(restored);
   expected=snapshot.live.call(client.backup);uploadFile=snapshot.uploads.call(client.backup);
  }else{
   const file=flat.file.call(client.backup);
   const chosen=withExactOperationRecoveryInput({...base,kind:'flat-local-v1' as const,expected:flat.selection.call(client.backup)},input(file,check));
   const restored=owner=parentExists?await(completed?resumeCompletedOperationalFlatLocalParticipant(chosen):Flat.resume(chosen)):
    await Flat.begin(file,chosen);
   reservation=reserveFlatLocalRead(restored);
   expected=flat.live.call(client.backup);uploadFile=flat.uploads.call(client.backup);
  }
  readSource=session=>independentHistoryNative(session).persisted();
 }else throw fail('policy');
 await reservation.prepare();
 const held=reservation,{source:{session},uploads:store}=held.states[0]!;
 const core=client.family==='restored-graph'?independentDeliverySource(session).core:independentHistoryNative(session).core;
 const digest=await context.digest(uploadFile);
 const current=()=>{held.checkCurrent();if(!native.view.call(core).readOnly)throw fail('diverged');};
 const verify=async()=>{
  check();await held.verify();current();
  if(!same(readSource(session),expected)||await context.digest(await exportBackup.call(store,signal?{signal}:{}))!==digest)throw fail('diverged');
  check();current();
 };
 await verify();
 transfer();
 return {check:current,verify,close};
}
