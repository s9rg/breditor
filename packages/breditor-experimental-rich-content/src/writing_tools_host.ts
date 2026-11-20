/** Borrowed read/navigation port; the owning DOM coordinator retains every publication. */
import type {RichWritingToolsRead,RichWritingHeading} from "./writing_tools_types.js";
export interface RichWritingToolsHostState {readonly revision:string;readonly closed:boolean;readonly busy:boolean;readonly composing:boolean;readonly available:boolean;readonly readOnly:boolean}
export interface RichWritingToolsHost {
 readonly surface:HTMLElement;
 writingState():RichWritingToolsHostState;
 subscribeWriting(listener:()=>void):()=>void;
 readWritingTools(revision?:string):RichWritingToolsRead;
 selectWritingHeading(read:RichWritingToolsRead,index:number,revision?:string):Promise<void>;
 /** Optional chrome catalog (the editor's `uiLocale()`); custom ports that omit it keep the English defaults. */
 uiLocale?():import("./ui_locale.js").RichUiLocale;
}
/** @internal Parsed metadata alone is not a source belonging to this borrowed host. */
export class RichWritingReadRegistry {
 readonly #reads=new WeakSet<RichWritingToolsRead>();
 retain(read:RichWritingToolsRead,revision:string):RichWritingToolsRead{if(read.revision!==revision)throw Error("Writing read belongs to another publication");if(!Object.isFrozen(read)||!Object.isFrozen(read.schema)||!Object.isFrozen(read.counts)||!Object.isFrozen(read.outline)||!read.outline.every(Object.isFrozen))throw Error("Use immutable native writing metadata");this.#reads.add(read);return read;}
 heading(read:RichWritingToolsRead,index:number,revision:string):RichWritingHeading{if(!this.#reads.has(read)||read.revision!==revision)throw Error("Use this writing host's exact source read");if(!Number.isSafeInteger(index)||index<0||index>=read.outline.length)throw RangeError("Writing outline index is outside this read");return read.outline[index]!;}
}
/** @internal Independent read notifications; they never grant reentrant publication. */
export class RichWritingEvents {
 readonly #listeners=new Set<()=>void>();#notifying=false;
 get notifying():boolean{return this.#notifying;}
 subscribe(listener:()=>void):()=>void{this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 emit(report:(error:unknown)=>void):void{if(this.#notifying)return;this.#notifying=true;try{for(const listener of [...this.#listeners])try{listener();}catch(error){report(error);}}finally{this.#notifying=false;}}
 clear():void{this.#listeners.clear();}
}
