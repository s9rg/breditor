/** Stable fixture facade across actual child death. Old SDK hosts are never
 * retargeted: callers must select newly provisioned authenticated controls. */
import assert from 'node:assert/strict';
import {selectedDeliveryNativeHost,reopenSelectedDeliveryJointNativeHost,reopenSelectedDeliverySealedNativeHost} from '../selected-delivery/native-host.mjs';
export async function nativeJointProcessHost(root,options){
 return nativeProcessHost(root,{...options,nativeActivation:true,nativePublication:true,jointProcessRecovery:true},reopenSelectedDeliveryJointNativeHost);
}
export async function nativeSealedProcessHost(root,options){
 return nativeProcessHost(root,{...options,nativeActivation:true,nativeHandoverActivation:true,nativeHandoverPublication:true,sealedProcessRecovery:true},reopenSelectedDeliverySealedNativeHost);
}
async function nativeProcessHost(root,options,reopen){
 let current=await selectedDeliveryNativeHost(root,options),ended=false,observation;
 return new Proxy({}, {get(_target,key){
  if(key==='crashAndReopen')return async capsule=>{const prior=current.processId,crash=await current.crashForRecovery(capsule);ended=true;observation={...crash,actualOldProcessExited:true};current=await reopen(root,capsule);ended=false;assert.notEqual(current.processId,prior);observation={...observation,reopenedProcessId:current.processId};return current.reopenedOffer;};
  if(key==='processRecoveryObservation')return()=>observation;
  if(key==='stop')return async()=>{if(!ended)await current.stop();};
  const value=current[key];return typeof value==='function'?value.bind(current):value;
 }});
}
