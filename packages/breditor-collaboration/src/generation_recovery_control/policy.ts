/** Fixed operator-wire bound, independent errors and endpoint policy; no legacy transport widening. */
export const MAX_SERVER_GENERATION_RECOVERY_CONTROL_BYTES=64*1024;
export class SharedServerLogGenerationRecoveryControlError extends Error {
 constructor(readonly code:'control_policy'|'control_protocol'|'control_closed'|'control_busy'|'control_authority'|'control_cancelled'|'control_transfer'|'control_permission'|'control_unavailable',message:string){super(message);this.name='SharedServerLogGenerationRecoveryControlError';}
}
export function controlFailure(code:SharedServerLogGenerationRecoveryControlError['code']='control_protocol'):SharedServerLogGenerationRecoveryControlError{return new SharedServerLogGenerationRecoveryControlError(code,{
 control_policy:'Choose an explicit server generation recovery control, independent source pins and fresh operator policy',
 control_protocol:'The complete operator response differs from the independently selected control and native source',
 control_closed:'This operator checker is closed or was not constructed by this SDK',
 control_busy:'This operator checker already has a live request',
 control_authority:'The current synchronous host recovery authority did not hold',
 control_cancelled:'The operator check was cancelled or timed out',
 control_transfer:'The operator check did not complete',
 control_permission:'The current operator account was refused',
 control_unavailable:'The current operator/native/provider owner is unavailable'
 }[code]);}
export function controlEndpoint(value:unknown):string {
 try{if(typeof value!=='string'||value.length>2048)throw controlFailure('control_policy');const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/recovery/generations/v1/check')||url.protocol!=='https:'&&(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw controlFailure('control_policy');return url.href;
 }catch{throw controlFailure('control_policy');}
}
