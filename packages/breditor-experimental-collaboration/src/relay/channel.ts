import {SharedRelayError,endpoint,object,string,timeout} from "./validation.js";

type Result=Record<string,unknown>;
interface Pending {resolve:(value:Result)=>void;reject:(error:SharedRelayError)=>void;timer:ReturnType<typeof setTimeout>}
const MAX_BYTES=6*1024*1024;
const codes=new Set(["permission_denied","lease_rejected","storage_unavailable","entropy_unavailable","group_rejected","invalid_request"]);

/** Bounded transport only. Authentication, causal admission and durability are not inferred here. */
export class RelayChannel {
 #socket:WebSocket;#pending=new Map<string,Pending>();#next=0;#closed=false;#opened=false;
 #timeout:number;#onEvent:(event:Result)=>void;#onClose:(error:SharedRelayError)=>void;
 #openResolve:(channel:RelayChannel)=>void=()=>{};#openReject:(error:SharedRelayError)=>void=()=>{};#openTimer:ReturnType<typeof setTimeout>|undefined;
 #abortCleanup:()=>void=()=>{};
 private constructor(url:string,milliseconds:number,onEvent:(event:Result)=>void,onClose:(error:SharedRelayError)=>void){
  this.#timeout=milliseconds;this.#onEvent=onEvent;this.#onClose=onClose;this.#socket=new WebSocket(url);
  this.#socket.addEventListener("open",()=>{if(this.#closed)return;this.#opened=true;clearTimeout(this.#openTimer);this.#openResolve(this);});
  this.#socket.addEventListener("message",e=>this.#message(e.data));
  this.#socket.addEventListener("error",()=>this.#fail(new SharedRelayError("connection_lost")));
  this.#socket.addEventListener("close",()=>this.#fail(new SharedRelayError("connection_lost")));
 }
 static open(url:string,milliseconds:number|undefined,onEvent:(event:Result)=>void,onClose:(error:SharedRelayError)=>void,signal?:AbortSignal):Promise<RelayChannel>{
  return new Promise((resolve,reject)=>{try{const channel=new RelayChannel(endpoint(url),timeout(milliseconds),onEvent,onClose);channel.#openResolve=resolve;channel.#openReject=reject;channel.#openTimer=setTimeout(()=>channel.#fail(new SharedRelayError("connection_timeout")),channel.#timeout);
   const cancel=()=>channel.#fail(new SharedRelayError("disconnected"));channel.#abortCleanup=()=>signal?.removeEventListener("abort",cancel);signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)cancel();
  }catch{reject(new SharedRelayError("connection_lost"));}});
 }
 #message(data:unknown):void{
  if(this.#closed)return;
  try{
   const raw=string(data,MAX_BYTES);if(new TextEncoder().encode(raw).length>MAX_BYTES)throw new SharedRelayError("protocol_error");
   const e=object(JSON.parse(raw));if(Object.keys(e).sort().join(",")!=="format,formatVersion,id,result"||e["format"]!=="breditor/relay"||e["formatVersion"]!==1)throw new SharedRelayError("protocol_error");
   const result=object(e["result"]),kind=string(result["kind"],32);let error:SharedRelayError|undefined;
   if(kind==="error"){const code=string(result["code"],64);if(!codes.has(code))throw new SharedRelayError("protocol_error");error=new SharedRelayError(code);}
   if(e["id"]===null){if(kind!=="catchup"&&kind!=="error"&&kind!=="assetsChanged"&&kind!=="presence")throw new SharedRelayError("protocol_error");this.#onEvent(result);return;}
   const id=string(e["id"],64),pending=this.#pending.get(id);if(!pending)throw new SharedRelayError("protocol_error");
   this.#pending.delete(id);clearTimeout(pending.timer);if(error)pending.reject(error);else pending.resolve(result);
  }catch(error){this.#fail(error instanceof SharedRelayError?error:new SharedRelayError("protocol_error"));}
 }
 request(request:Result):Promise<Result>{
  if(this.#closed||!this.#opened)return Promise.reject(new SharedRelayError("connection_lost"));
  if(this.#pending.size>=8)return Promise.reject(new SharedRelayError("request_budget"));
  const id=String(++this.#next),raw=JSON.stringify({format:"breditor/relay",formatVersion:1,id,request}),bytes=new TextEncoder().encode(raw).length;
  if(bytes>MAX_BYTES||this.#socket.bufferedAmount+bytes>8*1024*1024)return Promise.reject(new SharedRelayError("request_budget"));
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.#fail(new SharedRelayError("request_timeout")),this.#timeout);
   this.#pending.set(id,{resolve,reject,timer});try{this.#socket.send(raw);}catch{this.#fail(new SharedRelayError("connection_lost"));}
  });
 }
 #fail(error:SharedRelayError):void{
  if(this.#closed)return;this.#closed=true;clearTimeout(this.#openTimer);this.#abortCleanup();this.#openReject(error);
  for(const p of this.#pending.values()){clearTimeout(p.timer);p.reject(error);}this.#pending.clear();
  try{this.#socket.close();}catch{/* The channel is already fenced locally. */}this.#onClose(error);
 }
 close():void{this.#fail(new SharedRelayError("disconnected"));}
}
