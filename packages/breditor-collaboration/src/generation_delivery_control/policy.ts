/** Separate control envelope bound; no old wire/source budget or endpoint is widened. */
export const MAX_SERVER_GENERATION_DELIVERY_RECOVERY_CONTROL_BYTES=256*1024;
export class SharedServerLogGenerationDeliveryControlError extends Error{
 constructor(readonly code:'delivery_control_policy'|'delivery_control_protocol'|'delivery_control_closed'|'delivery_control_busy'|'delivery_control_authority'|'delivery_control_cancelled'|'delivery_control_transfer'|'delivery_control_permission'|'delivery_control_unavailable'){super('Check the actual full previous server cut and the separately selected current native/provider control');this.name='SharedServerLogGenerationDeliveryControlError';}
}
export const deliveryControlFailure=(code:SharedServerLogGenerationDeliveryControlError['code']='delivery_control_protocol')=>new SharedServerLogGenerationDeliveryControlError(code);
export function deliveryControlEndpoint(value:unknown):string{try{if(typeof value!=='string'||value.length>2048)throw Error();const url=new URL(value);if(url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/recovery/generation-delivery/v1/check')||url.protocol!=='https:'&&(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error();return url.href;}catch{throw deliveryControlFailure('delivery_control_policy');}}
