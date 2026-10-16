import {SharedRichEditor,SharedEditorError} from "../core.js";
import type {SharedEditorOptions,SharedRustOwner,SharedHistoryPolicy,SharedRangePolicy} from "../types.js";
import {SharedWriterLease} from "./writer_lease.js";
import {checkCheckpoint,openSessionDatabase,readSessionCheckpoint,writeSessionCheckpoint} from "./session_database.js";

export interface SharedSessionOptions {
 database:string;room:string;writer:string;
 /** Explicit journal language. Omitted/1 preserves the original model 11/journal 12 storage guard. */
 richLanguage?:1|2|3;
 /** Requested immutable history mode; an explicit opt-in may upgrade a legacy stored journal. */
 history?:SharedHistoryPolicy;
 /** Explicit replay family, independent from history grouping and native language. */
 rangeEditing?:SharedRangePolicy;
 /** Called only while this origin holds the exclusive causal writer lock. */
 create:()=>SharedRustOwner|Promise<SharedRustOwner>;
 /** Must invoke the matching Rust replay admission, never import a JSON AST in place of history. */
 restore:(checkpoint:string,history:SharedHistoryPolicy,rangeEditing?:SharedRangePolicy)=>SharedRustOwner|Promise<SharedRustOwner>;
 editor?:SharedEditorOptions;onState?:(state:SharedSaveState)=>void;onError?:(error:unknown)=>void;
}
export interface SharedSaveState {status:"saved"|"pending"|"failed"|"closed";revision:string|null;error:string|null}

/** Exact causal recovery with bounded coalesced writes and origin-wide writer exclusion. */
export class SharedPersistentSession {
 readonly core:SharedRichEditor;readonly recovered:boolean;
 #db:IDBDatabase;#lease:SharedWriterLease;#options:SharedSessionOptions;#unsubscribe:()=>void;
 #pending:{json:string;revision:string}|undefined;#running:Promise<void>|undefined;#failure:unknown;
 #saved:string|undefined;#savedRevision:string|null=null;#closed=false;
 #closeRequest:Promise<void>|undefined;#released:Promise<void>|undefined;
 private constructor(db:IDBDatabase,lease:SharedWriterLease,core:SharedRichEditor,recovered:boolean,options:SharedSessionOptions){
  this.#db=db;this.#lease=lease;this.core=core;this.recovered=recovered;this.#options=options;
  this.#unsubscribe=core.subscribe(()=>{try{this.save();}catch(error){this.#failed(error);}});
  db.onversionchange=()=>{
   // An upgrade must unblock its database, not silently destroy an unsaved native journal.
   this.core.retire();db.close();
   this.#failed(new SharedEditorError("session_versionchange","Shared storage changed; export the retired journal before explicitly discarding this writer"));
  };
 }
 static async open(options:SharedSessionOptions):Promise<SharedPersistentSession>{
  options={...options};
  if(options.richLanguage!==undefined&&options.richLanguage!==1&&options.richLanguage!==2&&options.richLanguage!==3)throw new SharedEditorError("session_identity","Expected richLanguage 1, 2 or 3");
  if(options.history!==undefined&&options.history!=="explicit"&&options.history!=="typing-v1")throw new SharedEditorError("session_history","Expected history explicit or typing-v1");
  if(options.rangeEditing!==undefined&&options.rangeEditing!=="original"&&options.rangeEditing!=="general-v1")throw new SharedEditorError("session_range","Expected rangeEditing original or general-v1");
  // Acquire before reading/restoring: a same-writer clone never becomes live first.
  const lease=await SharedWriterLease.acquire(options.room,options.writer);let db:IDBDatabase|undefined,core:SharedRichEditor|undefined;
  try{
   db=await openSessionDatabase(options.database);const checkpoint=await readSessionCheckpoint(db,[options.room,options.writer]),history=options.history??"explicit",ranges=options.rangeEditing??"original",storedRanges=checkpoint?.rangeEditing??"original";
   if(checkpoint!==null){
    if(storedRanges==="general-v1"&&(ranges!=="general-v1"||checkpoint.richLanguage!==(options.richLanguage??1)))throw new SharedEditorError("session_range","General recovery requires explicit matching rangeEditing and richLanguage");
    checkCheckpoint(checkpoint.json,options.room,options.writer,options.richLanguage,checkpoint.history,storedRanges);if(checkpoint.history==="typing-v1"&&history!=="typing-v1")throw new SharedEditorError("session_history","Grouped recovery requires explicit typing-v1 history");
   }
   const raw=await(checkpoint===null?options.create():storedRanges==="general-v1"?options.restore(checkpoint.json,checkpoint.history,storedRanges):options.restore(checkpoint.json,checkpoint.history));
   core=new SharedRichEditor(raw,options.editor);
   if(core.richLanguageVersion()!==(options.richLanguage??1))throw new SharedEditorError("session_identity","Shared owner language does not match the explicitly selected session");
   if(history==="typing-v1")core.enableTypingHistory();
   else if(core.view().historyGrouping!==undefined)throw new SharedEditorError("session_history","Explicit history cannot flatten a grouped owner");
   core.sealHistoryPolicy(history);
   if(ranges==="general-v1")core.enableGeneralRanges();
   core.sealRangePolicy(ranges);
   checkCheckpoint(core.checkpointJson(),options.room,options.writer,options.richLanguage,history,ranges);
   const session=new SharedPersistentSession(db,lease,core,checkpoint!==null,options);session.save();
   try{await session.flush();}catch(error){await session.discardAndClose();throw error;}return session;
  }catch(error){core?.dispose();db?.close();await lease.close();throw error;}
 }
 #live():void{if(this.#closed)throw new SharedEditorError("session_closed","The persistent shared session is closed");this.#lease.assertLive();}
 #report(error:unknown):void{try{this.#options.onError?.(error);}catch{/* Host reporting cannot change a committed write. */}}
 #notify():void{try{this.#options.onState?.(this.state());}catch(error){this.#report(error);}}
 #failed(error:unknown):void{this.#failure=error;this.#report(error);this.#notify();}
 state():SharedSaveState{return{status:this.#closed?"closed":this.#failure?"failed":this.#pending||this.#running?"pending":"saved",revision:this.#savedRevision,error:this.#failure?String(this.#failure):null};}
 /** Capture a complete exact journal synchronously; coalesce only superseded complete checkpoints. */
 save():void{
  this.#live();const json=this.core.checkpointJson(),revision=this.core.view().revision;checkCheckpoint(json,this.#options.room,this.#options.writer,this.#options.richLanguage,this.#options.history,this.#options.rangeEditing);
  if(json===this.#saved&&!this.#pending&&!this.#running&&!this.#failure)return;
  this.#pending={json,revision};this.#failure=undefined;this.#notify();this.#start();
 }
 #start():void{
  if(this.#running||this.#closed||!this.#pending)return;
  this.#running=this.#drain().catch(error=>{this.#failed(error);}).finally(()=>{this.#running=undefined;this.#notify();if(!this.#failure)this.#start();});
 }
 async #drain():Promise<void>{
  while(this.#pending&&!this.#closed){this.#lease.assertLive();const next=this.#pending;this.#pending=undefined;
   try{if(this.#options.rangeEditing==="general-v1")await writeSessionCheckpoint(this.#db,[this.#options.room,this.#options.writer],next.json,this.#options.history??"explicit","general-v1",this.#options.richLanguage??1);else await writeSessionCheckpoint(this.#db,[this.#options.room,this.#options.writer],next.json,this.#options.history??"explicit");}
   catch(error){this.#pending??=next;throw error;}
   this.#saved=next.json;this.#savedRevision=next.revision;
  }
 }
 /** A completed IndexedDB transaction only: neither a relay receipt nor an asset upload. */
 async flush():Promise<void>{this.#live();while(this.#running){await this.#running;if(this.#failure)throw this.#failure;}if(this.#failure)throw this.#failure;}
 /** Retry captures the newest complete owner journal, including edits after a failed write. */
 async retry():Promise<void>{this.#live();if(this.#running)await this.#running;this.save();await this.flush();}
 /** Retire publications synchronously; failed saves retain the readable owner/lease for close retry. */
 close():Promise<void>{
  if(this.#closed)return this.#released??Promise.resolve();if(this.#closeRequest)return this.#closeRequest;
  this.core.retire();
  this.#closeRequest=Promise.resolve().then(async()=>{if(this.#closed){await this.#released;return;}this.save();await this.flush();await this.discardAndClose();}).finally(()=>{this.#closeRequest=undefined;});
  return this.#closeRequest;
 }
 /** Explicitly abandon unsaved in-memory work without deleting the last durable journal. */
 discardAndClose():Promise<void>{
  if(this.#closed)return this.#released??Promise.resolve();this.#closed=true;this.#unsubscribe();this.core.dispose();this.#pending=undefined;this.#db.close();
  // A transaction already started may still commit after db.close(); do not release the writer early.
  this.#released=(this.#running??Promise.resolve()).then(()=>this.#lease.close()).catch(error=>this.#report(error));this.#notify();return this.#released;
 }
}
