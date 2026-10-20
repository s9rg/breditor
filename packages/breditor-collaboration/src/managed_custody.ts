/** Internal live-custody admission, separate from readable backup/history capture.
 * Only genuine constructors register their private lifecycle checks. No edit, native
 * hold, save, callback publication or read-only policy change is used as a probe. */
const cores=new WeakMap<object,()=>void>();
const sources=new WeakMap<object,{core:object;check:()=>void}>();
export const managedSourceUnavailable=()=>Object.assign(new Error("The readable source no longer has live managed custody"),{code:"managed_source_unavailable"});
export function registerManagedCore(core:object,check:()=>void):void{if(cores.has(core))throw managedSourceUnavailable();cores.set(core,check);}
export function checkManagedCore(core:object):void{const check=cores.get(core);if(!check)throw managedSourceUnavailable();check();}
export function registerManagedSource(source:object,core:object,check:()=>void):void{if(sources.has(source))throw managedSourceUnavailable();sources.set(source,{core,check});}
export function checkManagedSource(source:object,core:object):void{const port=sources.get(source);if(!port||port.core!==core)throw managedSourceUnavailable();port.check();checkManagedCore(core);}
