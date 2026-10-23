/** Closed source/upload wrappers for genuine internal parent reservations.
 * Parts are constructed before final verification; only private callback-free
 * consumption opens them. No serialized marker supplies the held source. */
import type {RichAssetStore} from '@breditor/experimental-rich-content';
export interface SourceUploadHandoff<T>{readonly value:T;check():void;checkCurrent():void;consume():void;abandon():void}
export function prepareSourceUploadHandoff<S,T>(o:{
 readonly source:S;readonly createParts:(source:()=>S,uploads:()=>RichAssetStore)=>T;
 readonly check:()=>void;readonly current:()=>void;readonly uploads:()=>RichAssetStore;
 readonly release:()=>void;readonly closed:()=>Error;
}):SourceUploadHandoff<T>{
 let finished=false,committed=false,checked=false,uploads:RichAssetStore|undefined;
 const pending=()=>{if(finished)throw o.closed();},ready=()=>{if(!committed||!uploads)throw o.closed();};
 const value=o.createParts(()=>{ready();return o.source;},()=>{ready();return uploads!;});
 // This control never crosses a caller construction hook.
 return{value,
  check(){pending();checked=false;o.check();pending();checked=true;},
  checkCurrent(){pending();if(!checked)throw o.closed();o.current();pending();},
  consume(){pending();if(!checked)throw o.closed();uploads=o.uploads();o.release();finished=true;committed=true;},
  abandon(){if(finished)return;finished=true;o.release();},
 };
}
