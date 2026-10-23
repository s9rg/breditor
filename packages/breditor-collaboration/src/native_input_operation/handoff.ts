/** Internal native/upload transfer. Wrappers are constructed while closed;
 * fresh authority checks precede a callback-free current-state barrier. Only
 * genuine parent reservations use this control; it is never a saved capability. */
import type {RichAssetStore} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import {prepareSourceUploadHandoff} from '../operation_cohort/source_handoff.js';

export interface NativeInputHandoffParts<P extends SharedSelectionPolicy>{
 readonly source:Readonly<{session:Session<P>}>;
 readonly uploads:RichAssetStore;
 readonly input:Readonly<{file():Blob;blob(asset:string,generation:string):Blob|undefined}>;
}
export interface NativeInputHandoff<P extends SharedSelectionPolicy>{
 readonly value:Readonly<NativeInputHandoffParts<P>>;
 check():void;
 checkCurrent():void;
 /** Prevalidated private consumption only: no new wrappers, policy or await. */
 consume():void;
 abandon():void;
}
export function prepareNativeInputHandoff<P extends SharedSelectionPolicy>(o:{
 readonly source:Session<P>;readonly check:()=>void;readonly current:()=>void;
 readonly uploads:()=>RichAssetStore;readonly release:()=>void;
 readonly file:()=>Blob;readonly blob:(asset:string,generation:string)=>Blob|undefined;
 readonly closed:()=>Error;
}):NativeInputHandoff<P>{
 return prepareSourceUploadHandoff({...o,createParts(readSource,readUploads){
  const source=Object.freeze({get session(){return readSource();}});
  const input=Object.freeze({file(){readSource();return o.file();},blob(asset:string,generation:string){readSource();return o.blob(asset,generation);}});
  return Object.freeze({get source(){readSource();return source;},get uploads(){return readUploads();},get input(){readSource();return input;}});
 }});
}
