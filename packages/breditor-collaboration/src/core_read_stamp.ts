/** Private live read identities. Unlike retained status clocks, disposal always refuses. */
export interface CoreReadStamp {readonly document:object;readonly review:object}
const readers=new WeakMap<object,()=>CoreReadStamp>();
const unavailable=()=>Object.assign(new Error('The actual live native read owner is unavailable'),{code:'core_read_unavailable'});
/** Genuine facade construction only; no callbacks or stamps are package-root exports. */
export function registerCoreReadStamp(core:object,read:()=>CoreReadStamp):void{if(readers.has(core))throw unavailable();readers.set(core,read);}
export function coreReadStamp(core:object):CoreReadStamp{const read=readers.get(core);if(!read)throw unavailable();const stamp=read();return{document:stamp.document,review:stamp.review};}
