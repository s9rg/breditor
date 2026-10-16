import type {SharedRustOwner,SharedView,SharedDispatch,SharedPublication,SharedEditorOptions,SharedRemoteOptions,SharedOwnerDescriptor,SharedPresenceResolution,SharedWriterClock,SharedWriterGroups,RichSelection,FormatLiteral,ClipboardContent,PasteTarget,Navigation,NavigationResult} from "./types.js";
import type {RichInlineFormatStateRead} from "./types.js";
import {sharedProtocolLanguage} from "./protocol.js";
export class SharedEditorError extends Error {
 constructor(readonly code:string,message:string){super(message);this.name="SharedEditorError";}
}
interface Pending {frame:string;bytes:number;resolve:(changed:boolean)=>void;reject:(reason:unknown)=>void;cleanup:()=>void}
const owners=new WeakSet<SharedRustOwner>();
/** Owns the exact Rust observation and bounded remote queue; no replicated JS document exists. */
export class SharedRichEditor {
 #raw:SharedRustOwner|undefined;#observation:ReturnType<SharedRustOwner["observe"]>|undefined;#view="";#descriptor="";
 #listeners=new Set<(event:SharedPublication)=>void>();#queue:Pending[]=[];#bytes=0;#holds=0;#publishing=false;#draining=false;#retired=false;
 #options:SharedEditorOptions;#maxFrames:number;#maxBytes:number;#fixedHistory:"explicit"|"typing-v1"|undefined;
 constructor(raw:SharedRustOwner,options:SharedEditorOptions={}){
  if(owners.has(raw))throw new SharedEditorError("owner_reused","A Rust owner can only be transferred once");
  this.#options=options;this.#maxFrames=options.maxPendingFrames??64;this.#maxBytes=options.maxPendingBytes??8*1024*1024;
  this.#raw=raw;
  try{if(!Number.isSafeInteger(this.#maxFrames)||this.#maxFrames<1||this.#maxFrames>64||!Number.isSafeInteger(this.#maxBytes)||this.#maxBytes<1||this.#maxBytes>8*1024*1024)throw new SharedEditorError("queue_limits","Remote limits can only tighten defaults");if(typeof raw.descriptor_json!=="function")throw new SharedEditorError("owner_abi","Use the matching shared Rust owner");this.#descriptor=raw.descriptor_json();const descriptor=JSON.parse(this.#descriptor) as SharedOwnerDescriptor;if(descriptor.format!=="breditor/shared-rich-owner"||sharedProtocolLanguage(descriptor)===undefined)throw new SharedEditorError("owner_abi","Unsupported shared Rust ABI/model/history revision");this.#observation=raw.observe();this.#view=this.#observation.view_json();const view=this.view();if(view.format!=="breditor/shared-rich-view"||view.formatVersion!==1)throw new SharedEditorError("owner_abi","Use the matching shared Rust owner");owners.add(raw);}
  catch(error){this.#observation?.free();this.#raw=undefined;raw.free();throw error;}
 }
 #live():SharedRustOwner{if(!this.#raw)throw new SharedEditorError("disposed","The shared editor is disposed");return this.#raw;}
 #check(revision?:string):void{this.#live();if(revision!==undefined&&revision!==this.view().revision)throw new SharedEditorError("stale_observation","The request was prepared from an older shared publication");}
 #report(error:unknown):void{try{this.#options.onError?.(error);}catch{/* A callback cannot rewind committed content. */}}
 #notify(source:"local"|"remote"):void{for(const listener of [...this.#listeners]){if(!this.#raw)break;try{listener({source,view:this.view()});}catch(error){this.#report(error);}}}
 #run<T>(source:"local"|"remote",work:(raw:SharedRustOwner,observation:unknown)=>T,revision?:string,write=true):T{
  this.#check(revision);if(this.#retired)throw new SharedEditorError("retired","The shared writer is retired for durable closure");if(this.#publishing)throw new SharedEditorError("reentrant_publication","Publication callbacks cannot publish reentrantly");
  if(write&&this.view().readOnly===true)throw new SharedEditorError("read_only","The shared editor is read-only");
  const raw=this.#live(),before=this.#view;this.#publishing=true;
  try{const result=work(raw,this.#observation);const next=raw.observe(),view=next.view_json();this.#observation?.free();this.#observation=next;this.#view=view;if(before!==view)this.#notify(source);return result;}
  finally{this.#publishing=false;if(!this.#draining)this.#flush();}
 }
 view():SharedView{this.#live();return JSON.parse(this.#view) as SharedView;}
 descriptor():SharedOwnerDescriptor{this.#live();return JSON.parse(this.#descriptor) as SharedOwnerDescriptor;}
 richLanguageVersion():1|2{return this.descriptor().richLanguageVersion===2?2:1;}
 documentJson():string{return this.view().documentJson;}
 /** Read the same core property-state contract under the current opaque observation. */
 supportsInlineFormatState():boolean{return typeof this.#live().inline_format_state_json==="function";}
 supportsStandardInlineControls():boolean{return this.supportsInlineFormatState()&&typeof this.#live().caret_formats_json==="function";}
 supportsInlinePropertyPatches():boolean{return typeof this.#live().patch_inline_format_properties==="function";}
 supportsReadOnly():boolean{const raw=this.#live();return typeof raw.read_only_version==="function"&&raw.read_only_version()==="1"&&typeof raw.set_read_only==="function";}
 setReadOnly(value:boolean,revision?:string):boolean{if(typeof value!=="boolean")throw new TypeError("readOnly must be Boolean");return this.#run("local",(raw,o)=>{if(!this.supportsReadOnly())throw new SharedEditorError("read_only_unavailable","Use a matching native owner with read-only enforcement");return raw.set_read_only!(o,value);},revision,false);}
 /** Field-only intent is planned and admitted in Rust, never lowered from a mutable JS AST. */
 patchInlineFormatProperties(request:{format:FormatLiteral;properties:readonly string[];targets:readonly {block:string;offset:number;length:number}[]},revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!raw.patch_inline_format_properties)throw new SharedEditorError("property_patch_unavailable","Use a matching Rust owner with inline property-patch support");return raw.patch_inline_format_properties(o,JSON.stringify({formatsJson:JSON.stringify([request.format]),properties:request.properties,targets:request.targets}));},revision);}
 caretFormats():readonly FormatLiteral[]{const raw=this.#live();if(!raw.caret_formats_json)throw new SharedEditorError("caret_formats_unavailable","Use a matching Rust owner with caret-format reads");return JSON.parse(raw.caret_formats_json(this.#observation)) as FormatLiteral[];}
 inlineFormatState(kind:string):RichInlineFormatStateRead{const raw=this.#live();if(!raw.inline_format_state_json)throw new SharedEditorError("inline_state_unavailable","Use a matching Rust owner with formatting-state support");if(typeof kind!=="string"||kind.length>128)throw new SharedEditorError("inline_state_kind","Expected a bounded declared format kind");return JSON.parse(raw.inline_format_state_json(this.#observation,kind)) as RichInlineFormatStateRead;}
 supportsTypingHistory():boolean{const raw=this.#live();return typeof raw.typing_history_version==="function"&&raw.typing_history_version()==="1"&&[raw.enable_typing_history,raw.close_typing_group,raw.insert_typing_text,raw.delete_typing_range,raw.typing_checkpoint].every(method=>typeof method==="function");}
 #typingOwner():SharedRustOwner{if(!this.supportsTypingHistory())throw new SharedEditorError("typing_history_unavailable","Use a matching native shared typing-history owner");return this.#live();}
 enableTypingHistory(revision?:string):boolean{return this.#run("local",(_raw,o)=>{if(this.#fixedHistory==="explicit")throw new SharedEditorError("history_policy","This durable session's history policy is immutable");return this.#typingOwner().enable_typing_history!(o);},revision,false);}
 /** An owning durable session seals its selected policy after native admission, not its content. */
 sealHistoryPolicy(policy:"explicit"|"typing-v1"):void{this.#live();if((policy!=="explicit"&&policy!=="typing-v1")||(this.#fixedHistory!==undefined&&this.#fixedHistory!==policy)||(this.view().historyGrouping==="typing-v1"?"typing-v1":"explicit")!==policy)throw new SharedEditorError("history_policy","History policy does not match the native owner");this.#fixedHistory=policy;}
 closeTypingGroup(revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#typingOwner().close_typing_group!(o),revision,false);}
 /** Named user input only; programmatic type/paste/composition remain explicit. */
 typeUser(text:string,clockMs:string,revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#typingOwner().insert_typing_text!(o,JSON.stringify({text,clockMs})),revision);}
 deleteUserRange(selection:Extract<RichSelection,{kind:"text"}>,direction:"backward"|"forward",clockMs:string,revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#typingOwner().delete_typing_range!(o,JSON.stringify({selection,direction,clockMs})),revision);}
 checkpointJson():string{return this.view().historyGrouping==="typing-v1"?this.#typingOwner().typing_checkpoint!():this.#live().checkpoint();}
 updateFrame():string{return this.#live().update_frame();}
 /** Separate read capability; neither method publishes, imports content or changes local UI. */
 supportsPresence():boolean{const raw=this.#live();return typeof raw.presence_frame==="function"&&typeof raw.resolve_presence==="function";}
 presenceFrame():string{const raw=this.#live();if(!raw.presence_frame)throw new SharedEditorError("presence_unavailable","Use a Rust owner with the causal presence capability");return raw.presence_frame(this.#observation);}
 resolvePresence(frame:string):SharedPresenceResolution{const raw=this.#live();if(!raw.resolve_presence)throw new SharedEditorError("presence_unavailable","Use a Rust owner with the causal presence capability");return JSON.parse(raw.resolve_presence(frame)) as SharedPresenceResolution;}
 supportsWriterTransport():boolean{const raw=this.#live();return typeof raw.writer_groups==="function"&&typeof raw.writer_clock==="function";}
 writerGroups(after:string,revision?:string):SharedWriterGroups{this.#check(revision);const raw=this.#live();if(!raw.writer_groups)throw new SharedEditorError("writer_transport_unavailable","Use a Rust owner with single-writer transport support");if(typeof after!=="string"||after.length>10)throw new SharedEditorError("writer_counter","Expected a bounded decimal author counter");return JSON.parse(raw.writer_groups(this.#observation,after)) as SharedWriterGroups;}
 writerClock(writer:string):SharedWriterClock{const raw=this.#live();if(!raw.writer_clock)throw new SharedEditorError("writer_transport_unavailable","Use a Rust owner with single-writer transport support");if(typeof writer!=="string"||writer.length>20)throw new SharedEditorError("writer_identity","Expected a bounded decimal writer identity");return JSON.parse(raw.writer_clock(writer)) as SharedWriterClock;}
 subscribe(listener:(event:SharedPublication)=>void):()=>void{this.#live();this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 /** Hold remote publication across input/composition/callback queues. Release is idempotent. */
 holdRemotes():()=>void{this.#live();if(this.#retired)throw new SharedEditorError("retired","The shared writer is retired for durable closure");if(this.#holds>=128)throw new SharedEditorError("hold_limit","Too many nested remote holds");this.#holds++;let held=true;return()=>{if(!held)return;held=false;this.#holds--;this.#flush();};}
 dispatch(request:SharedDispatch,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.dispatch(o,JSON.stringify(request)),revision);}
 select(selection:RichSelection|null,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.set_selection(o,JSON.stringify(selection)),revision,false);}
 setPendingFormats(formats:readonly FormatLiteral[]|null,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.set_pending_formats(o,JSON.stringify(formats)),revision);}
 type(text:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.insert_plain_text(o,text),revision);}
 /** One LF in the current text selection; old ABI owners retain their identical plain-input path. */
 hardBreak(revision?:string):boolean{return this.#run("local",(raw,o)=>raw.insert_hard_break?raw.insert_hard_break(o):raw.insert_plain_text(o,"\n"),revision);}
 replace(selection:Extract<RichSelection,{kind:"text"}>,text:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.replace_plain_text(o,JSON.stringify(selection),text),revision);}
 paste(fragment:string,target:PasteTarget,prefix:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.paste_clipboard_namespace(o,fragment,JSON.stringify(target),prefix),revision);}
 pasteAtText(fragment:string,right:string,prefix:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.paste_flow_at_text_namespace(o,fragment,right,prefix),revision);}
 navigate(movement:Navigation,extend=false,revision?:string):NavigationResult{return this.#run("local",(raw,o)=>JSON.parse(raw.navigate_grid(o,movement,extend)) as NavigationResult,revision,false);}
 copy():ClipboardContent|null{const raw=this.#live();return JSON.parse(raw.copy_clipboard(this.#observation)) as ClipboardContent|null;}
 undo(revision?:string):boolean{return this.#run("local",(raw,o)=>raw.undo_observed(o),revision);}
 redo(revision?:string):boolean{return this.#run("local",(raw,o)=>raw.redo_observed(o),revision);}
 /** Resolves only after Rust admission. A hold queues bytes, not a guessed document mutation. */
 receiveFrame(frame:string,options:SharedRemoteOptions={}):Promise<boolean>{
  this.#live();if(this.#retired)return Promise.reject(new SharedEditorError("retired","The shared writer is retired before remote admission"));if(typeof frame!=="string")return Promise.reject(new SharedEditorError("remote_type","A remote frame must be an exact JSON string"));const bytes=new TextEncoder().encode(frame).byteLength;
  if(options.signal?.aborted)return Promise.reject(new SharedEditorError("remote_cancelled","Queued remote publication was cancelled"));
  if(bytes>5*1024*1024||this.#queue.length>=this.#maxFrames||this.#bytes+bytes>this.#maxBytes)return Promise.reject(new SharedEditorError("remote_queue_full","Pending remote updates exceed their bounded queue"));
  return new Promise((resolve,reject)=>{
   const signal=options.signal,entry:Pending={frame,bytes,resolve,reject,cleanup:()=>signal?.removeEventListener("abort",cancel)};
   const cancel=()=>{const index=this.#queue.indexOf(entry);if(index<0)return;this.#queue.splice(index,1);this.#bytes-=bytes;entry.cleanup();reject(new SharedEditorError("remote_cancelled","Queued remote publication was cancelled"));};
   this.#queue.push(entry);this.#bytes+=bytes;signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)cancel();this.#flush();
  });
 }
 pendingRemote():Readonly<{frames:number;bytes:number}>{this.#live();return {frames:this.#queue.length,bytes:this.#bytes};}
 #flush():void{
  if(!this.#raw||this.#retired||this.#holds||this.#publishing||this.#draining)return;this.#draining=true;
   try{while(this.#raw&&!this.#retired&&!this.#holds&&this.#queue.length){const next=this.#queue.shift()!;this.#bytes-=next.bytes;next.cleanup();try{const before=this.#view;this.#run("remote",raw=>raw.receive_frame(next.frame),undefined,false);next.resolve(before!==this.#view);}catch(error){next.reject(error);this.#report(error);}}}
  finally{this.#draining=false;}
 }
 /** Permanent UI/transport retirement, not document read-only mode. Reads survive until explicit disposal. */
 retire():void{
  this.#live();if(this.#retired)return;this.#retired=true;
  const pending=this.#queue;this.#queue=[];this.#bytes=0;
  const error=new SharedEditorError("retired","The shared writer retired before queued remote admission");
  for(const entry of pending){entry.cleanup();entry.reject(error);}
 }
 dispose():void{if(!this.#raw)return;const raw=this.#raw;this.#raw=undefined;this.#listeners.clear();const error=new SharedEditorError("disposed","The shared editor was disposed before remote admission");for(const entry of this.#queue){entry.cleanup();entry.reject(error);}this.#queue=[];this.#bytes=0;this.#observation?.free();this.#observation=undefined;raw.free();}
}
