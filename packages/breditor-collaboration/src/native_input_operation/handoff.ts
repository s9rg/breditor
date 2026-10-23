/** Internal native/upload transfer. Wrappers are constructed while closed;
 * fresh authority checks precede a callback-free current-state barrier. Only
 * genuine parent reservations use this control; it is never a saved capability. */
import type {RichAssetStore} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';

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
 let finished=false,committed=false,checked=false,uploads:RichAssetStore|undefined;
 const pending=()=>{if(finished)throw o.closed();};
 const ready=()=>{if(!committed||!uploads)throw o.closed();};
 const source=Object.freeze({get session(){ready();return o.source;}});
 const input=Object.freeze({file(){ready();return o.file();},blob(asset:string,generation:string){ready();return o.blob(asset,generation);}});
 const value=Object.freeze({get source(){ready();return source;},get uploads(){ready();return uploads!;},get input(){ready();return input;}});
 // The private control is not passed through a host construction hook.
 return{value,
  check(){pending();checked=false;o.check();pending();checked=true;},
  checkCurrent(){pending();if(!checked)throw o.closed();o.current();pending();},
  consume(){pending();if(!checked)throw o.closed();uploads=o.uploads();o.release();finished=true;committed=true;},
  abandon(){if(finished)return;finished=true;o.release();},
 };
}
