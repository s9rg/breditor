/** Actual process replacement behind a stable fixture facade. All SDK handles
 * remain separately branded; an old control is never retargeted by this facade. */
import assert from 'node:assert/strict';
import {selectedDeliveryNativeHost,reopenSelectedDeliveryNativeHost} from '../selected-delivery/native-host.mjs';
export async function nativeProcessHost(root,options){
 const original=await selectedDeliveryNativeHost(root,{...options,nativeActivation:true,inactiveRasters:true,processRecovery:true});let current=original,ended=false,crashObservation;
 return new Proxy({}, {get(_target,key){
  if(key==='prepareProcessRecovery')return offer=>current.prepareProcessRecovery(offer);
  if(key==='crashAndReopen')return async capsule=>{const previous=current.processId;const stopped=await current.crashForRecovery(capsule);ended=true;crashObservation={...stopped,actualOldProcessExited:true};current=await reopenSelectedDeliveryNativeHost(root,capsule);ended=false;assert.notEqual(current.processId,previous);crashObservation={...crashObservation,reopenedProcessId:current.processId};return current.reopenedOffer;};
  if(key==='processRecoveryObservation')return()=>crashObservation;
  if(key==='stop')return async()=>{if(!ended)await current.stop();};
  const value=current[key];return typeof value==='function'?value.bind(current):value;
 }});
}
