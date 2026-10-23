/** Read-only accepted-document prefix diagnostics for the two actual local
 * input families. Their local comments never acquire server delivery identity. */
import type {IndependentLocalOperationBackup} from '../independent_local_operation/portable_backup.js';
import type {FlatLocalArchive} from '../flat_local_operation/archive.js';
import {nativeInputIncomingSource,type NativeInputIncomingSourceCapture} from './incoming_source.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {SharedRoomParticipantInventoryError,frozen} from '../room_participant_inventory/policy.js';
import {sharedProtocolLanguage} from '../protocol.js';
import {prefixAt} from '../relay/validation.js';
import type {SharedRoomParticipantInventoryMetadata,SharedRoomParticipantCoverage,SharedRoomParticipantMissing} from '../room_participant_inventory/types.js';

export type NativeInputInventorySource=
 |Readonly<{family:'local-operation-snapshot';backup:IndependentLocalOperationBackup;source:NativeInputIncomingSourceCapture}>
 |Readonly<{family:'local-operation-flat';backup:FlatLocalArchive;source:NativeInputIncomingSourceCapture}>;
const failure=()=>new SharedRoomParticipantInventoryError('inventory_source','Select the unchanged genuine local incoming archive and native capture');
const duplicate=()=>new SharedRoomParticipantInventoryError('inventory_duplicate','Retain and reconcile duplicate writer/actor copies explicitly; no copy was chosen');
const fork=()=>new SharedRoomParticipantInventoryError('inventory_fork','The accepted native document prefix differs from the selected local history');
/** The returned read still requires coherent check calls; it is not a role,
 * native writer, review binding, provider inventory or activation certificate. */
export function nativeInputInventoryRead(row:NativeInputInventorySource){
 if(!row||typeof row!=='object'||Object.keys(row).sort().join(',')!=='backup,family,source')throw failure();
 if(row.family==='local-operation-snapshot')return nativeInputIncomingSource.read({input:{kind:'snapshot-v1',backup:row.backup},source:row.source});
 if(row.family==='local-operation-flat')return nativeInputIncomingSource.read({input:{kind:'flat-local-v1',backup:row.backup},source:row.source});
 throw failure();
}
export function checkNativeInputInventorySources(metadata:SharedRoomParticipantInventoryMetadata,input:readonly NativeInputInventorySource[]):SharedRoomParticipantCoverage{
 const rows=snapshotInventoryInputs(input,failure,row=>{const captured={...row};nativeInputInventoryRead(captured);return captured;}),writers=new Set<string>(),actors=new Set<string>(),behind=new Set<string>();
 const checked:SharedRoomParticipantCoverage['checkedParticipants'][number][]=[],unbound:SharedRoomParticipantMissing[]=[];
 for(const row of rows){
  const read=nativeInputInventoryRead(row),{capture,lanes:native}=read,selected=read.selected.original.identity,history=capture.metadata.identity;
  const {document,review}=native,writer=history.native.writer,actor=history.review.actor,principal=selected.principal,participant=selected.participant;
  native.check();const registered=metadata.writers.find(r=>r.clock.writer===writer),descriptor=document.descriptor(),wire=metadata.room.writerTransportVersion;
  if(JSON.stringify(history)!==JSON.stringify(selected.source)||!registered||registered.principal!==principal||history.native.room!==metadata.room.document||history.native.richLanguage!==metadata.richLanguage||sharedProtocolLanguage(descriptor)!==metadata.richLanguage||descriptor.schemaFingerprint!==metadata.schemaFingerprint||document.kind!==history.documentHistory||document.checkpointJson()!==capture.records[0]?.json||review.kind==='absent'||review.kind==='unselected'||review.kind!==history.reviewHistory||review.checkpointJson()!==capture.records[1]?.json||history.review.principal!==principal||review.localReviewClock().actor!==actor)throw failure();
  if(writers.has(writer)||actors.has(actor))throw duplicate();writers.add(writer);actors.add(actor);
  const local=wire===2?document.writerClockV2(writer):document.writerClock(writer);if(registered.observer&&local.through!=='0')throw failure();
  if(BigInt(local.through)<BigInt(registered.clock.through))behind.add(writer);
  else if(prefixAt(document,writer,registered.clock.through,wire)!==registered.clock.prefixDigest)throw fork();
  checked.push({participant,principal,writer,observer:registered.observer,localThrough:local.through,acceptedThrough:registered.clock.through});unbound.push({kind:'unbound_review',participant,principal,actor});
  native.check();nativeInputInventoryRead(row);
 }
 const missing:SharedRoomParticipantMissing[]=[];for(const row of metadata.writers)if(!writers.has(row.clock.writer)||behind.has(row.clock.writer))missing.push({kind:'document',principal:row.principal,writer:row.clock.writer,reason:writers.has(row.clock.writer)?'server_ahead':'missing'});
 for(const row of metadata.review?.writers??[])missing.push({kind:'review',principal:row.principal,actor:row.clock.actor,reason:'missing'});
 const registeredStreamsCovered=missing.length===0;missing.push(...unbound);const result=frozen({kind:missing.length?'pending' as const:'covered' as const,registeredStreamsCovered,checkedParticipants:checked,missing});for(const row of rows)nativeInputInventoryRead(row);
 return result;
}
