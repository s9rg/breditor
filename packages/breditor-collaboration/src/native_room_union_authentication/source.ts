/** Actual selected server reads, repeated per attempt. Returned windows remain private replay input. */
import {SharedEditorError} from '../core.js';
import {physicalRecoveryHostPort} from '../physical_recovery_control/host.js';
import {originalReviewFields as fields,originalReviewRows as rows,originalReviewChoices} from '../original_review_authorizations/request.js';
import {unionAuthorizations,matchUnionAuthorizations} from '../native_room_union/plan.js';
import {identifier,fail,MAX_NATIVE_ROOM_UNION_HEADER_BYTES} from '../native_room_union/policy.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {freezeGeneration} from '../generation_source/identity.js';
import type {NativeRoomUnionTarget,NativeRoomUnionAuthorization} from '../native_room_union/contract.js';
import type {NativeRoomUnionAuthenticationOptions,NativeRoomUnionPendingOriginalRights} from './contract.js';
const catalog=Loaded.prototype.catalog;
export class NativeRoomUnionOriginalRightsPending extends SharedEditorError {
 readonly pending:readonly NativeRoomUnionPendingOriginalRights[];
 constructor(pending:readonly NativeRoomUnionPendingOriginalRights[]){super('room_union_original_rights_pending','Some original comment events remain unaccepted; all original inputs are retained');this.pending=freezeGeneration(pending);}
}
export class NativeRoomUnionAuthentication {
 readonly #port;readonly options:NativeRoomUnionAuthenticationOptions;
 constructor(provided:NativeRoomUnionAuthenticationOptions){
  const raw=fields(provided,['host','originalReview']),host=raw['host'] as NativeRoomUnionAuthenticationOptions['host'];this.#port=physicalRecoveryHostPort(host);
  let requestBytes=2;const seen=new Set<string>(),selected=rows(raw['originalReview'],1024).map(value=>{const row=fields(value,['id','query']),id=identifier(row['id']);if(seen.has(id))throw fail('room_union_policy');seen.add(id);const selected={id,query:originalReviewChoices(row['query'])};requestBytes+=new TextEncoder().encode(JSON.stringify(selected)).length+(seen.size>1?1:0);if(requestBytes>MAX_NATIVE_ROOM_UNION_HEADER_BYTES)throw fail('room_union_budget');return selected;}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  this.options=Object.freeze({host,originalReview:freezeGeneration(selected)});Object.freeze(this);
 }
 /** Compare actual admitted room files, not a caller's asserted catalog pin. */
 checkCatalogs(...inputs:readonly Loaded[]):void {
  const selected=this.#port.selection.source;
  for(const input of inputs){const value=catalog.call(input);if(JSON.stringify(value.origin.identity)!==JSON.stringify(selected.ancestor)||JSON.stringify(value.current.server.identity)!==JSON.stringify(selected.server)||JSON.stringify(value.current.participants.identity)!==JSON.stringify(selected.participants))throw fail('room_union_source');}
 }
 async read(targets:readonly Pick<NativeRoomUnionTarget,'id'|'mode'>[],check:()=>void,signal?:AbortSignal):Promise<readonly NativeRoomUnionAuthorization[]> {
  const members=targets.filter(row=>row.mode==='independent-delivery-union');
  if(members.length!==this.options.originalReview.length||members.some(row=>!this.options.originalReview.some(query=>query.id===row.id)))throw fail('room_union_policy');
  let responseBytes=0;const grants:NativeRoomUnionAuthorization[]=[],pending:NativeRoomUnionPendingOriginalRights[]=[];
  for(const row of this.options.originalReview){check();const read=await this.#port.readOriginalReview(row.query,signal);check();responseBytes+=new TextEncoder().encode(JSON.stringify(read)).length;if(responseBytes>MAX_NATIVE_ROOM_UNION_HEADER_BYTES)throw fail('room_union_budget');if(read.authorizations.kind==='pending'){pending.push({id:row.id,read});continue;}
   grants.push({id:row.id,authorizations:read.authorizations.windows.map(window=>({source:{actor:window.source.actor,principal:window.source.principal,access:window.source.role==='moderator'?'moderate' as const:'comment' as const},from:window.from,through:window.through,prefixDigest:window.prefixDigest}))});
  }
  if(pending.length)throw new NativeRoomUnionOriginalRightsPending(pending);
  const result=unionAuthorizations(grants);matchUnionAuthorizations(targets,result);return result;
 }
 async verify(check:()=>void,signal?:AbortSignal):Promise<void>{check();await this.#port.check(signal);check();}
}
