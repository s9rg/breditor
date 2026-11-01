/** SDK-private scalar reads of the actual current native publication.
 * This is liveness/observation DATA, never a writer or recovery capability.
 * Public view() still returns an independent mutable copy of the full view. */
export interface CoreReadState {readonly documentRevision:string;readonly readOnly:boolean}
const readers=new WeakMap<object,()=>CoreReadState>();
const unavailable=()=>Object.assign(new Error('Use the actual live native publication'),{code:'core_read_unavailable'});
/** Only the genuine facade constructor registers its private live reader. */
export function registerCoreReadState(core:object,read:()=>CoreReadState):void{if(readers.has(core))throw unavailable();readers.set(core,read);}
/** The facade checks native lifetime on every call, including cached reads. */
export function coreReadState(core:object):CoreReadState{const read=readers.get(core);if(!read)throw unavailable();return read();}
