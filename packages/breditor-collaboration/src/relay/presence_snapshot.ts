/** Bounded detached metadata for one latest ephemeral snapshot; opaque frames stay native-owned. */
import {SharedRelayError,decimal,object,string,writer} from "./validation.js";
export interface RelayPresencePeer {writer:string;session:string;label:string;sequence:string;frame:string}
export function relayPresenceSnapshot(value:unknown):RelayPresencePeer[]{
 if(!Array.isArray(value)||value.length>64)throw new SharedRelayError("protocol_error");
 let bytes=0;const seen=new Set<string>();
 return value.map(value=>{const p=object(value),id=writer(p["writer"]),session=string(p["session"],64),label=string(p["label"],200),sequence=decimal(p["sequence"]),frame=string(p["frame"],256*1024),size=new TextEncoder().encode(frame).length;
  bytes+=size;if(size>256*1024||bytes>2*1024*1024||seen.has(id)||!/^\w{64}$/.test(session)||new TextEncoder().encode(label).length>200)throw new SharedRelayError("protocol_error");seen.add(id);
  return{writer:id,session,label,sequence,frame};
 });
}
