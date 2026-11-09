/** New complete-path envelope only. Old 64/256KiB routes and budgets stay literal. */
import type {GenerationControlCancellationReason} from '../generation_recovery_control/cancellation.js';
export const MAX_SERVER_GENERATION_DELIVERY_PATH_CONTROL_BYTES=16*1024*1024;
export const MAX_SERVER_GENERATION_DELIVERY_PATH_ANCESTORS=4096;
export class SharedServerLogGenerationDeliveryPathControlError extends Error{
 /** Local timeout or abort observation for a cancelled read. */
 declare readonly cancellationReason?:GenerationControlCancellationReason;
 constructor(readonly code:'path_control_policy'|'path_control_protocol'|'path_control_closed'|'path_control_busy'|'path_control_authority'|'path_control_cancelled'|'path_control_transfer'|'path_control_permission'|'path_control_unavailable',cancellationReason?:GenerationControlCancellationReason){super('Authenticate the complete ordered native delivery path and its genuine current provider control');if(cancellationReason!==undefined)this.cancellationReason=cancellationReason;this.name='SharedServerLogGenerationDeliveryPathControlError';}
}
export const deliveryPathControlFailure=(code:SharedServerLogGenerationDeliveryPathControlError['code']='path_control_protocol',cancellationReason?:GenerationControlCancellationReason)=>new SharedServerLogGenerationDeliveryPathControlError(code,cancellationReason);
export function deliveryPathControlEndpoint(value:unknown):string{try{if(typeof value!=='string'||value.length>2048)throw Error();const url=new URL(value);if(url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/recovery/generation-delivery-path/v1/check')||url.protocol!=='https:'&&(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error();return url.href;}catch{throw deliveryPathControlFailure('path_control_policy');}}
