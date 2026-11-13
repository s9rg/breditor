import {continuedCatalogInventory,SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {isContinuedRoomPairEntry} from '../continued_room_catalog/manifest.js';
import {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import type {SharedServerLogGenerationRecoveryAcceptedRead,SharedServerLogGenerationRecoveryAcceptedRequest} from '../generation_recovery_control/accepted_contract.js';
import {MAX_GENERATION_NATIVE_IMPORT_BYTES,MAX_GENERATION_NATIVE_IMPORT_PAGES} from '../selected_generation_import/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {continuedReconciliationFailure as fail} from './asset_pins.js';
import {catchUpContinuedDeliveryClient,catchUpContinuedLocalClient} from './catch_up_client.js';
import type {RecoveredContinuedRoomCatchUpPreview,RecoveredContinuedRoomReconciliationOptions} from './contract.js';
import {withRecoveredContinuedRoomReconciliation} from './recovered.js';

const metadata=SharedContinuedRoomCatalog.prototype.metadata;
const inventoryMetadata=SharedServerLogGenerationParticipantInventory.prototype.metadata;

/** Reconstruct each continued-delivery target from an exact completed room
 * recovery and the same authenticated relay cut. The result is detached data. */
export function previewRecoveredContinuedRoomCatchUp(
 input:RecoveredContinuedRoomReconciliationOptions,
):Promise<RecoveredContinuedRoomCatchUpPreview>{
 return withContinuedRoomCatchUp(input,async preview=>preview);
}

type RecoveredVisitor=Parameters<typeof withRecoveredContinuedRoomReconciliation>[1];
export function withContinuedRoomCatchUp<T>(
 input:RecoveredContinuedRoomReconciliationOptions,
 visit:(preview:RecoveredContinuedRoomCatchUpPreview,...scope:Parameters<RecoveredVisitor>)=>Promise<T>,
):Promise<T>{
 return withRecoveredContinuedRoomReconciliation(input,async (read,held,host,check,signal)=>{
  const entries=metadata.call(held.archive).participants.filter(isContinuedRoomPairEntry);
  if(!entries.length)throw fail('policy');
  for(const entry of entries){
   const before=read.reconciliation.participants.find(row=>row.id===entry.id)?.prefix;
   if(before?.documentStatus!=='matches'||before.review.status==='server_ahead'||
      entry.family==='continued-delivery'&&before.review.status!=='matches')throw fail('own_history');
  }
  const pages:SharedServerLogGenerationRecoveryAcceptedRead[]=[];
  const review=inventoryMetadata.call(continuedCatalogInventory(held.archive)).native.review?'start':'absent';
  let request:SharedServerLogGenerationRecoveryAcceptedRequest={document:'include',review:{kind:review}},bytes=0;
  for(;;){
   check();
   if(pages.length>=MAX_GENERATION_NATIVE_IMPORT_PAGES)throw fail('budget');
   const page=await host.readAcceptedNative(request,signal,check);
   check();
   bytes+=new Blob([JSON.stringify(page)]).size;
   if(bytes>MAX_GENERATION_NATIVE_IMPORT_BYTES)throw fail('budget');
   pages.push(page);
   if(!page.review?.more)break;
   request={document:'omit',review:{kind:'after',cursor:page.review.cursor}};
  }
  const policies=new Map(held.catalogOptions.policies.map(row=>[row.id,row]));
  const participants:RecoveredContinuedRoomCatchUpPreview['participants'][number][]=[];
  const localParticipants:RecoveredContinuedRoomCatchUpPreview['localParticipants'][number][]=[];
  for(const entry of entries){
   check();
   const policy=policies.get(entry.id);
   if(!policy)throw fail('policy');
   if(entry.family==='continued-delivery')participants.push(await catchUpContinuedDeliveryClient(held.archive,entry,policy,pages,check,signal));
   else localParticipants.push(await catchUpContinuedLocalClient(held.archive,entry,policy,pages,check,signal));
  }
  check();
  const preview:RecoveredContinuedRoomCatchUpPreview=frozen({format:'breditor/recovered-continued-room-catch-up-preview',formatVersion:1,
   catalog:read.recovery.catalog,server:host.selection,participants,localParticipants});
  return visit(preview,read,held,host,check,signal);
 });
}
