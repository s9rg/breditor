/** Allocate a permanent observation-only native writer before joining a source owner. */
import {RelayChannel} from "../relay/channel.js";
import {accountToken} from "../relay/registration.js";
import {SharedRelayError,descriptor,endpoint,frame,object,string,timeout} from "../relay/validation.js";
import {suggestionBinding,suggestionDescriptor,suggestionPermissions} from "./transport.js";
import {observerIdentity} from "./observer_identity.js";
import type {SharedSuggestionObserverRegistrationOptions,SharedSuggestionObserverRegistration} from "./observer_types.js";
export async function registerSharedSuggestionObserver(options:SharedSuggestionObserverRegistrationOptions):Promise<SharedSuggestionObserverRegistration> {
 if(options.writerTransport!=="atomic-v2")throw new SharedRelayError("suggestion_transport_required");
 const url=endpoint(options.endpoint),principal=string(options.principal,128),room=string(options.room,200),milliseconds=timeout(options.requestTimeoutMs),abort=new AbortController();let channel:RelayChannel|undefined;
 try{
  const token=await accountToken(options.getToken,abort.signal,milliseconds);channel=await RelayChannel.openSuggestions(url,milliseconds,()=>{},()=>{},"original",abort.signal);
  const capabilities=["writerTransportV2","documentSuggestionsV1"],auth=await channel.request({kind:"authenticate",principal,token,capabilities});
  if(auth["kind"]!=="authenticated"||JSON.stringify(auth["capabilities"])!==JSON.stringify(capabilities))throw new SharedRelayError("suggestion_protocol_unavailable");
  const lane=object(auth["documentSuggestionsDescriptor"]),binding=suggestionBinding({binding:lane["binding"] as string,effectWriter:lane["effectWriter"] as string});suggestionDescriptor(lane,{...binding,room});
  const permissions={...suggestionPermissions(auth["documentSuggestionsPermissions"]),canAccept:false},d=descriptor(auth["descriptor"]),f=frame(auth["frame"]);if(object(JSON.parse(f))["document"]!==room)throw new SharedRelayError("room_mismatch");
  const response=await channel.request({kind:"registerObserver"});if(response["kind"]!=="observerRegistered")throw new SharedRelayError("protocol_error");
  const registration=object(response["registration"]),identity=observerIdentity({endpoint:url,principal,room,...binding,documentWriter:object(registration["lease"])["writer"] as string,observerCredential:registration["credential"] as string,writerTransport:"atomic-v2"});
  try{await options.saveIdentity({...identity});}catch{throw new SharedRelayError("identity_not_saved");}
  return {identity,frame:f,descriptor:d,permissions};
 }finally{abort.abort();channel?.close();}
}
