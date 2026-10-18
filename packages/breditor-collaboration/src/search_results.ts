/** Opaque source/actor-bound native search reads; metadata alone never grants edit authority. */
import {parseRichSearchMetadata} from "@breditor/experimental-rich-content/rendering";
import type {RichSearchMetadata,RichSearchResults} from "@breditor/experimental-rich-content";
export interface SharedNativeSearchResults {metadata_json():string;navigate(input:string):string|undefined;free():void}
const results=new WeakMap<SharedSearchResults,{owner:object;raw:SharedNativeSearchResults}>();
/** Dispose retained reads when the query closes. Frozen metadata survives disposal. */
export class SharedSearchResults implements RichSearchResults {
 readonly #metadata:RichSearchMetadata;readonly #closed:()=>void;
 /** @internal Construct through SharedRichEditor.findText. Rust independently proves ownership. */
 constructor(owner:object,raw:SharedNativeSearchResults,closed:()=>void){this.#closed=closed;try{this.#metadata=parseRichSearchMetadata(raw.metadata_json());results.set(this,{owner,raw});}catch(error){raw.free();throw error;}}
 metadata():RichSearchMetadata{return this.#metadata;}
 navigate(active:string|null,direction:"next"|"previous",wrap:boolean):string|null{const entry=results.get(this);if(!entry)throw Error("The search result is disposed");return entry.raw.navigate(JSON.stringify({active,direction,wrap}))??null;}
 dispose():void{const entry=results.get(this);if(!entry)return;results.delete(this);try{entry.raw.free();}finally{this.#closed();}}
}
/** @internal A frozen metadata clone cannot substitute for this native result. */
export function nativeSearchResults(owner:object,value:SharedSearchResults):SharedNativeSearchResults{const entry=results.get(value);if(!entry||entry.owner!==owner)throw Error("The search result is disposed or belongs to another editor");return entry.raw;}
