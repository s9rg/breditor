import type {SharedRichEditor} from "../core.js";
import type {SharedPresence} from "../presence.js";
import type {RelayChannel} from "./channel.js";
import type {SharedSelectionPolicy} from "../types.js";
import {SharedRelayError} from "./validation.js";
import {relayPresenceSnapshot,type RelayPresencePeer} from "./presence_snapshot.js";

/** Private opt-in ephemeral pump. One latest outgoing selection and one latest peer snapshot;
 * neither enters the durable edit queue. The host retains ownership of its presence registry. */
export class RelayPresence<P extends SharedSelectionPolicy="original"> {
 #core:SharedRichEditor<P>;#registry:SharedPresence<P>;#writer:string;#report:(error:SharedRelayError)=>void;#unsubscribe:()=>void;
 #channel:RelayChannel|undefined;#generation=0;#closed=false;#dirty=false;#sending=false;#sequence=0n;
 #timer:ReturnType<typeof setTimeout>|undefined;#heartbeat:ReturnType<typeof setInterval>|undefined;
 #peers=new Map<string,string>();#latest:RelayPresencePeer[]|undefined;#queued:number|undefined;
 constructor(core:SharedRichEditor<P>,registry:SharedPresence<P>,id:string,report:(error:SharedRelayError)=>void){
  if(!registry.isFor(core)||registry.selectionPolicy()!==core.selectionPolicy())throw new SharedRelayError("presence_owner_mismatch");
  if(!core.supportsPresence())throw new SharedRelayError("presence_unavailable");
  this.#core=core;this.#registry=registry;this.#writer=id;this.#report=report;
  this.#unsubscribe=core.subscribe(()=>this.#schedule());
 }
 start(channel:RelayChannel):void{
  this.stop();this.#channel=channel;this.#sequence=0n;this.#sending=false;this.#schedule();
  this.#heartbeat=setInterval(()=>this.#schedule(),5000);
 }
 #schedule():void{if(this.#closed||!this.#channel)return;this.#dirty=true;if(this.#timer||this.#sending)return;
  this.#timer=setTimeout(()=>{this.#timer=undefined;void this.#send();},100);
 }
 async #send():Promise<void>{
  const channel=this.#channel,generation=this.#generation;if(!channel||this.#closed||this.#sending||!this.#dirty)return;
  this.#dirty=false;this.#sending=true;
  try{if(this.#sequence>=18446744073709551615n)throw new SharedRelayError("presence_sequence_exhausted");
   const frame=this.#core.presenceFrame(),sequence=String(++this.#sequence);
   const result=await channel.request({kind:this.#core.selectionPolicy()==="document-v1"?"documentPresence":"presence",sequence,frame});
   if(result["kind"]!=="presenceAccepted"||typeof result["changed"]!=="boolean")throw new SharedRelayError("protocol_error");
  }catch{if(this.#generation===generation&&this.#channel===channel)this.#report(new SharedRelayError("presence_send_failed"));}
  finally{if(this.#generation===generation){this.#sending=false;if(this.#dirty)this.#schedule();}}
 }
 receive(value:unknown):void{
  if(!this.#channel||this.#closed)return;
  if(!Array.isArray(value)||value.length>64)throw new SharedRelayError("protocol_error");
  try{this.#latest=relayPresenceSnapshot(value);}catch{this.#report(new SharedRelayError("presence_receive_failed"));return;}
  const generation=this.#generation;if(this.#queued===generation)return;this.#queued=generation;
  queueMicrotask(()=>{if(this.#queued===generation)this.#queued=undefined;if(generation!==this.#generation||this.#closed||!this.#channel)return;
   const latest=this.#latest;this.#latest=undefined;if(!latest)return;
   try{this.#apply(latest);}catch{this.#report(new SharedRelayError("presence_receive_failed"));}
  });
 }
 #apply(peers:RelayPresencePeer[]):void{
  const current=new Map(peers.filter(p=>p.writer!==this.#writer).map(p=>[p.writer,p.session]));
  for(const[id,session]of this.#peers)if(current.get(id)!==session)this.#registry.remove(id,session);
  for(const p of peers){if(p.writer===this.#writer)continue;this.#registry.announce({writer:p.writer,session:p.session,label:p.label});this.#registry.receive(p.writer,p.session,p.sequence,p.frame);}
  this.#peers=current;
 }
 stop():void{
  this.#generation++;this.#channel=undefined;this.#dirty=false;this.#sending=false;this.#latest=undefined;this.#queued=undefined;clearTimeout(this.#timer);clearInterval(this.#heartbeat);this.#timer=undefined;this.#heartbeat=undefined;
  const generation=this.#generation;queueMicrotask(()=>{if(generation!==this.#generation)return;for(const[id,session]of this.#peers)try{this.#registry.remove(id,session);}catch{/* A disposed independently owned registry is not an editor failure. */}this.#peers.clear();});
 }
 dispose():void{if(this.#closed)return;this.stop();this.#closed=true;this.#unsubscribe();}
}
