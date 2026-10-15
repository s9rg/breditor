import {SharedRichEditor,SharedEditorError} from "../core.js";
import type {SharedEditorOptions,SharedRustOwner} from "../types.js";
import {SharedWriterLease} from "./writer_lease.js";
import {checkCheckpoint,openSessionDatabase,readCheckpoint,writeCheckpoint} from "./session_database.js";

export interface SharedSessionOptions {
 database:string;room:string;writer:string;
 /** Called only while this origin holds the exclusive causal writer lock. */
 create:()=>SharedRustOwner|Promise<SharedRustOwner>;
 /** Must invoke the matching Rust replay admission, never import a JSON AST in place of history. */
 restore:(checkpoint:string)=>SharedRustOwner|Promise<SharedRustOwner>;
 editor?:SharedEditorOptions;onState?:(state:SharedSaveState)=>void;onError?:(error:unknown)=>void;
}
export interface SharedSaveState {status:"saved"|"pending"|"failed"|"closed";revision:string|null;error:string|null}

/** Exact causal recovery with bounded coalesced writes and origin-wide writer exclusion. */
export class SharedPersistentSession {
 readonly core:SharedRichEditor;readonly recovered:boolean;
 #db:IDBDatabase;#lease:SharedWriterLease;#options:SharedSessionOptions;#unsubscribe:()=>void;
 #pending:{json:string;revision:string}|undefined;#running:Promise<void>|undefined;#failure:unknown;
 #saved:string|undefined;#savedRevision:string|null=null;#closed=false;
 private constructor(db:IDBDatabase,lease:SharedWriterLease,core:SharedRichEditor,recovered:boolean,options:SharedSessionOptions){
  this.#db=db;this.#lease=lease;this.core=core;this.recovered=recovered;this.#options=options;
  this.#unsubscribe=core.subscribe(()=>{try{this.save();}catch(error){this.#failed(error);}});
  db.onversionchange=()=>{this.#failed(new SharedEditorError("session_versionchange","Shared session storage changed; the writer was stopped"));this.discardAndClose();};
 }
 static async open(options:SharedSessionOptions):Promise<SharedPersistentSession>{
  options={...options};
  // Acquire before reading/restoring: a same-writer clone never becomes live first.
  const lease=await SharedWriterLease.acquire(options.room,options.writer);let db:IDBDatabase|undefined,core:SharedRichEditor|undefined;
  try{
   db=await openSessionDatabase(options.database);const checkpoint=await readCheckpoint(db,[options.room,options.writer]);
   if(checkpoint!==null)checkCheckpoint(checkpoint,options.room,options.writer);
   core=new SharedRichEditor(await(checkpoint===null?options.create():options.restore(checkpoint)),options.editor);
   checkCheckpoint(core.checkpointJson(),options.room,options.writer);
   const session=new SharedPersistentSession(db,lease,core,checkpoint!==null,options);session.save();
   try{await session.flush();}catch(error){session.discardAndClose();throw error;}return session;
  }catch(error){core?.dispose();db?.close();await lease.close();throw error;}
 }
 #live():void{if(this.#closed)throw new SharedEditorError("session_closed","The persistent shared session is closed");this.#lease.assertLive();}
 #report(error:unknown):void{try{this.#options.onError?.(error);}catch{/* Host reporting cannot change a committed write. */}}
 #notify():void{try{this.#options.onState?.(this.state());}catch(error){this.#report(error);}}
 #failed(error:unknown):void{this.#failure=error;this.#report(error);this.#notify();}
 state():SharedSaveState{return{status:this.#closed?"closed":this.#failure?"failed":this.#pending||this.#running?"pending":"saved",revision:this.#savedRevision,error:this.#failure?String(this.#failure):null};}
 /** Capture a complete exact journal synchronously; coalesce only superseded complete checkpoints. */
 save():void{
  this.#live();const json=this.core.checkpointJson(),revision=this.core.view().revision;checkCheckpoint(json,this.#options.room,this.#options.writer);
  if(json===this.#saved&&!this.#pending&&!this.#running&&!this.#failure)return;
  this.#pending={json,revision};this.#failure=undefined;this.#notify();this.#start();
 }
 #start():void{
  if(this.#running||this.#closed||!this.#pending)return;
  this.#running=this.#drain().catch(error=>{this.#failed(error);}).finally(()=>{this.#running=undefined;this.#notify();if(!this.#failure)this.#start();});
 }
 async #drain():Promise<void>{
  while(this.#pending&&!this.#closed){this.#lease.assertLive();const next=this.#pending;this.#pending=undefined;
   try{await writeCheckpoint(this.#db,[this.#options.room,this.#options.writer],next.json);}
   catch(error){this.#pending??=next;throw error;}
   this.#saved=next.json;this.#savedRevision=next.revision;
  }
 }
 /** A completed IndexedDB transaction only: neither a relay receipt nor an asset upload. */
 async flush():Promise<void>{this.#live();while(this.#running){await this.#running;if(this.#failure)throw this.#failure;}if(this.#failure)throw this.#failure;}
 /** Retry captures the newest complete owner journal, including edits after a failed write. */
 async retry():Promise<void>{this.#live();if(this.#running)await this.#running;this.save();await this.flush();}
 /** Stop the writer before releasing the lock. Failed saves retain the live owner and lease for retry. */
 async close():Promise<void>{if(this.#closed)return;this.save();await this.flush();this.discardAndClose();await this.#lease.close();}
 /** Explicitly abandon unsaved in-memory work without deleting the last durable journal. */
 discardAndClose():void{if(this.#closed)return;this.#closed=true;this.#unsubscribe();this.core.dispose();this.#pending=undefined;this.#db.close();void this.#lease.close().catch(error=>this.#report(error));this.#notify();}
}
