/** Borrowed UI port. Results remain opaque Rust reads; the DOM coordinator owns all publications. */
import type {RichSearchQuery,RichSearchReplacement,RichSearchResults} from "./core.js";
export interface RichSearchHostState {
 readonly revision:string;readonly closed:boolean;readonly busy:boolean;readonly composing:boolean;
 readonly available:boolean;readonly readOnly:boolean;readonly canReplace:boolean;
}
export interface RichSearchHost<R extends RichSearchResults=RichSearchResults> {
 readonly surface:HTMLElement;
 searchState():RichSearchHostState;
 /** Read-only notifications; listeners must not publish reentrantly. */
 subscribeSearch(listener:()=>void):()=>void;
 findText(query:RichSearchQuery,revision?:string):R;
 checkSearchResults(results:R,revision?:string):void;
 selectSearchMatch(results:R,index:string,revision?:string):Promise<void>;
 replaceSearchOne(results:R,index:string,replacement:RichSearchReplacement,revision?:string):Promise<void>;
 replaceSearchAll(results:R,replacement:RichSearchReplacement,revision?:string):Promise<void>;
 focus():void;
 /** Optional chrome catalog (the editor's `uiLocale()`); custom ports that omit it keep the English defaults. */
 uiLocale?():import("./ui_locale.js").RichUiLocale;
}
/** Completion is independent of display callbacks: a native commit cannot be rewound by rendering. */
export interface RichSearchCompletion {resolve:()=>void;reject:(error:unknown)=>void}
/** @internal New read channel only; old command/callback contracts are not widened. */
export class RichSearchEvents {
 #listeners=new Set<()=>void>();#notifying=false;
 get notifying():boolean{return this.#notifying;}
 subscribe(listener:()=>void):()=>void{this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 emit(report:(error:unknown)=>void):void{if(this.#notifying)return;this.#notifying=true;try{for(const listener of [...this.#listeners])try{listener();}catch(error){report(error);}}finally{this.#notifying=false;}}
 clear():void{this.#listeners.clear();}
}
