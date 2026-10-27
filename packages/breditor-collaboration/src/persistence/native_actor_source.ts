/** Core-to-persistence resource bindings registered by the four genuine native
 * constructors. Readable native history alone cannot synthesize this binding.
 * This is private local custody, not a server or reconstruction permission. */
import {SharedEditorError} from '../core.js';
import {managedSourceCore} from '../managed_custody.js';
import {captureManagedSourceBindings} from '../managed_source_bindings.js';
import {generationNative} from '../generation_source/admission.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
export type NativeActorSourceFamily='shared'|'review'|'segmented'|'independent';
export interface NativeActorSource{readonly family:NativeActorSourceFamily;readonly source:object}
interface Registration extends NativeActorSource{readonly checkBinding:()=>void}
const owners=new WeakMap<object,Registration>();
const fail=()=>new SharedEditorError('native_actor_source','Use the genuine native core and its original privately registered persistence owner');
/** Constructor-only registration, after the actual existing source/native port
 * has admitted this owner. A copied core field cannot create that admission. */
export function registerNativeActorSource(source:object,family:NativeActorSourceFamily):void{
 if(!['shared','review','segmented','independent'].includes(family))throw fail();
 const core=family==='shared'||family==='review'?managedSourceCore(source):family==='segmented'?generationNative(source).core:independentHistoryNative(source).core;
 if(owners.has(core))throw fail();
 const checkBinding=captureManagedSourceBindings(source,fail);checkBinding();
 owners.set(core,Object.freeze({family,source,checkBinding}));
}
/** Private stopped-core lookup. No public getter or current-edit method is
 * invoked; actual source liveness, stopped state, I/O and actors are separately
 * admitted by the existing branded source helper before the cohort can move. */
export function nativeActorSource(core:object):NativeActorSource{
 const row=owners.get(core);if(!row)throw fail();row.checkBinding();
 return Object.freeze({family:row.family,source:row.source});
}
