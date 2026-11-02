/** Mutation-specific outcomes. An uncertain commit must retain its durable intent. */
export const MAX_SHARED_NATIVE_ACTIVATION_CONTROL_BYTES=64*1024;
export class SharedNativeActivationError extends Error {
 constructor(readonly code:'activation_policy'|'activation_protocol'|'activation_closed'|'activation_busy'|'activation_authority'|'activation_cancelled'|'activation_transfer'|'activation_outcome_unknown',message:string){super(message);this.name='SharedNativeActivationError';}
}
export function activationFailure(code:SharedNativeActivationError['code']='activation_protocol'):SharedNativeActivationError {
 return new SharedNativeActivationError(code,{
  activation_policy:'Select the separate native activation endpoint, checkpoint and current operator policy',
  activation_protocol:'The complete activation receipt differs from the independently selected checkpoint',
  activation_closed:'This native activation client is closed or was not constructed by this SDK',
  activation_busy:'This native activation client already has an actual request',
  activation_authority:'Current host activation authority did not hold before submission',
  activation_cancelled:'Native activation was cancelled before submission',
  activation_transfer:'Native activation did not begin its HTTP request',
  activation_outcome_unknown:'Native activation may have committed; retain all recovery data and resolve through the actual native control'
 }[code]);
}
export function activationEndpoint(value:unknown):string {
 try{if(typeof value!=='string'||value.length>2048)throw 0;const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/recovery/native-activation/v1/commit')||url.protocol!=='https:'&&(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw 0;
  return url.href;
 }catch{throw activationFailure('activation_policy');}
}
