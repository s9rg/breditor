/** Separate control envelope bound; no old wire/source budget or endpoint is widened. */
import type {GenerationControlCancellationReason} from '../generation_recovery_control/cancellation.js';
export const MAX_SERVER_GENERATION_DELIVERY_RECOVERY_CONTROL_BYTES=256*1024;
export class SharedServerLogGenerationDeliveryControlError extends Error{
 /** Local timeout or abort observation for a cancelled read. */
 declare readonly cancellationReason?:GenerationControlCancellationReason;
 constructor(readonly code:'delivery_control_policy'|'delivery_control_protocol'|'delivery_control_closed'|'delivery_control_busy'|'delivery_control_authority'|'delivery_control_cancelled'|'delivery_control_transfer'|'delivery_control_permission'|'delivery_control_unavailable',cancellationReason?:GenerationControlCancellationReason){super('Check the actual full previous server cut and the separately selected current native/provider control');if(cancellationReason!==undefined)this.cancellationReason=cancellationReason;this.name='SharedServerLogGenerationDeliveryControlError';}
}
export const deliveryControlFailure=(code:SharedServerLogGenerationDeliveryControlError['code']='delivery_control_protocol',cancellationReason?:GenerationControlCancellationReason)=>new SharedServerLogGenerationDeliveryControlError(code,cancellationReason);
export function deliveryControlEndpoint(value:unknown):string{try{if(typeof value!=='string'||value.length>2048)throw Error();const url=new URL(value);if(url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/recovery/generation-delivery/v1/check')||url.protocol!=='https:'&&(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error();return url.href;}catch{throw deliveryControlFailure('delivery_control_policy');}}
