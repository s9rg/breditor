/** Internal live-custody admission, separate from readable backup/history capture.
 * Only genuine constructors register their private lifecycle checks. No edit, native
 * hold, save, callback publication or read-only policy change is used as a probe. */
import {captureManagedSourceBindings} from "./managed_source_bindings.js";
interface RetainedCoreRevisions {documentRevision:string;reviewRevision:string}
const cores=new WeakMap<object,{check:()=>void;revisions:()=>RetainedCoreRevisions}>();
const sources=new WeakMap<object,{core:object;check:()=>void;bindings:()=>void;dependencies:readonly object[]}>();
export const managedSourceUnavailable=()=>Object.assign(new Error("The readable source no longer has live managed custody"),{code:"managed_source_unavailable"});
export function registerManagedCore(core:object,check:()=>void,revisions:()=>RetainedCoreRevisions):void{if(cores.has(core))throw managedSourceUnavailable();cores.set(core,{check,revisions});}
export function checkManagedCore(core:object):void{const check=cores.get(core)?.check;if(!check)throw managedSourceUnavailable();check();}
/** Last SDK-observed clocks survive disposal for status/cleanup only. They are
 * neither readable native history nor live source, persistence or authority proof. */
export function managedCoreRetainedRevisions(core:object):RetainedCoreRevisions{const revisions=cores.get(core)?.revisions;if(typeof revisions!=='function')throw managedSourceUnavailable();return {...revisions()};}
export function registerManagedSource(source:object,core:object,check:()=>void,dependencies:readonly object[]=[]):void{if(sources.has(source))throw managedSourceUnavailable();const selected=[...dependencies];if(selected.some(value=>sources.get(value)?.core!==core))throw managedSourceUnavailable();sources.set(source,{core,check,bindings:captureManagedSourceBindings(source,managedSourceUnavailable),dependencies:Object.freeze(selected)});}
/** Pure binding graph inspection, not an early liveness/permission callback.
 * Dependencies are earlier genuine registrations, never incoming source DTOs. */
export function checkManagedSourceBindings(source:object):void{const pending=[source],seen=new Set<object>();while(pending.length){const value=pending.pop()!;if(seen.has(value))continue;seen.add(value);const port=sources.get(value);if(!port)throw managedSourceUnavailable();port.bindings();pending.push(...port.dependencies);}}
/** Read only the genuine registration, not a mutable public core property.
 * Readable retired history is still allowed here; managed liveness is separate. */
export function managedSourceCore(source:object):object{const port=sources.get(source);if(!port)throw managedSourceUnavailable();checkManagedSourceBindings(source);return port.core;}
export function checkManagedSource(source:object,core:object):void{const port=sources.get(source);if(!port||port.core!==core)throw managedSourceUnavailable();checkManagedSourceBindings(source);port.check();checkManagedSourceBindings(source);checkManagedCore(core);}
