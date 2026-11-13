import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {readPairedBackupRecord} from '../backups/paired.js';
import {continuedCatalogInventory,continuedCatalogOriginalBackup,type SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {inspectLocalNativePrefix} from '../continued_participant/inventory.js';
import {snapshotPolicies} from '../continued_room_recovery/policy.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {SharedParticipantBackup,originalParticipantAssetMetadata} from '../participant_backup/archive.js';
import {participantSelection} from '../participant_backup/policy.js';
import {physicalCatalogName} from '../physical_room_catalog/policy.js';
import {physicalCatalogV2Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {originalReferencePackets,type OriginalReferencePacketRows} from '../persistence/original_reference_packets.js';
import {replayOriginalReferenceState} from '../persistence/original_reference_replay.js';
import {checkSourceCheckpoint} from '../persistence/source_checkpoint.js';
import {transportVersion} from '../relay/validation.js';
import {checkInventoryStores} from '../room_participant_inventory/stores.js';
import type {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {continuedReconciliationFailure as fail} from './asset_pins.js';
import type {ContinuedRoomOriginalReadPolicy} from './contract.js';

const {records}=SharedParticipantBackup.prototype;
const inventoryMetadata=SharedServerLogGenerationParticipantInventory.prototype.metadata;

export function snapshotOriginalReadPolicies(input:readonly ContinuedRoomOriginalReadPolicy[]|undefined){
 const failure=()=>fail('policy');
 return snapshotPolicies(input,failure,value=>{
  physicalCatalogV2Options(value,['id','expected','restore'],['editor','limits']);
  const row=snapshotReadFactoryData(value);
  if(typeof row.restore!=='function'||row.editor!==undefined&&(!row.editor||typeof row.editor!=='object'||
     Array.isArray(row.editor)||['selectionEditing','reviewedHistory','searchHistory','segmentedHistory'].some(key=>key in row.editor!)))throw failure();
  return {...row,id:physicalCatalogName(row.id),expected:participantSelection(row.expected),limits:checkRichAssetLimits(row.limits)};
 });
}

/** Replay the exact original checkpoint and all declared packet stores at one server cut. */
export async function inspectOriginalRoomPrefix(
 archive:SharedContinuedRoomCatalog,policy:ContinuedRoomOriginalReadPolicy,waits:NativeReconstructionWaits,
){
 const backup=continuedCatalogOriginalBackup(archive,policy.id),inventory=continuedCatalogInventory(archive);
 const {source,participant,principal}=policy.expected.identity;
 const archived=records.call(backup),room=inventoryMetadata.call(inventory).native;
 checkInventoryStores(room,archived,principal,source.writer);
 const pairedRow=archived.find(row=>row.kind==='paired-session');
 const paired=pairedRow?readPairedBackupRecord(pairedRow.json,source):null;
 const review=paired?{actor:paired.reviewActor}:null;
 const relay=paired&&'relay'in paired?paired.relay:undefined;
 if(paired&&paired.principal!==principal)throw fail('policy');
 if(paired&&relay){
  const registered=room.review?.writers.find(row=>row.clock.actor===relay.actor);
  if(!registered||registered.principal!==principal||registered.observer!==(relay.reviewEditing==='read_only')||
     relay.binding!==room.review?.binding||transportVersion(relay.writerTransport)!==room.room.writerTransportVersion)throw fail('policy');
  const accepted='progress'in paired?paired.progress?.accepted:null;
  if(accepted&&BigInt(accepted.through)>BigInt(registered.clock.through))throw fail('diverged');
 }
 const reviewedHistory=paired&&'reviewedHistory'in paired?paired.reviewedHistory:null;
 const binding=nativeRestoreBinding(waits.restore(policy.restore,policy),policy);
 const replica=await replayOriginalReferenceState({slot:'live',checkpoint:archived[0]!.json,
  ...source,reviewedHistory,paired},binding,policy.editor,undefined,waits.check);
 try{
  checkSourceCheckpoint(replica.core,source.room,source.writer);
  const packets:OriginalReferencePacketRows={localVersions:paired?.versions,reviewedHistory:reviewedHistory?'reviewed-v1':undefined};
  for(const row of archived){
   if(row.kind==='version-catalog')packets.versions=JSON.parse(row.json);
   if(row.kind==='suggestions')packets.suggestions=JSON.parse(row.json);
   if(row.kind==='suggestion-revisions')packets.revisions=JSON.parse(row.json);
  }
  const {references,pending}=originalReferencePackets(replica.core,packets,replica.check);
  const metadata=originalParticipantAssetMetadata(backup);
  if(pending.length||native.view.call(replica.core).revision!==metadata.revision||
     JSON.stringify(references)!==JSON.stringify(metadata.bindings.map(({asset,generation})=>({asset,generation}))))throw fail('diverged');
  const prefix=inspectLocalNativePrefix(replica.core,inventory,participant,principal,{native:source,review},replica.check);
  return {prefix,boundActor:relay?.actor};
 }finally{replica.dispose();}
}
