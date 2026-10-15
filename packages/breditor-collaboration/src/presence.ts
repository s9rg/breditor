import {SharedEditorError,SharedRichEditor} from "./core.js";
import type {SharedPresenceResolution} from "./types.js";
/** Metadata from the host's authenticated connection/lease, not from the opaque selection frame. */
export interface SharedPeerIdentity {writer:string;session:string;label:string;palette?:number}
export interface SharedPeerView {writer:string;session:string;label:string;palette:number;sequence:string|null;resolution:SharedPresenceResolution|null;error:string|null;expiresAt:number|null}
export interface SharedPresenceOptions {ttlMs?:number;maxPeers?:number;maxBytes?:number;now?:()=>number;autoExpire?:boolean;onError?:(error:unknown)=>void}
interface Peer {identity:Required<SharedPeerIdentity>;sequence:bigint|null;frame:string|null;bytes:number;resolution:SharedPresenceResolution|null;error:string|null;expires:number|null}
const MAX_FRAME=256*1024;
function decimal(value:string,writer=false):bigint{
 if(typeof value!=="string"||!/^\d{1,20}$/.test(value)||(value.length>1&&value.startsWith("0")))throw new SharedEditorError("presence_identity","Expected a canonical decimal identity or sequence");
 const n=BigInt(value);if(n>18446744073709551615n||(writer&&(n===0n||n===18446744073709551615n)))throw new SharedEditorError("presence_identity","Presence identity or sequence is out of range");return n;
}
/** Latest-per-writer ephemeral channel. Never sends presence through the durable content queue. */
export class SharedPresence {
 #core:SharedRichEditor;#peers=new Map<string,Peer>();#bytes=0;#listeners=new Set<()=>void>();#unsubscribe:()=>void;
 #options:SharedPresenceOptions;#ttl:number;#maxPeers:number;#maxBytes:number;#now:()=>number;#clock=0;
 #timer:ReturnType<typeof setInterval>|undefined;#disposed=false;#notifying=false;#notifyAgain=false;#version:string;
 constructor(core:SharedRichEditor,options:SharedPresenceOptions={}){
  if(!core.supportsPresence())throw new SharedEditorError("presence_unavailable","Use a Rust owner with the causal presence capability");
  this.#core=core;this.#options=options;this.#ttl=options.ttlMs??30000;this.#maxPeers=options.maxPeers??64;this.#maxBytes=options.maxBytes??2*1024*1024;
  if(!Number.isInteger(this.#ttl)||this.#ttl<1000||this.#ttl>30000||!Number.isInteger(this.#maxPeers)||this.#maxPeers<1||this.#maxPeers>64||!Number.isInteger(this.#maxBytes)||this.#maxBytes<1||this.#maxBytes>2*1024*1024)throw new SharedEditorError("presence_limits","Presence budgets may only tighten defaults");
  this.#now=options.now??(()=>performance.now());this.#time();this.#version=core.view().causalVersion;
  this.#unsubscribe=core.subscribe(event=>{if(event.view.causalVersion===this.#version)return;this.#version=event.view.causalVersion;this.#refresh();});
  if(options.autoExpire!==false)this.#timer=setInterval(()=>this.sweep(),Math.min(1000,this.#ttl));
 }
 #live(mutate=false):void{if(this.#disposed)throw new SharedEditorError("presence_disposed","The presence channel is disposed");if(mutate&&this.#notifying)throw new SharedEditorError("presence_reentrant","Presence callbacks cannot mutate the channel reentrantly");}
 #time():number{const n=this.#now();if(!Number.isFinite(n)||n<0)throw new SharedEditorError("presence_clock","Presence requires a finite monotonic clock");this.#clock=Math.max(this.#clock,n);return this.#clock;}
 #report(error:unknown):void{try{this.#options.onError?.(error);}catch{/* Host reporting cannot rewind a committed presence update. */}}
 #notify():void{if(this.#disposed)return;if(this.#notifying){this.#notifyAgain=true;return;}this.#notifying=true;let rounds=0;
  try{do{this.#notifyAgain=false;for(const listener of [...this.#listeners]){if(this.#disposed)break;try{listener();}catch(error){this.#report(error);}}}while(!this.#disposed&&this.#notifyAgain&&++rounds<128);
   if(this.#notifyAgain)this.#report(new SharedEditorError("presence_callback_loop","Presence callback publications exceeded their bounded queue"));
  }finally{this.#notifyAgain=false;this.#notifying=false;}}
 #clear(peer:Peer):void{this.#bytes-=peer.bytes;peer.bytes=0;peer.frame=null;peer.resolution=null;peer.error=null;peer.expires=null;}
 #refresh():void{let changed=false;const now=this.#time();for(const p of this.#peers.values()){
  if(p.expires!==null&&p.expires<=now){this.#clear(p);changed=true;continue;}if(p.frame===null)continue;
  try{const next=this.#core.resolvePresence(p.frame);if(JSON.stringify(next)!==JSON.stringify(p.resolution)||p.error!==null){p.resolution=next;p.error=null;changed=true;}}
  catch(error){if(p.resolution!==null||p.error===null)changed=true;p.resolution=null;p.error="unresolvable";this.#report(error);}
 }if(changed)this.#notify();}
 /** Called by the host when an authenticated peer session becomes current; old epochs are fenced. */
 announce(identity:SharedPeerIdentity):boolean{
  this.#live(true);decimal(identity.writer,true);
  if(typeof identity.session!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(identity.session)||typeof identity.label!=="string"||new TextEncoder().encode(identity.label).byteLength>200)throw new SharedEditorError("presence_identity","Invalid authenticated peer metadata");
  const palette=identity.palette??Number(BigInt(identity.writer)%8n);if(!Number.isInteger(palette)||palette<0||palette>7)throw new SharedEditorError("presence_identity","Presence palette must be an index from zero to seven");
  const next={...identity,palette},old=this.#peers.get(identity.writer);
  if(old?.identity.session===identity.session){if(JSON.stringify(old.identity)===JSON.stringify(next))return false;old.identity=next;this.#notify();return true;}
  if(!old&&this.#peers.size>=this.#maxPeers)throw new SharedEditorError("presence_full","Too many authenticated presence peers");
  if(old)this.#clear(old);this.#peers.set(identity.writer,{identity:next,sequence:null,frame:null,bytes:0,resolution:null,error:null,expires:null});this.#notify();return true;
 }
 /** Authenticated host envelope supplies writer/session/sequence; Rust validates opaque anchors. */
 receive(writer:string,session:string,sequence:string,frame:string):boolean{
  this.#live(true);const peer=this.#peers.get(writer);if(!peer||peer.identity.session!==session)throw new SharedEditorError("presence_session","Presence belongs to an unannounced or replaced peer session");
  const seq=decimal(sequence);if(typeof frame!=="string"||frame.length>MAX_FRAME)throw new SharedEditorError("presence_frame_limit","Presence frame exceeds its byte budget");
  const bytes=new TextEncoder().encode(frame).byteLength;if(bytes>MAX_FRAME)throw new SharedEditorError("presence_frame_limit","Presence frame exceeds its byte budget");
  if(peer.sequence!==null&&seq<=peer.sequence)return false;
  if(this.#bytes-peer.bytes+bytes>this.#maxBytes)throw new SharedEditorError("presence_full","Latest presence frames exceed their aggregate budget");
  const resolution=this.#core.resolvePresence(frame);if(resolution.writer!==writer)throw new SharedEditorError("presence_identity","Presence origin does not match the authenticated peer");
  const expires=this.#time()+this.#ttl;this.#bytes+=bytes-peer.bytes;Object.assign(peer,{sequence:seq,frame,bytes,resolution,error:null,expires});this.#notify();return true;
 }
 /** Connection loss/removal is scoped to the current session; old disconnects cannot remove its successor. */
 remove(writer:string,session:string):boolean{this.#live(true);const p=this.#peers.get(writer);if(!p||p.identity.session!==session)return false;this.#clear(p);this.#peers.delete(writer);this.#notify();return true;}
 /** Expire display/packet bytes, retaining the high sequence so old packets cannot revive a caret. */
 sweep():boolean{this.#live(true);const now=this.#time();let changed=false;for(const p of this.#peers.values())if(p.expires!==null&&p.expires<=now){this.#clear(p);changed=true;}if(changed)this.#notify();return changed;}
 view():readonly SharedPeerView[]{this.#live();const now=this.#time();return [...this.#peers.values()].sort((a,b)=>BigInt(a.identity.writer)<BigInt(b.identity.writer)?-1:1).map(p=>({
  ...p.identity,sequence:p.sequence?.toString()??null,resolution:p.expires!==null&&p.expires>now?structuredClone(p.resolution):null,error:p.error,expiresAt:p.expires,
 }));}
 pendingBytes():number{this.#live();return this.#bytes;}
 subscribe(listener:()=>void):()=>void{this.#live();this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 /** Does not dispose the independently owned shared editor. */
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#unsubscribe();if(this.#timer!==undefined)clearInterval(this.#timer);this.#peers.clear();this.#bytes=0;this.#listeners.clear();}
}
