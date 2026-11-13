import {SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import type {SharedServerLogGenerationRecoveryAcceptedRead,SharedServerLogGenerationRecoveryAcceptedRequest} from '../generation_recovery_control/accepted_contract.js';
import {MAX_GENERATION_NATIVE_IMPORT_BYTES,MAX_GENERATION_NATIVE_IMPORT_PAGES} from '../selected_generation_import/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {continuedReconciliationFailure as fail} from './asset_pins.js';
import {catchUpContinuedDeliveryClient} from './catch_up_client.js';
import type {RecoveredContinuedRoomCatchUpPreview,RecoveredContinuedRoomReconciliationOptions} from './contract.js';
import {withRecoveredContinuedRoomReconciliation} from './recovered.js';

const metadata=SharedContinuedRoomCatalog.prototype.metadata;

/** Reconstruct each continued-delivery target from an exact completed room
 * recovery and the same authenticated relay cut. The result is detached data. */
export function previewRecoveredContinuedRoomCatchUp(
 input:RecoveredContinuedRoomReconciliationOptions,
):Promise<RecoveredContinuedRoomCatchUpPreview>{
 return withRecoveredContinuedRoomReconciliation(input,async (read,held,host,check,signal)=>{
  const entries=metadata.call(held.archive).participants.filter(row=>row.family==='continued-delivery');
  if(!entries.length)throw fail('policy');
  for(const entry of entries){
   const before=read.reconciliation.participants.find(row=>row.id===entry.id)?.prefix;
   if(before?.documentStatus!=='matches'||before.review.status!=='matches')throw fail('own_history');
  }
  const pages:SharedServerLogGenerationRecoveryAcceptedRead[]=[];
  let request:SharedServerLogGenerationRecoveryAcceptedRequest={document:'include',review:{kind:'start'}},bytes=0;
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
  const policies=new Map(held.policies.map(row=>[row.id,row]));
  const participants:RecoveredContinuedRoomCatchUpPreview['participants'][number][]=[];
  for(const entry of entries){
   check();
   const policy=policies.get(entry.id);
   if(!policy)throw fail('policy');
   participants.push(await catchUpContinuedDeliveryClient(held.archive,entry,policy,pages,check,signal));
  }
  check();
  return frozen({format:'breditor/recovered-continued-room-catch-up-preview',formatVersion:1,
   catalog:read.recovery.catalog,server:host.selection,participants});
 });
}
