import {RelayChannel} from "./channel.js";
import {SharedRelayError,descriptor,endpoint,frame,identity,object,secret,string,timeout} from "./validation.js";
import type {SharedRelayRegistration,SharedRelayRegistrationOptions} from "./types.js";

/** Token acquisition is bounded and cancellable; a late provider result cannot open an old socket. */
export function accountToken(getToken:(signal:AbortSignal)=>string|Promise<string>,signal:AbortSignal,milliseconds:number):Promise<string>{
 return new Promise((resolve,reject)=>{
  const stop=()=>finish(new SharedRelayError("disconnected"));
  const timer=setTimeout(()=>finish(new SharedRelayError("token_unavailable")),milliseconds);
  function finish(error?:SharedRelayError,value?:string):void{clearTimeout(timer);signal.removeEventListener("abort",stop);if(error)reject(error);else resolve(value!);}
  signal.addEventListener("abort",stop,{once:true});if(signal.aborted){stop();return;}
  Promise.resolve().then(()=>getToken(signal)).then(value=>{try{finish(undefined,secret(value));}catch{finish(new SharedRelayError("token_unavailable"));}},()=>finish(new SharedRelayError("token_unavailable")));
 });
}

/** Allocate online before first authoring. Only return after the separate credential is durable.
 * The returned opaque catchup still requires the matching Rust profile's join admission and
 * the normal origin-wide writer lock. This helper never creates/disposes an editor owner. */
export async function registerSharedRelayWriter(options:SharedRelayRegistrationOptions):Promise<SharedRelayRegistration>{
 const url=endpoint(options.endpoint),principal=string(options.principal,128),room=string(options.room,200),milliseconds=timeout(options.requestTimeoutMs);
 if(!principal||!room)throw new SharedRelayError("identity_invalid");
 const abort=new AbortController();let channel:RelayChannel|undefined;
 try{
  const token=await accountToken(options.getToken,abort.signal,milliseconds);
  channel=await RelayChannel.open(url,milliseconds,()=>{},()=>{},abort.signal);
  const authenticated=await channel.request({kind:"authenticate",principal,token});
  if(authenticated["kind"]!=="authenticated")throw new SharedRelayError("protocol_error");
  const d=descriptor(authenticated["descriptor"]),f=frame(authenticated["frame"]),header=object(JSON.parse(f));
  if(header["format"]!=="breditor/rich-replica-update"||header["document"]!==room)throw new SharedRelayError("room_mismatch");
  const result=await channel.request({kind:"register"});if(result["kind"]!=="registered")throw new SharedRelayError("protocol_error");
  const registration=object(result["registration"]),lease=object(registration["lease"]);
  const saved=identity({endpoint:url,principal,room,writer:string(lease["writer"],20),credential:secret(registration["credential"])});
  try{await options.saveIdentity({...saved});}catch{throw new SharedRelayError("identity_not_saved");}
  return Object.freeze({identity:saved,frame:f,descriptor:d});
 }finally{abort.abort();channel?.close();}
}
