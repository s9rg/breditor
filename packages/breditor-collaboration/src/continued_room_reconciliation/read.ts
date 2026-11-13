import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {continuedRoomRecoveryCatalog} from '../continued_room_catalog/storage.js';
import {SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {physicalCatalogV2Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {physicalCatalogSelection} from '../physical_room_catalog/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {continuedProviderPins,continuedReconciliationFailure as fail} from './asset_pins.js';
import type {ContinuedRoomReconciliationOptions,ContinuedRoomReconciliationRead} from './contract.js';

const {inspectPrefixes,dispose}=SharedContinuedRoomCatalog.prototype;

/** Compare immutable archived client data against the actual selected operator/provider host. */
export async function readContinuedRoomReconciliation(input:ContinuedRoomReconciliationOptions):Promise<ContinuedRoomReconciliationRead>{
 physicalCatalogV2Options(input,['catalog','expected','host','checkAuthority'],['signal']);
 const {catalog,expected,host,checkAuthority,signal}=input;
 const held=continuedRoomRecoveryCatalog(catalog),port=generationRecoveryHostPort(host);
 const selected=physicalCatalogSelection(expected),authority=participantAuthority(checkAuthority);
 if(JSON.stringify(held.selection)!==JSON.stringify(selected))throw fail('policy');
 const check=()=>{held.check();authority();port.guard(signal);held.check();};
 const waits=new NativeReconstructionWaits(check,[signal,...port.signals]);
 let archive:SharedContinuedRoomCatalog|undefined;
 try{
  const room=held.metadata,source=port.selection.source;
  if(JSON.stringify(room.origin.identity)!==JSON.stringify(source.origin)||
     JSON.stringify(room.current.server.identity)!==JSON.stringify(source.server)||
     JSON.stringify(room.current.participants.identity)!==JSON.stringify(source.participants))throw fail('diverged');
  const active=archive=await held.read(waits.check,waits.signal);
  const context=prepareArchiveIntegrity({wasm:held.options.wasm,checkAuthority:waits.check,signal:waits.signal});
  const {coverage,participants,unreconciledParticipants}=inspectPrefixes.call(active);
  const pins=await continuedProviderPins(active,context,waits.signal);
  waits.check();
  const provider=unreconciledParticipants.length?null:await port.checkAssets(pins.requirements,waits.signal);
  if(provider)pins.verify(provider);
  else await port.check(waits.signal);
  waits.check();
  const result:ContinuedRoomReconciliationRead=frozen({format:'breditor/continued-room-reconciliation-read',formatVersion:1,
   catalog:selected,kind:'pending',coverage,participants,unreconciledParticipants,uploads:pins.uploads,provider});
  waits.check();
  return result;
 }finally{
  try{if(archive)dispose.call(archive);}
  finally{waits.close();}
 }
}
