import {afterEach,describe,it,expect,vi} from "vitest";
import {RelayChannel} from "../../breditor-collaboration/src/relay/channel.js";
import {SharedRelayError} from "../../breditor-collaboration/src/relay/validation.js";
import {SharedSuggestionObserverRelay} from "../../breditor-collaboration/src/suggestions/observer_relay.js";
import {registerSharedSuggestionObserver} from "../../breditor-collaboration/src/suggestions/register_observer.js";
import {sharedSuggestionObserverQueueIdentity} from "../../breditor-collaboration/src/suggestions/observer_identity.js";
import type {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
const digest=`sha256:${"a".repeat(64)}`,identity={endpoint:"ws://127.0.0.1:49786/",principal:"reader",room:"room",binding:"b".repeat(64),documentWriter:"101",effectWriter:"202",writerTransport:"atomic-v2" as const,observerCredential:"c".repeat(64)},queueIdentity=sharedSuggestionObserverQueueIdentity(identity);
const lane={format:"breditor/relay-document-suggestions",formatVersion:1,document:"room",binding:identity.binding,effectWriter:identity.effectWriter},permissions={role:"review",canPropose:true,canAccept:true,canReject:true} as const;
function fixture(){
 let readonly=false,through="0",sourceListener=()=>{};const descriptor={format:"breditor/shared-rich-profile-descriptor",formatVersion:1,abiVersion:1,modelVersion:11,journalVersion:12,schema:{name:"test/suggestion-observer",version:1},schemaFingerprint:digest};
 const core={supportsReadOnly:()=>true,supportsWriterTransportV2:()=>true,supportsDocumentSuggestions:()=>true,reviewedHistoryIdentity:()=>null,selectionPolicy:()=>"original",checkpointJson:()=>JSON.stringify({format:"breditor/rich-replica-journal",version:12,document:"room",writer:"101"}),richLanguageVersion:()=>1,view:()=>({causalVersion:"0",readOnly:readonly}),setReadOnly:vi.fn((value:boolean)=>{readonly=value;sourceListener();}),writerClockV2:()=>({writer:"101",through,prefixDigest:digest}),writerGroupsV2:()=>({groups:[]}),subscribe:vi.fn((listener:()=>void)=>{sourceListener=listener;return vi.fn();}),receiveFrame:vi.fn(async()=>true),descriptor:()=>descriptor,dispose:vi.fn()} as unknown as SharedRichEditor;
 let event!:(value:Record<string,unknown>)=>void;
 const request=vi.fn(async(input:Record<string,unknown>):Promise<Record<string,unknown>>=>{
  switch(input["kind"]){
   case "authenticate":return {kind:"authenticated",descriptor:JSON.stringify(descriptor),frame:JSON.stringify({document:"room"}),capabilities:["writerTransportV2","documentSuggestionsV1"],documentSuggestionsDescriptor:lane,documentSuggestionsPermissions:permissions};
   case "clock":return {kind:"clock",clock:{writer:"101",through:"0",prefixDigest:digest}};
   case "resumeObserver":return {kind:"observerResumed",lease:{writer:"101"}};
   case "registerObserver":return {kind:"observerRegistered",registration:{lease:{writer:"101"},credential:identity.observerCredential}};
   case "sync":return {kind:"catchup",frame:"explicit effect"};
   default:return {kind:"metadata"};
  }
 });
 const close=vi.fn();vi.spyOn(RelayChannel,"openSuggestions").mockImplementation(async(_url,_timeout,onEvent)=>{event=onEvent;return {request,close} as unknown as RelayChannel;});
 const storage={core,save:vi.fn(),flush:vi.fn(async()=>{})},options={identity,storage,getToken:vi.fn(()=>"d".repeat(64)),autoConnect:false};
 return {core,options,storage,request,close,event:(value:Record<string,unknown>)=>event(value),through:(value:string)=>{through=value;}};
}
afterEach(()=>vi.restoreAllMocks());
describe("permanent suggestion observer boundary",()=>{
 it("keeps a closed protected observer credential distinct from the nonsecret queue identity",()=>{
  expect(queueIdentity).not.toHaveProperty("observerCredential");const copy=sharedSuggestionObserverQueueIdentity(identity);copy.principal="other";expect(identity.principal).toBe("reader");
  for(const wrong of [{...identity,credential:"secret"},{...identity,observerCredential:undefined},{...identity,writerTransport:undefined},{...identity,documentWriter:identity.effectWriter}])expect(()=>sharedSuggestionObserverQueueIdentity(wrong as never)).toThrow();
 });
 it("registers only an observer and durably returns the separate identity before exposing it",async()=>{
  const t=fixture(),save=vi.fn();const result=await registerSharedSuggestionObserver({...t.options,endpoint:identity.endpoint,principal:identity.principal,room:identity.room,writerTransport:"atomic-v2",saveIdentity:save});expect(result.identity).toEqual(identity);expect(result.permissions.canAccept).toBe(false);expect(save).toHaveBeenCalledWith(identity);expect(t.request.mock.calls.map(([v])=>v["kind"])).toEqual(["authenticate","registerObserver"]);expect(t.close).toHaveBeenCalled();
  await expect(registerSharedSuggestionObserver({...t.options,endpoint:identity.endpoint,principal:identity.principal,room:identity.room,writerTransport:"atomic-v2",saveIdentity:()=>{throw Error("disk");}})).rejects.toThrow("identity_not_saved");
 });
 it("requires a zero native authored prefix and leaves the borrowed owner read-only after disposal",()=>{
  const bad=fixture();bad.through("1");expect(()=>new SharedSuggestionObserverRelay(bad.options)).toThrow("suggestion_observer_authored");expect(bad.core.setReadOnly).not.toHaveBeenCalled();const t=fixture(),relay=new SharedSuggestionObserverRelay(t.options);expect(t.core.view().readOnly).toBe(true);expect(()=>new SharedSuggestionObserverRelay(t.options)).toThrow("suggestion_observer_already_attached");relay.dispose();expect(t.core.view().readOnly).toBe(true);expect(t.core.dispose).not.toHaveBeenCalled();
 });
 it("resumes only the observer, saves imported source and never promotes Accept after an Editor grant",async()=>{
  const t=fixture(),relay=new SharedSuggestionObserverRelay(t.options);try{await relay.connect();expect(t.request.mock.calls.map(([v])=>v["kind"])).toEqual(["authenticate","clock","resumeObserver","clock"]);expect(t.storage.save).toHaveBeenCalled();expect(relay.suggestionState().permissions?.canAccept).toBe(false);const count=t.request.mock.calls.length;await expect(relay.requestSuggestion({kind:"suggestionDecide",suggestionId:digest,decision:"accept"})).rejects.toThrow("suggestion_observer_accept");expect(t.request.mock.calls).toHaveLength(count);await relay.requestSuggestion({kind:"suggestionDecide",suggestionId:digest,decision:"reject",binding:"wrong",principal:"other",writer:"999"} as never);expect(t.request.mock.calls.at(-1)?.[0]).toEqual({kind:"suggestionDecide",decision:{binding:identity.binding,suggestionId:digest,decision:"reject"}});relay.checkSuggestionQueue(t.core,queueIdentity);expect(()=>relay.checkSuggestionQueue(t.core,{...queueIdentity,principal:"other"})).toThrow();}finally{relay.dispose();}
 });
 it("refuses mismatched negotiation and nonzero server prefixes before importing a frame",async()=>{
  for(const change of [{capabilities:["writerTransportV2"]},{documentSuggestionsDescriptor:{...lane,effectWriter:"203"}}]){const t=fixture(),base=t.request.getMockImplementation()!;t.request.mockImplementation(async v=>({...await base(v),...(v["kind"]==="authenticate"?change:{})}));const relay=new SharedSuggestionObserverRelay(t.options);try{await expect(relay.connect()).rejects.toThrow();expect(t.core.receiveFrame).not.toHaveBeenCalled();}finally{relay.dispose();}}
  const t=fixture(),base=t.request.getMockImplementation()!;t.request.mockImplementation(async v=>v["kind"]==="clock"?{kind:"clock",clock:{writer:"101",through:"1",prefixDigest:digest}}:base(v));const relay=new SharedSuggestionObserverRelay(t.options);try{await expect(relay.connect()).rejects.toThrow("suggestion_observer_authored");expect(t.core.receiveFrame).not.toHaveBeenCalled();expect(t.request.mock.calls.some(([v])=>v["kind"]==="resumeObserver")).toBe(false);}finally{relay.dispose();}
 });
 it("fails source persistence before connecting and retains the borrowed owner for explicit retry",async()=>{
  const t=fixture();t.storage.flush.mockRejectedValueOnce(Error("disk"));const relay=new SharedSuggestionObserverRelay(t.options);try{await expect(relay.connect()).rejects.toThrow("local_save_failed");expect(t.options.getToken).not.toHaveBeenCalled();expect(relay.state().status).toBe("local-save-failed");expect(t.core.dispose).not.toHaveBeenCalled();await relay.connect();expect(relay.suggestionState().ready).toBe(true);}finally{relay.dispose();}
 });
 it("pins the same borrowed source across asynchronous persistence and refuses later authored suffixes",async()=>{
  const t=fixture(),relay=new SharedSuggestionObserverRelay(t.options);t.storage.flush.mockImplementationOnce(async()=>{t.storage.core={} as SharedRichEditor;});try{await expect(relay.connect()).rejects.toThrow("suggestion_source_replaced");expect(t.request).not.toHaveBeenCalled();expect(t.core.dispose).not.toHaveBeenCalled();}finally{relay.dispose();}
  const t2=fixture(),relay2=new SharedSuggestionObserverRelay(t2.options);try{await relay2.connect();t2.through("1");await expect(relay2.refreshDocument()).rejects.toThrow("suggestion_observer_authored");}finally{relay2.dispose();}
 });
 it("wakes pending dependencies on unchanged catchup without losing a separate explicit effect response",async()=>{
  const t=fixture(),relay=new SharedSuggestionObserverRelay(t.options),base=t.request.getMockImplementation()!;try{await relay.connect();const revision=relay.suggestionState().documentRevision;t.request.mockImplementation(async v=>{if(v["kind"]==="sync")t.event({kind:"catchup",frame:"earlier hint"});return base(v);});await relay.refreshDocument();expect(t.core.receiveFrame).toHaveBeenCalledWith("earlier hint",expect.anything());expect(t.core.receiveFrame).toHaveBeenCalledWith("explicit effect",expect.anything());expect(relay.suggestionState().documentRevision).toBe(revision+1);}finally{relay.dispose();}
 });
 it("bounds outstanding metadata requests and refuses late replies after disconnect",async()=>{
  const t=fixture(),relay=new SharedSuggestionObserverRelay(t.options),base=t.request.getMockImplementation()!,releases:((v:Record<string,unknown>)=>void)[]=[];try{await relay.connect();t.request.mockImplementation(v=>v["kind"]==="suggestionRead"?new Promise(resolve=>releases.push(resolve)):base(v));const a=relay.requestSuggestion({kind:"suggestionRead",suggestionId:digest}),b=relay.requestSuggestion({kind:"suggestionRead",suggestionId:digest});await expect(relay.requestSuggestion({kind:"suggestionRead",suggestionId:digest})).rejects.toThrow("suggestion_request_budget");relay.disconnect();for(const release of releases)release({kind:"metadata"});await expect(a).rejects.toThrow("disconnected");await expect(b).rejects.toThrow("disconnected");}finally{relay.dispose();}
 });
 it("fences revoked observer leases and writable source replacement without disposing source history",async()=>{
  const t=fixture(),relay=new SharedSuggestionObserverRelay(t.options),base=t.request.getMockImplementation()!;try{await relay.connect();t.request.mockImplementation(v=>v["kind"]==="suggestionRead"?Promise.reject(new SharedRelayError("lease_rejected")):base(v));await expect(relay.requestSuggestion({kind:"suggestionRead",suggestionId:digest})).rejects.toThrow("lease_rejected");expect(relay.state().status).toBe("fenced");expect(t.core.dispose).not.toHaveBeenCalled();}finally{relay.dispose();}
  const t2=fixture(),relay2=new SharedSuggestionObserverRelay(t2.options);try{await relay2.connect();t2.core.setReadOnly(false);expect(relay2.suggestionState().ready).toBe(false);expect(relay2.state().error).toBe("suggestion_observer_writable");}finally{relay2.dispose();}
 });
});
