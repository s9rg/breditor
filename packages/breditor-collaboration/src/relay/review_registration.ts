import {RelayChannel} from "./channel.js";
import {accountToken} from "./registration.js";
import {SharedRelayError,descriptor,endpoint,frame,object,secret,string,timeout,transportVersion,writer} from "./validation.js";
import {reviewActor,reviewBinding,reviewIdentity,reviewRole} from "./review_validation.js";
import type {SharedReviewRelayRegistrationOptions,SharedReviewRelayRegistration,SharedReviewObserverRegistration} from "./review_types.js";
/** Register before authoring; save credentials separately from paired portable recovery.
 * Omitting documentWriter reserves a permanent observation-only native document identity. */
export async function registerSharedReviewWriter(options:SharedReviewRelayRegistrationOptions):Promise<SharedReviewRelayRegistration>{return register(options,false);}
/** Read-only account registration needs no temporary comment/edit grant and never creates an author. */
export async function registerSharedReviewObserver(options:SharedReviewRelayRegistrationOptions):Promise<SharedReviewObserverRegistration>{
 const result=await register(options,true);return {...result,identity:{...result.identity,reviewEditing:"read_only"}};
}
async function register(options:SharedReviewRelayRegistrationOptions,observer:boolean):Promise<SharedReviewRelayRegistration>{
 const url=endpoint(options.endpoint),principal=string(options.principal,128),room=string(options.room,200),actor=reviewActor(options.actor),version=transportVersion(options.writerTransport),milliseconds=timeout(options.requestTimeoutMs),abort=new AbortController();let channel:RelayChannel|undefined;
 try{
  const token=await accountToken(options.getToken,abort.signal,milliseconds);channel=await RelayChannel.openReview(url,milliseconds,()=>{},()=>{},abort.signal);
  const capabilities=[...(version===2?["writerTransportV2"]:[]),"reviewV1","reviewLineageV1",...(observer?["reviewObserverV1"]:[])],response=await channel.request({kind:"authenticate",principal,token,capabilities});
  if(response["kind"]!=="authenticated"||JSON.stringify(response["capabilities"])!==JSON.stringify(capabilities))throw new SharedRelayError("review_transport_mismatch");
  const lane=object(response["reviewDescriptor"]);if(lane["format"]!=="breditor/relay-review"||lane["formatVersion"]!==1)throw new SharedRelayError("review_transport_mismatch");
  const binding=reviewBinding(lane["binding"]),role=reviewRole(response["reviewRole"]),d=descriptor(response["descriptor"]),f=frame(response["frame"]),header=object(JSON.parse(f));if(header["document"]!==room)throw new SharedRelayError("room_mismatch");
  let documentWriter:string,observerCredential:string|undefined;
  if(options.documentWriter===undefined){const observed=await channel.request({kind:"registerObserver"});if(observed["kind"]!=="observerRegistered")throw new SharedRelayError("protocol_error");const registration=object(observed["registration"]);documentWriter=writer(object(registration["lease"])["writer"]);observerCredential=secret(registration["credential"]);}else documentWriter=writer(options.documentWriter);
  const result=await channel.request({kind:observer?"reviewRegisterObserver":"reviewRegister",actor});if(result["kind"]!==(observer?"reviewObserverRegistered":"reviewRegistered"))throw new SharedRelayError("protocol_error");const registration=object(result["registration"]);if(object(registration["lease"])["actor"]!==actor)throw new SharedRelayError("review_actor_mismatch");
  const identity=reviewIdentity({endpoint:url,principal,room,actor,binding,documentWriter,credential:secret(registration["credential"]),...(version===2?{writerTransport:"atomic-v2"}:{}),...(observerCredential===undefined?{}:{observerCredential}),...(observer?{reviewEditing:"read_only"}:{})});
  try{await options.saveIdentity({...identity});}catch{throw new SharedRelayError("identity_not_saved");}
  return {identity,frame:f,descriptor:d,role};
 }finally{abort.abort();channel?.close();}
}
