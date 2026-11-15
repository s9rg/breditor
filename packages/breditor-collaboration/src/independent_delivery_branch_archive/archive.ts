/** Preserve separately restorable native branches even when ordinary reconciliation refuses. */
import {SharedIndependentDeliveryParticipantBackup as Participant} from '../independent_delivery_participant/backup.js';
import {fields} from '../physical_room_record_cut/policy.js';
import type {
 SharedIndependentDeliveryBranchArchive,
 SharedIndependentDeliveryBranchArchiveBuildOptions,
 SharedIndependentDeliveryBranchArchiveReadOptions,
 SharedIndependentDeliveryBranchArchiveSelection,
 SharedIndependentDeliveryBranchFile,
} from './contract.js';
import {compareBranches} from './compare.js';
import {branchFile,branchManifest,branchSelection,encodeBranches,frameBranches} from './framing.js';
import {BranchArchiveScope} from './scope.js';

const participantRead=Participant.read;
const participantRecovery=Participant.prototype.sourceRecovery;
const participantDispose=Participant.prototype.dispose;
const readFields=['session','wasm','checkAuthority'];
const optionalFields=['signal','limits'];

async function admitBranches(
 current:SharedIndependentDeliveryBranchFile,
 incoming:SharedIndependentDeliveryBranchFile,
 scope:BranchArchiveScope,
){
 const a=current.selection,b=incoming.selection;
 if(JSON.stringify(a.identity.source)!==JSON.stringify(b.identity.source)||a.identity.principal!==b.identity.principal){
  throw new Error('Select branches of the same document writer and review actor');
 }
 if(a.sha256===b.sha256)throw new Error('Select two independently retained branch files');
 const options={signal:scope.signal,limits:scope.limits};
 scope.check();
 const before=await participantRead.call(Participant,current.file,a,options);
 try{
  scope.check();
  const other=await participantRead.call(Participant,incoming.file,b,options);
  try{
   scope.check();
   return await compareBranches(participantRecovery.call(before),participantRecovery.call(other),scope);
  }finally{
   participantDispose.call(other);
  }
 }finally{
  participantDispose.call(before);
 }
}

/** Assemble an exact pair and its native comparison. The host retains the returned file and selection. */
export async function buildSharedIndependentDeliveryBranchArchive(
 options:SharedIndependentDeliveryBranchArchiveBuildOptions,
):Promise<SharedIndependentDeliveryBranchArchive>{
 const provided=fields(options,[...readFields,'current','incoming'],optionalFields);
 const current=branchFile(provided['current']),incoming=branchFile(provided['incoming']);
 const scope=new BranchArchiveScope(provided as unknown as SharedIndependentDeliveryBranchArchiveReadOptions);
 try{
  const comparison=await admitBranches(current,incoming,scope);
  const encoded=await encodeBranches(current,incoming,comparison,scope);
  scope.check();
  return Object.freeze({...encoded,current,incoming,comparison});
 }finally{
  scope.close();
 }
}

/** Reopen both complete original files and recompute the native comparison before returning either. */
export async function readSharedIndependentDeliveryBranchArchive(
 input:Blob,
 expected:SharedIndependentDeliveryBranchArchiveSelection,
 options:SharedIndependentDeliveryBranchArchiveReadOptions,
):Promise<SharedIndependentDeliveryBranchArchive>{
 const selection=branchSelection(expected);
 const provided=fields(options,readFields,optionalFields);
 const scope=new BranchArchiveScope(provided as unknown as SharedIndependentDeliveryBranchArchiveReadOptions);
 try{
  const {file,header,current,incoming}=await frameBranches(input,selection,scope);
  const comparison=await admitBranches(current,incoming,scope);
  if(branchManifest(current,incoming,comparison)!==header)throw new Error('Branch archive differs from its native histories');
  scope.check();
  return Object.freeze({file,selection,current,incoming,comparison});
 }finally{
  scope.close();
 }
}
