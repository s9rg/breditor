import {retainNativeDeliverySource} from './delivery_retention.js';
import {checkRetainedVersionCatalog} from '../versions/retained_source.js';
import {checkManagedSource,managedSourceCore} from '../managed_custody.js';
import type {RecoverySession} from '../participant_recovery/components.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
/** SDK-private genuine LIVE source retention. Captured while a fresh parent
 * reader holds its real owner, but independent of that temporary reader's busy
 * flag/lifetime. No report, factory, writer grant or parent ownership transfer.
 * Keep the COMPLETE cut separately: LIVE data is only a final handoff witness. */
import {SharedAssetReferenceCapture,type SharedAssetReferenceCaptureOptions} from '../asset_references_capture.js';
import {SharedGenerationSourceCapture} from '../generation_source/capture.js';
import type {SharedGenerationSourceSelection} from '../generation_source/contract.js';
import {generationSource} from '../generation_source/admission.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {sourceCoreMethods} from '../source_native_read.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {SharedEditorError,type SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
export interface NativeRetentionWitness{readonly value:unknown;check():void;dispose():void}
export interface NativeRetentionSource{readonly core:SharedRichEditor<SharedSelectionPolicy>;capture():NativeRetentionWitness}
/** Exact detached JSON values, not an incoming permission/ownership test. */
export function sameNativeRetentionValue(a:unknown,b:unknown):boolean{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;if(Array.isArray(a)&&Array.isArray(b)&&a.length!==b.length)return false;const left=Object.keys(a),right=Object.keys(b);return left.length===right.length&&left.every(name=>Object.hasOwn(b,name)&&sameNativeRetentionValue((a as Record<string,unknown>)[name],(b as Record<string,unknown>)[name]));}
const fail=()=>new SharedEditorError('native_retention_source','Retain the actual source and its exact native, packet and policy state');
const captureOriginal=SharedAssetReferenceCapture.capture,checkOriginal=SharedAssetReferenceCapture.prototype.check,recordsOriginal=SharedAssetReferenceCapture.prototype.records,disposeOriginal=SharedAssetReferenceCapture.prototype.dispose;
const captureGeneration=SharedGenerationSourceCapture.capture,checkGeneration=SharedGenerationSourceCapture.prototype.check,recordsGeneration=SharedGenerationSourceCapture.prototype.records,disposeGeneration=SharedGenerationSourceCapture.prototype.dispose;
function source<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,capture:()=>NativeRetentionWitness,managed:()=>void=()=>{}):NativeRetentionSource{
 return Object.freeze({core:core as unknown as SharedRichEditor<SharedSelectionPolicy>,capture(){managed();const witness=capture();let complete=false;
  try{const stamp=coreReadStamp(core),readOnly=sourceCoreMethods.view.call(core).readOnly;const check=()=>{managed();witness.check();const actual=coreReadStamp(core);if(actual.document!==stamp.document||actual.review!==stamp.review||sourceCoreMethods.view.call(core).readOnly!==readOnly)throw fail();};check();complete=true;return Object.freeze({value:witness.value,check,dispose:witness.dispose});}
  finally{if(!complete)witness.dispose();}
 }});
}
export function originalNativeRetention<P extends SharedSelectionPolicy>(input:SharedAssetReferenceCaptureOptions<P>,managed:()=>void,session:RecoverySession<P>):NativeRetentionSource{
 const core=input.core,check=()=>{managed();if(input.session&&input.session!==session||managedSourceCore(session)!==core)throw fail();checkManagedSource(session,core);for(const selected of[input.suggestions,input.revisions])if(selected)checkManagedSource(selected,core);if(input.versions)checkRetainedVersionCatalog(input.versions,core);};
 const native=source(core,()=>{managed();const capture=captureOriginal(input);return{value:recordsOriginal.call(capture),check(){managed();checkOriginal.call(capture);},dispose:()=>disposeOriginal.call(capture)};});
 const packets=Object.freeze({...(input.suggestions?{suggestions:input.suggestions}:{}),...(input.revisions?{revisions:input.revisions}:{}),...(input.versions?{versions:input.versions}:{})});
 // P is erased only inside the trusted common-parent implementation. Every
 // actual object keeps its original native policy and constructor binding.
 retainNativeDeliverySource(native,{kind:'original',session,packets} as unknown as import('./delivery_retention.js').RetainedDeliveryParent,check);return native;
}
export function generationNativeRetention<P extends SharedSelectionPolicy>(input:SharedGenerationSourceSelection<P>,managed:()=>void=()=>{}):NativeRetentionSource{
 const port=generationSource(input.session),native=source(port.core,()=>{const capture=captureGeneration(input);return{value:recordsGeneration.call(capture),check:()=>checkGeneration.call(capture),dispose:()=>disposeGeneration.call(capture)};},managed),selected=Object.freeze({...input});
 retainNativeDeliverySource(native,{kind:'generation',source:selected} as unknown as import('./delivery_retention.js').RetainedDeliveryParent,()=>{managed();const current=generationSource(selected.session);current.checkManaged();if(current.core!==native.core)throw fail();});return native;
}
export function independentNativeRetention(session:object,delivery:boolean,owner:()=>void=()=>{}):NativeRetentionSource{
 if(delivery){const port=independentDeliverySource(session),core=port.core,native=source(core,()=>{const stamp=port.stamp(),value=port.read(),managed=port.check,readStamp=port.stamp;return{value,check(){managed();const now=readStamp();if(port.core!==core||now.length!==stamp.length||now.some((entry,i)=>entry!==stamp[i]))throw fail();},dispose(){}};},owner);
  retainNativeDeliverySource(native,{kind:'independent-delivery',session:session as SharedIndependentDeliverySession<SharedSelectionPolicy>},()=>{owner();const current=independentDeliverySource(session);if(current.core!==core)throw fail();current.check();});return native;
 }
 const port=independentHistoryNative(session),core=port.core,native=source(core,()=>{const stamp=port.stamp(),value=port.read(),managed=port.checkManaged,readStamp=port.stamp;return{value,check(){managed();if(port.core!==core||readStamp()!==stamp)throw fail();},dispose(){}};},owner);
 retainNativeDeliverySource(native,{kind:'independent-local',session:session as SharedIndependentHistoryPersistentSession<SharedSelectionPolicy>},()=>{owner();const current=independentHistoryNative(session);if(current.core!==core)throw fail();current.checkManaged();});return native;
}
