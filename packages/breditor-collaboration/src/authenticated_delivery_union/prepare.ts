/** Saved windows never replace a fresh authenticated native read on every preparation. */
import {physicalRecoveryHostPort,type SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import {originalReviewChoices,originalReviewFields as fields} from '../original_review_authorizations/request.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {readDeliveryUnionInput} from '../independent_delivery_union/input.js';
import {prepareSharedIndependentDeliveryBranchUnion} from '../independent_delivery_union/prepare.js';
import {unionFailure as fail} from '../independent_delivery_union/policy.js';
import {freezeGeneration} from '../generation_source/identity.js';
import type {AuthenticatedDeliveryUnionOptions,AuthenticatedDeliveryUnionResult} from './contract.js';
/** No storage, actors, native live mutation, receipt ACK or server activation.
 * Original server rights do not alter the separately chosen readonly recipients.
 * Unaccepted offline ranges stay intact and pending, without partial authorization. */
export async function prepareAuthenticatedIndependentDeliveryUnion(host:SharedPhysicalRoomRecoveryHost,provided:AuthenticatedDeliveryUnionOptions):Promise<AuthenticatedDeliveryUnionResult>{
 const port=physicalRecoveryHostPort(host),raw=fields(provided,['currentJson','incomingJson','session','originalReview','checkAuthority'],['signal']),query=originalReviewChoices(raw['originalReview']),session=snapshotReadFactoryData(raw['session'] as AuthenticatedDeliveryUnionOptions['session']);
 if(session.readOnly!==true||session.review?.access!=='read_only')throw fail('authenticated_union_policy');
 const work=new NativeReconstructionWaits(participantAuthority(raw['checkAuthority'] as ()=>void),[raw['signal'] as AbortSignal|undefined]);
 try{
  const current=await readDeliveryUnionInput(raw['currentJson'],work.check),incoming=await readDeliveryUnionInput(raw['incomingJson'],work.check);work.check();
  if(current.relay.binding.review?.binding!==query.binding||incoming.relay.binding.review?.binding!==query.binding)throw fail('authenticated_union_binding');
  const originalReview=await port.readOriginalReview(query,work.signal);work.check();
  if(originalReview.authorizations.kind==='pending')return freezeGeneration({kind:'pending',originalReview});
  const authorizations=originalReview.authorizations.windows.map(window=>({source:{actor:window.source.actor,principal:window.source.principal,access:window.source.role==='moderator'?'moderate' as const:'comment' as const},from:window.from,through:window.through,prefixDigest:window.prefixDigest}));
  const preparation=await prepareSharedIndependentDeliveryBranchUnion({currentJson:raw['currentJson'] as string,incomingJson:raw['incomingJson'] as string,session,authorizations,checkAuthority:work.check,signal:work.signal});work.check();
  // A native restore factory or permission callback may have changed the selected server.
  await port.check(work.signal);work.check();return freezeGeneration({kind:'prepared',originalReview,preparation});
 }finally{work.close();}
}
