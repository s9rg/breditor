import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {AssetLimits} from '@breditor/experimental-rich-content';
import {generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {continuedRoomRecoveryCatalog} from '../continued_room_catalog/storage.js';
import {continuedCatalogInventory,SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {continuedParticipantCoverage,type ContinuedDocumentOnlyPrefix,type ContinuedParticipantPrefix} from '../continued_participant/inventory.js';
import {matchContinuedRoomPolicies,snapshotContinuedRoomDeliveryPolicies,snapshotContinuedRoomGenerationPolicies,snapshotContinuedRoomIndependentPolicies} from '../continued_room_recovery/policy.js';
import {physicalCatalogV2Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {physicalCatalogSelection} from '../physical_room_catalog/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {continuedProviderPins,continuedReconciliationFailure as fail} from './asset_pins.js';
import {inspectDeliveryRoomPrefix} from './delivery_prefix.js';
import {inspectGenerationRoomPrefix} from './generation_prefix.js';
import {inspectOriginalRoomPrefix,snapshotOriginalReadPolicies} from './original_prefix.js';
import {inspectIndependentRoomPrefix} from './independent_prefix.js';
import {inspectOperationRoomPrefix} from './operation_prefix.js';
import type {ContinuedRoomReconciliationOptions,ContinuedRoomReconciliationRead} from './contract.js';

const {inspectPrefixes,dispose}=SharedContinuedRoomCatalog.prototype;

/** Compare immutable archived client data against the actual selected operator/provider host. */
export async function readContinuedRoomReconciliation(input:ContinuedRoomReconciliationOptions):Promise<ContinuedRoomReconciliationRead>{
 physicalCatalogV2Options(input,['catalog','expected','host','checkAuthority'],['signal','independentPolicies','deliveryPolicies','generationPolicies','originalPolicies','includeOperationArchives']);
 const {catalog,expected,host,checkAuthority,signal,includeOperationArchives}=input;
 const policyFailure=()=>fail('policy');
 if(includeOperationArchives!==undefined&&includeOperationArchives!==true)throw policyFailure();
 const independent=snapshotContinuedRoomIndependentPolicies(input.independentPolicies,policyFailure);
 const delivery=snapshotContinuedRoomDeliveryPolicies(input.deliveryPolicies,policyFailure);
 const generation=snapshotContinuedRoomGenerationPolicies(input.generationPolicies,policyFailure);
 const originalPolicies=snapshotOriginalReadPolicies(input.originalPolicies);
 const held=continuedRoomRecoveryCatalog(catalog),port=generationRecoveryHostPort(host);
 matchContinuedRoomPolicies(held.metadata.participants,'independent-local',independent,policyFailure);
 matchContinuedRoomPolicies(held.metadata.participants,'independent-delivery',delivery,policyFailure);
 matchContinuedRoomPolicies(held.metadata.participants,'generation',generation,policyFailure);
 matchContinuedRoomPolicies(held.metadata.participants,'original',originalPolicies,policyFailure);
 const selected=physicalCatalogSelection(expected),authority=participantAuthority(checkAuthority);
 if(JSON.stringify(held.selection)!==JSON.stringify(selected))throw fail('policy');
 const operations=includeOperationArchives?[
  ...(held.options.graphPolicies??[]),...(held.options.localPolicies??[]),
 ]:[];
 const check=()=>{
  held.check();authority();port.guard(signal);
  for(const {options} of operations)options.checkAuthority();
  held.check();
 };
 const waits=new NativeReconstructionWaits(check,[signal,...port.signals,...operations.map(row=>row.options.signal)]);
 let archive:SharedContinuedRoomCatalog|undefined;
 try{
  const room=held.metadata,source=port.selection.source;
  if(JSON.stringify(room.origin.identity)!==JSON.stringify(source.origin)||
     JSON.stringify(room.current.server.identity)!==JSON.stringify(source.server)||
     JSON.stringify(room.current.participants.identity)!==JSON.stringify(source.participants))throw fail('diverged');
  const active=archive=await held.read(waits.check,waits.signal);
  const context=prepareArchiveIntegrity({wasm:held.options.wasm,checkAuthority:waits.check,signal:waits.signal});
  const original=inspectPrefixes.call(active);
  const observed=new Map<string,ContinuedParticipantPrefix|ContinuedDocumentOnlyPrefix>(original.participants.map(row=>[row.id,row.prefix]));
  const catalogLimits=new Map(held.options.policies.map(row=>[row.id,row.limits]));
  const admitted=new Map<string,Partial<AssetLimits>|undefined>(original.participants.map(row=>[row.id,catalogLimits.get(row.id)]));
  for(const policies of [independent,delivery,generation,originalPolicies])
   for(const [id,policy] of policies)admitted.set(id,policy.limits);
  for(const [id,policy] of independent)observed.set(id,await inspectIndependentRoomPrefix(active,policy,waits));
  const continuedDeliveryIds=new Set(room.participants.filter(row=>row.family==='continued-delivery').map(row=>row.id));
  const boundActors=new Set(original.participants.filter(({id})=>continuedDeliveryIds.has(id)).map(({prefix})=>prefix.review.actor));
  for(const [id,policy] of delivery){
   const prefix=await inspectDeliveryRoomPrefix(active,policy,waits);
   observed.set(id,prefix);boundActors.add(prefix.review.actor);
  }
  for(const [id,policy] of generation){
   const {prefix,boundActor}=await inspectGenerationRoomPrefix(active,policy,waits);
   observed.set(id,prefix);
   if(boundActor)boundActors.add(boundActor);
  }
  for(const [id,policy] of originalPolicies){
   const {prefix,boundActor}=await inspectOriginalRoomPrefix(active,policy,waits);
   observed.set(id,prefix);
   if(boundActor)boundActors.add(boundActor);
  }
  for(const policy of operations){
   const {prefix,boundActor}=await inspectOperationRoomPrefix(active,policy,waits);
   observed.set(policy.id,prefix);admitted.set(policy.id,policy.options.limits);
   if(boundActor)boundActors.add(boundActor);
  }
  const participants:{id:string;prefix:ContinuedParticipantPrefix}[]=[];
  const documentOnlyParticipants:{id:string;prefix:ContinuedDocumentOnlyPrefix}[]=[];
  const observations=room.participants.flatMap(({id})=>{
   const prefix=observed.get(id);
   if(!prefix)return [];
   if(prefix.review)participants.push({id,prefix});
   else documentOnlyParticipants.push({id,prefix});
   return [prefix];
  });
  const coverage=admitted.size!==original.participants.length?
   continuedParticipantCoverage(continuedCatalogInventory(active),observations,boundActors):original.coverage;
  const unreconciledParticipants=original.unreconciledParticipants.filter(id=>!observed.has(id));
  const pins=await continuedProviderPins(active,context,waits.signal,admitted);
  waits.check();
  // Preserve the catalog/read failure if current custody ends during token acquisition.
  let requestGuardFailed=false,requestGuardError:unknown;
  const beforeRequest=()=>{
   try{waits.check();}
   catch(error){requestGuardFailed=true;requestGuardError=error;throw error;}
  };
  const provider=unreconciledParticipants.length?null:
   await port.checkAssets(pins.requirements,waits.signal,beforeRequest).catch(error=>{
    throw requestGuardFailed?requestGuardError:error;
   });
  if(provider)pins.verify(provider);
  else await port.check(waits.signal);
  waits.check();
  const result:ContinuedRoomReconciliationRead=frozen({format:'breditor/continued-room-reconciliation-read',formatVersion:1,
   catalog:selected,kind:'pending',coverage,participants,unreconciledParticipants,uploads:pins.uploads,provider,
   ...(documentOnlyParticipants.length?{documentOnlyParticipants}:{})});
  waits.check();
  return result;
 }finally{
  try{if(archive)dispose.call(archive);}
  finally{waits.close();}
 }
}
