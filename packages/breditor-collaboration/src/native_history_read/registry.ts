/** Genuine capture registrations and lifetime-checked native reads. No raw owner escapes. */
import {SharedEditorError,type SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {nativeHistoryIntrinsics as native} from './intrinsics.js';
import type {CapturedNativeHistoryKind,CapturedNativeHistoryRead,CapturedNativeHistorySelection} from './contract.js';

interface Source {
 core:SharedRichEditor<SharedSelectionPolicy>;guard:()=>void;
 documentKind:CapturedNativeHistoryKind;reviewKind:CapturedNativeHistoryKind|null;
 documentStamp:object;reviewStamp:object|null;
 read:CapturedNativeHistoryRead;
}
const sources=new WeakMap<object,Source>(),readers=new WeakMap<object,object>();
const unavailable=()=>new SharedEditorError('captured_history_source','Use the unchanged genuine capture and its explicitly selected native history lanes');
function checked(source:object,complete=false):Source{
 const state=sources.get(source);if(!state)throw unavailable();if(complete){const {guard}=state;guard();}const stamp=coreReadStamp(state.core);
 if(sources.get(source)!==state||
  (native.documentKind.call(state.core)??'original')!==state.documentKind||
  native.reviewKind.call(state.core)!==state.reviewKind||
  stamp.document!==state.documentStamp||state.reviewStamp!==null&&stamp.review!==state.reviewStamp)throw unavailable();
 return state;
}
/** Every read borrows the current registry entry only for its synchronous call.
 * A saved read closure therefore cannot retain the core after capture disposal. */
function read<T>(source:object,operation:(core:SharedRichEditor<SharedSelectionPolicy>)=>T):T{
 const state=checked(source),value=operation(state.core);if(checked(source)!==state)throw unavailable();return value;
}
/** Only genuine SDK capture constructors register; this is not a package-root export. */
export function registerCapturedNativeHistory<P extends SharedSelectionPolicy>(source:object,core:SharedRichEditor<P>,selection:CapturedNativeHistorySelection,guard:()=>void):void{
 if(sources.has(source))throw unavailable();guard();
 const documentKind=native.documentKind.call(core)??'original',reviewKind=native.reviewKind.call(core),stamp=coreReadStamp(core);
 if(documentKind!==selection.document.kind||native.checkpointJson.call(core)!==selection.document.checkpoint)throw unavailable();
 if(selection.review&&(reviewKind!==selection.review.kind||
  (reviewKind==='segmented-v1'?native.reviewSegmentedCheckpoint:native.reviewCheckpoint).call(core)!==selection.review.checkpoint))throw unavailable();
 guard();
 const document=Object.freeze({kind:documentKind,
  descriptor:()=>read(source,core=>native.descriptor.call(core)),
  checkpointJson:()=>read(source,core=>native.checkpointJson.call(core)),
  writerClock:(writer:string)=>read(source,core=>native.writerClock.call(core,writer)),
  writerClockV2:(writer:string)=>read(source,core=>native.writerClockV2.call(core,writer)),
  supportsWriterPrefixRead:()=>read(source,core=>native.supportsWriterPrefixRead.call(core)),
  writerClockAt:(writer:string,through:string,version:1|2=1)=>read(source,core=>native.writerClockAt.call(core,writer,through,version)),
  writerGroups:(after:string,revision?:string)=>read(source,core=>native.writerGroups.call(core,after,revision)),
  writerGroupsV2:(after:string,revision?:string)=>read(source,core=>native.writerGroupsV2.call(core,after,revision)),
 });
 const review=selection.review?Object.freeze({kind:selection.review.kind,
  checkpointJson:()=>read(source,core=>(reviewKind==='segmented-v1'?native.reviewSegmentedCheckpoint:native.reviewCheckpoint).call(core)),
  reviewWriterClock:(actor:string,principal:string,through?:string)=>read(source,core=>native.reviewWriterClock.call(core,actor,principal,through)),
  localReviewClock:()=>read(source,core=>native.localReviewClock.call(core)),
 }):reviewKind===null?Object.freeze({kind:'absent' as const}):Object.freeze({kind:'unselected' as const,nativeKind:reviewKind});
 const capability=Object.freeze({document,review,check:()=>{checked(source,true);}}) as CapturedNativeHistoryRead;
 sources.set(source,{core,guard,documentKind,reviewKind,documentStamp:stamp.document,reviewStamp:selection.review?stamp.review:null,read:capability});readers.set(capability,source);
 try{checked(source,true);}catch(error){sources.delete(source);readers.delete(capability);throw error;}
}
/** Release borrowed state only; no session, native core, lease or store is closed. */
export function releaseCapturedNativeHistory(source:object):void{const state=sources.get(source);if(state)readers.delete(state.read);sources.delete(source);}
/** DTOs, copied methods, metadata and disposed captures never obtain a native reader. */
export function capturedNativeHistoryRead(source:object):CapturedNativeHistoryRead{return checked(source,true).read;}
/** Runtime admission remains separate from the TypeScript-only opaque brand. */
export function checkCapturedNativeHistoryRead(capability:CapturedNativeHistoryRead):void{
 const source=readers.get(capability);if(!source||checked(source,true).read!==capability)throw unavailable();
}
/** Internal final native fence after all policy/wrapper callbacks. It checks the
 * same actual registry owner and native lane epochs without invoking its guard.
 * This is not fresh permission, retained-store evidence or source lease custody. */
export function capturedNativeHistoryFinalCheck(capability:CapturedNativeHistoryRead):()=>void{
 const source=readers.get(capability);if(!source)throw unavailable();const state=checked(source,true);if(state.read!==capability)throw unavailable();
 return()=>{if(readers.get(capability)!==source||checked(source)!==state||state.read!==capability)throw unavailable();};
}
