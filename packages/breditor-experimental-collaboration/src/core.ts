import type {SharedRustOwner,SharedView,SharedDispatch,SharedPublication,SharedEditorOptions,SharedOwnerDescriptor,RichSelection,FormatLiteral,ClipboardContent,PasteTarget,Navigation,NavigationResult} from "./types.js";
export class SharedEditorError extends Error {
 constructor(readonly code:string,message:string){super(message);this.name="SharedEditorError";}
}
interface Pending {frame:string;bytes:number;resolve:(changed:boolean)=>void;reject:(reason:unknown)=>void}
const owners=new WeakSet<SharedRustOwner>();
/** Owns the exact Rust observation and bounded remote queue; no replicated JS document exists. */
export class SharedRichEditor {
 #raw:SharedRustOwner|undefined;#observation:ReturnType<SharedRustOwner["observe"]>|undefined;#view="";#descriptor="";
 #listeners=new Set<(event:SharedPublication)=>void>();#queue:Pending[]=[];#bytes=0;#holds=0;#publishing=false;#draining=false;
 #options:SharedEditorOptions;#maxFrames:number;#maxBytes:number;
 constructor(raw:SharedRustOwner,options:SharedEditorOptions={}){
  if(owners.has(raw))throw new SharedEditorError("owner_reused","A Rust owner can only be transferred once");
  this.#options=options;this.#maxFrames=options.maxPendingFrames??64;this.#maxBytes=options.maxPendingBytes??8*1024*1024;
  if(!Number.isSafeInteger(this.#maxFrames)||this.#maxFrames<1||this.#maxFrames>64||!Number.isSafeInteger(this.#maxBytes)||this.#maxBytes<1||this.#maxBytes>8*1024*1024)throw new SharedEditorError("queue_limits","Remote limits can only tighten defaults");
  this.#raw=raw;
  try{if(typeof raw.descriptor_json!=="function")throw new SharedEditorError("owner_abi","Use the matching shared Rust owner");this.#descriptor=raw.descriptor_json();const descriptor=JSON.parse(this.#descriptor) as SharedOwnerDescriptor;if(descriptor.format!=="breditor/shared-rich-owner"||descriptor.abiVersion!==1||descriptor.modelVersion!==11||descriptor.journalVersion!==12)throw new SharedEditorError("owner_abi","Unsupported shared Rust ABI/model/history revision");this.#observation=raw.observe();this.#view=this.#observation.view_json();const view=this.view();if(view.format!=="breditor/shared-rich-view"||view.formatVersion!==1)throw new SharedEditorError("owner_abi","Use the matching shared Rust owner");owners.add(raw);}
  catch(error){this.#observation?.free();this.#raw=undefined;raw.free();throw error;}
 }
 #live():SharedRustOwner{if(!this.#raw)throw new SharedEditorError("disposed","The shared editor is disposed");return this.#raw;}
 #check(revision?:string):void{this.#live();if(revision!==undefined&&revision!==this.view().revision)throw new SharedEditorError("stale_observation","The request was prepared from an older shared publication");}
 #report(error:unknown):void{try{this.#options.onError?.(error);}catch{/* A callback cannot rewind committed content. */}}
 #notify(source:"local"|"remote"):void{for(const listener of [...this.#listeners]){if(!this.#raw)break;try{listener({source,view:this.view()});}catch(error){this.#report(error);}}}
 #run<T>(source:"local"|"remote",work:(raw:SharedRustOwner,observation:unknown)=>T,revision?:string):T{
  this.#check(revision);if(this.#publishing)throw new SharedEditorError("reentrant_publication","Publication callbacks cannot publish reentrantly");
  const raw=this.#live(),before=this.#view;this.#publishing=true;
  try{const result=work(raw,this.#observation);const next=raw.observe(),view=next.view_json();this.#observation?.free();this.#observation=next;this.#view=view;if(before!==view)this.#notify(source);return result;}
  finally{this.#publishing=false;if(!this.#draining)this.#flush();}
 }
 view():SharedView{this.#live();return JSON.parse(this.#view) as SharedView;}
 descriptor():SharedOwnerDescriptor{this.#live();return JSON.parse(this.#descriptor) as SharedOwnerDescriptor;}
 documentJson():string{return this.view().documentJson;}
 checkpointJson():string{return this.#live().checkpoint();}
 updateFrame():string{return this.#live().update_frame();}
 subscribe(listener:(event:SharedPublication)=>void):()=>void{this.#live();this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 /** Hold remote publication across input/composition/callback queues. Release is idempotent. */
 holdRemotes():()=>void{this.#live();if(this.#holds>=128)throw new SharedEditorError("hold_limit","Too many nested remote holds");this.#holds++;let held=true;return()=>{if(!held)return;held=false;this.#holds--;this.#flush();};}
 dispatch(request:SharedDispatch,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.dispatch(o,JSON.stringify(request)),revision);}
 select(selection:RichSelection|null,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.set_selection(o,JSON.stringify(selection)),revision);}
 setPendingFormats(formats:readonly FormatLiteral[]|null,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.set_pending_formats(o,JSON.stringify(formats)),revision);}
 type(text:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.insert_plain_text(o,text),revision);}
 replace(selection:Extract<RichSelection,{kind:"text"}>,text:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.replace_plain_text(o,JSON.stringify(selection),text),revision);}
 paste(fragment:string,target:PasteTarget,prefix:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.paste_clipboard_namespace(o,fragment,JSON.stringify(target),prefix),revision);}
 pasteAtText(fragment:string,right:string,prefix:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.paste_flow_at_text_namespace(o,fragment,right,prefix),revision);}
 navigate(movement:Navigation,extend=false,revision?:string):NavigationResult{return this.#run("local",(raw,o)=>JSON.parse(raw.navigate_grid(o,movement,extend)) as NavigationResult,revision);}
 copy():ClipboardContent|null{const raw=this.#live();return JSON.parse(raw.copy_clipboard(this.#observation)) as ClipboardContent|null;}
 undo(revision?:string):boolean{return this.#run("local",(raw,o)=>raw.undo_observed(o),revision);}
 redo(revision?:string):boolean{return this.#run("local",(raw,o)=>raw.redo_observed(o),revision);}
 /** Resolves only after Rust admission. A hold queues bytes, not a guessed document mutation. */
 receiveFrame(frame:string):Promise<boolean>{
  this.#live();if(typeof frame!=="string")return Promise.reject(new SharedEditorError("remote_type","A remote frame must be an exact JSON string"));const bytes=new TextEncoder().encode(frame).byteLength;
  if(bytes>5*1024*1024||this.#queue.length>=this.#maxFrames||this.#bytes+bytes>this.#maxBytes)return Promise.reject(new SharedEditorError("remote_queue_full","Pending remote updates exceed their bounded queue"));
  return new Promise((resolve,reject)=>{this.#queue.push({frame,bytes,resolve,reject});this.#bytes+=bytes;this.#flush();});
 }
 pendingRemote():Readonly<{frames:number;bytes:number}>{this.#live();return {frames:this.#queue.length,bytes:this.#bytes};}
 #flush():void{
  if(!this.#raw||this.#holds||this.#publishing||this.#draining)return;this.#draining=true;
  try{while(this.#raw&&!this.#holds&&this.#queue.length){const next=this.#queue.shift()!;this.#bytes-=next.bytes;try{const before=this.#view;this.#run("remote",raw=>raw.receive_frame(next.frame));next.resolve(before!==this.#view);}catch(error){next.reject(error);this.#report(error);}}}
  finally{this.#draining=false;}
 }
 dispose():void{if(!this.#raw)return;const raw=this.#raw;this.#raw=undefined;this.#listeners.clear();const error=new SharedEditorError("disposed","The shared editor was disposed before remote admission");for(const entry of this.#queue)entry.reject(error);this.#queue=[];this.#bytes=0;this.#observation?.free();this.#observation=undefined;raw.free();}
}
