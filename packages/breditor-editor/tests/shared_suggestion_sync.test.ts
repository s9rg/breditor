import {afterEach,describe,it,expect,vi} from "vitest";
import {RelayChannel} from "../../breditor-collaboration/src/relay/channel.js";
import {SharedRelaySync} from "../../breditor-collaboration/src/relay/sync.js";
import {transportCapabilities,SharedRelayError} from "../../breditor-collaboration/src/relay/validation.js";
import {suggestionBinding,suggestionDescriptor,suggestionPermissions,suggestionEntry,suggestionDependencies,suggestionConflicts} from "../../breditor-collaboration/src/suggestions/transport.js";
import {readSuggestionFeed,checkSuggestionFeed} from "../../breditor-collaboration/src/suggestions/feed.js";
import type {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
const digest=`sha256:${"a".repeat(64)}`,other=`sha256:${"b".repeat(64)}`;
const identity={endpoint:"ws://127.0.0.1:49786/",principal:"alice",room:"room",binding:"b".repeat(64),documentWriter:"101",effectWriter:"202",writerTransport:"atomic-v2" as const};
const lane={format:"breditor/relay-document-suggestions",formatVersion:1,document:"room",binding:identity.binding,effectWriter:identity.effectWriter};
const permissions={role:"review",canPropose:true,canAccept:true,canReject:true} as const;
const publication={sequence:"9007199254740993",suggestion:{id:digest,title:"Title 日本 🙂",author:"alice",createdAtMs:"1792200000000"}};
const decision={sequence:"9007199254740994",suggestionId:digest,principal:"bob",decision:"reject" as const,effect:null};
const update={kind:"published",data:publication},decided={kind:"decided",data:decision};
function page(updates:unknown[],after=publication.sequence,through=after,more=false){return {kind:"suggestionsPage",page:{descriptor:lane,permissions,updates,cursor:{binding:identity.binding,after,through},more}};}
function fixture(){
 const descriptor={format:"breditor/shared-rich-profile-descriptor",formatVersion:1,abiVersion:1,modelVersion:11,journalVersion:12,schema:{name:"test/suggestion-relay",version:1},schemaFingerprint:digest};
 const core={selectionPolicy:()=>"original",supportsWriterTransportV2:()=>true,supportsDocumentSuggestions:()=>true,checkpointJson:()=>JSON.stringify({format:"breditor/rich-replica-journal",version:12,document:"room",writer:"101"}),view:()=>({causalVersion:"0"}),richLanguageVersion:()=>1,writerClockV2:()=>({writer:"101",through:"0",prefixDigest:digest}),writerGroupsV2:()=>({groups:[]}),subscribe:()=>()=>{},receiveFrame:vi.fn(async()=>true),descriptor:()=>descriptor} as unknown as SharedRichEditor;
 let event!:(value:Record<string,unknown>)=>void;
 const request=vi.fn(async(value:Record<string,unknown>):Promise<Record<string,unknown>>=>{
  switch(value["kind"]){
   case "authenticate":return {kind:"authenticated",descriptor:JSON.stringify(descriptor),frame:"initial",capabilities:["writerTransportV2","documentSuggestionsV1"],documentSuggestionsDescriptor:lane,documentSuggestionsPermissions:permissions};
   case "clock":return {kind:"clock",clock:{writer:"101",through:"0",prefixDigest:digest}};
   case "resume":return {kind:"resumed",lease:{writer:"101"}};
   case "sync":return {kind:"catchup",frame:"explicit-effect"};
   default:return {kind:"testResult"};
  }
 });
 const close=vi.fn();vi.spyOn(RelayChannel,"openSuggestions").mockImplementation(async(_url,_timeout,onEvent)=>{event=onEvent;return {request,close} as unknown as RelayChannel;});
 const options={identity:{endpoint:identity.endpoint,principal:identity.principal,room:identity.room,writer:identity.documentWriter,credential:"c".repeat(64),writerTransport:"atomic-v2" as const},getToken:()=>"d".repeat(64),persistLocal:vi.fn(async()=>{}),suggestions:{binding:identity.binding,effectWriter:identity.effectWriter},autoConnect:false};
 return {core,request,close,options,event:(value:Record<string,unknown>)=>event(value)};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("opt-in suggestion transport metadata",()=>{
 it("requires the exact closed lane and consistent independent live rights",()=>{
  expect(suggestionBinding({binding:identity.binding,effectWriter:"9007199254740993"})).toEqual({binding:identity.binding,effectWriter:"9007199254740993"});suggestionDescriptor(lane,identity);expect(suggestionPermissions(permissions)).toEqual(permissions);
  for(const value of [{...lane,formatVersion:2},{...lane,document:"other"},{...lane,effectWriter:"203"},{...lane,credential:"bad"}])expect(()=>suggestionDescriptor(value,identity)).toThrow();
  for(const value of [{...permissions,role:null},{...permissions,role:"propose"},{...permissions,canPropose:false},{...permissions,token:"bad"}])expect(()=>suggestionPermissions(value)).toThrow();
 });
 it("binds final events to their publication without lossy numeric sequence conversion",()=>{
  expect(suggestionEntry({publication,decision},identity).decision?.sequence).toBe("9007199254740994");
  for(const value of [{...decision,sequence:publication.sequence},{...decision,suggestionId:other},{...decision,acceptingWriter:"101"},{...decision,principal:7}])expect(()=>suggestionEntry({publication,decision:value},identity)).toThrow();
 });
 it("bounds pending/conflict DTOs and never accepts unknown native target shapes",()=>{
  expect(suggestionDependencies([{writer:"203",counter:"9"}])).toEqual([{writer:"203",counter:"9"}]);expect(suggestionConflicts([{kind:"children",parent:null},{kind:"property",block:"p",property:"level"}])).toHaveLength(2);
  for(const value of [[],[{writer:"203",counter:"0"}],[{writer:"203",counter:"1",token:"bad"}]])expect(()=>suggestionDependencies(value)).toThrow();
  for(const value of [[],[{kind:"unknown"}],[{kind:"document",offset:0}]])expect(()=>suggestionConflicts(value)).toThrow();
 });
 it("reads a frozen multi-page feed with exact canonical large sequences",async()=>{
  const request=vi.fn().mockResolvedValueOnce(page([update],publication.sequence,decision.sequence,true)).mockResolvedValueOnce(page([decided],decision.sequence));
  const result=await readSuggestionFeed(request,identity);expect(result.entries.get(digest)).toEqual({publication,decision});expect(request.mock.calls[1]?.[0].cursor).toEqual({binding:identity.binding,after:publication.sequence,through:decision.sequence});expect(result.through).toBe(decision.sequence);
 });
 it("accepts an empty activated lane but refuses unbounded/nonprogressing or changed frozen cuts",async()=>{
  expect((await readSuggestionFeed(vi.fn().mockResolvedValue(page([],"3")),identity)).entries.size).toBe(0);
  for(const response of [page([],"3","4",true),page([update,update]),page([decided],decision.sequence),page([update],"2"),{...page([update]),token:"bad"}])await expect(readSuggestionFeed(vi.fn().mockResolvedValue(response),identity)).rejects.toThrow();
  const request=vi.fn().mockResolvedValueOnce(page([update],publication.sequence,decision.sequence,true)).mockResolvedValueOnce(page([decided],decision.sequence,"9007199254740995"));await expect(readSuggestionFeed(request,identity)).rejects.toThrow("suggestion_page_invalid");
 });
 it("refuses immutable duplicate decisions, contradictory events and host rollback",async()=>{
  await expect(readSuggestionFeed(vi.fn().mockResolvedValue(page([update,decided,decided],decision.sequence)),identity)).rejects.toThrow();
  const previous={publication,decision},feed=await readSuggestionFeed(vi.fn().mockResolvedValue(page([update])),identity);
  expect(()=>checkSuggestionFeed([previous],feed)).toThrow("suggestion_server_rollback");expect(()=>checkSuggestionFeed([{publication:{...publication,suggestion:{...publication.suggestion,id:other}},decision:null}],feed)).toThrow();
 });
});
describe("suggestion extension on the existing author socket",()=>{
 it("requires explicit native capability, transport V2 and a local durability hook",()=>{
  for(const change of [{persistLocal:undefined},{identity:{...fixture().options.identity,writerTransport:undefined}},{suggestions:{binding:identity.binding,effectWriter:"101"}}]){const t=fixture();expect(()=>new SharedRelaySync(t.core,{...t.options,...change} as never)).toThrow("suggestion_transport_required");}
  const t=fixture();vi.spyOn(t.core,"supportsDocumentSuggestions").mockReturnValue(false);expect(()=>new SharedRelaySync(t.core,t.options)).toThrow("suggestion_transport_required");
 });
 it("negotiates once, resumes once, strips payload authority and preserves the ordinary channel",async()=>{
  const t=fixture(),sync=new SharedRelaySync(t.core,t.options);try{await sync.connect();sync.checkSuggestionQueue(t.core,identity);await sync.requestSuggestion({kind:"suggestionDecide",suggestionId:digest,decision:"accept",binding:"bad",principal:"attacker",writer:"999"} as never);expect(t.request.mock.calls.filter(([value])=>value["kind"]==="resume")).toHaveLength(1);expect(t.request.mock.calls.at(-1)?.[0]).toEqual({kind:"suggestionDecide",decision:{binding:identity.binding,suggestionId:digest,decision:"accept"}});expect(sync.state().status).toBe("ready");expect(sync.suggestionState().ready).toBe(true);expect(()=>sync.checkSuggestionQueue(t.core,{...identity,effectWriter:"203"})).toThrow();expect(()=>sync.checkSuggestionQueue({} as SharedRichEditor,identity)).toThrow();}finally{sync.dispose();}
 });
 it("requires capability and exact descriptor confirmation before native imports",async()=>{
  for(const edit of [{capabilities:["writerTransportV2"]},{capabilities:["writerTransportV2","documentSuggestionsV1","documentSuggestionsV1"]},{documentSuggestionsDescriptor:{...lane,effectWriter:"203"}},{documentSuggestionsPermissions:{...permissions,canReject:false}}]){
   const t=fixture(),base=t.request.getMockImplementation()!;t.request.mockImplementation(async request=>({...await base(request),...(request["kind"]==="authenticate"?edit:{})}));const sync=new SharedRelaySync(t.core,t.options);try{await expect(sync.connect()).rejects.toThrow();expect(t.core.receiveFrame).not.toHaveBeenCalled();}finally{sync.dispose();}
  }
 });
 it("keeps fresh hints separate from durable metadata and fences an expired author lease",async()=>{
  const t=fixture(),sync=new SharedRelaySync(t.core,t.options),listener=vi.fn();sync.subscribe(listener);try{await sync.connect();t.event({kind:"documentSuggestionsChanged",permissions:{role:null,canPropose:false,canAccept:false,canReject:false}});expect(sync.suggestionState().permissions?.canPropose).toBe(false);await Promise.resolve();expect(listener).toHaveBeenCalled();const base=t.request.getMockImplementation()!;t.request.mockImplementation(async value=>{if(value["kind"]==="suggestionRead")throw new SharedRelayError("lease_rejected");return base(value);});await expect(sync.requestSuggestion({kind:"suggestionRead",suggestionId:digest})).rejects.toThrow();expect(sync.state().status).toBe("fenced");}finally{sync.dispose();}
 });
 it("does not lose an explicit effect response behind an earlier queued catchup",async()=>{
  const t=fixture(),base=t.request.getMockImplementation()!,sync=new SharedRelaySync(t.core,t.options);try{await sync.connect();t.request.mockImplementation(async value=>{if(value["kind"]==="sync")t.event({kind:"catchup",frame:"earlier queued hint"});return base(value);});await sync.refreshDocument();expect(t.core.receiveFrame).toHaveBeenCalledWith("earlier queued hint",expect.anything());expect(t.core.receiveFrame).toHaveBeenCalledWith("explicit-effect",expect.anything());}finally{sync.dispose();}
 });
 it("fences the same author when explicit catchup discovers an invalid lease",async()=>{
  const t=fixture(),base=t.request.getMockImplementation()!,sync=new SharedRelaySync(t.core,t.options);try{await sync.connect();t.request.mockImplementation(async value=>{if(value["kind"]==="sync")throw new SharedRelayError("lease_rejected");return base(value);});await expect(sync.refreshDocument()).rejects.toThrow("lease_rejected");expect(sync.state().status).toBe("fenced");expect(sync.suggestionState().ready).toBe(false);}finally{sync.dispose();}
 });
 it("bounds extension requests and refuses late results after disconnect",async()=>{
  const t=fixture(),base=t.request.getMockImplementation()!,sync=new SharedRelaySync(t.core,t.options);const release:((value:Record<string,unknown>)=>void)[]=[];
  try{await sync.connect();t.request.mockImplementation(value=>value["kind"]==="suggestionRead"?new Promise(resolve=>release.push(resolve)):base(value));const first=sync.requestSuggestion({kind:"suggestionRead",suggestionId:digest}),second=sync.requestSuggestion({kind:"suggestionRead",suggestionId:other});await expect(sync.requestSuggestion({kind:"suggestionRead",suggestionId:digest})).rejects.toThrow("suggestion_request_budget");sync.disconnect();for(const resolve of release)resolve({kind:"suggestionEntry",entry:null});await expect(first).rejects.toThrow("disconnected");await expect(second).rejects.toThrow("disconnected");expect(t.core.receiveFrame).toHaveBeenCalledTimes(1);}finally{sync.dispose();}
 });
 it("does not widen original capability or event families",async()=>{
  expect(()=>transportCapabilities(["writerTransportV2","documentSuggestionsV1"],2)).toThrow();
  const sockets:EventTarget[]=[];class Socket extends EventTarget{bufferedAmount=0;constructor(_url:string){super();sockets.push(this);queueMicrotask(()=>this.dispatchEvent(new Event("open")));}send(){}close(){}}
  vi.stubGlobal("WebSocket",Socket);
  for(const mode of ["original","document","review","versions","suggestions"]){const event=vi.fn(),closed=vi.fn(),args=[identity.endpoint,1000,event,closed] as const;const channel=await(mode==="original"?RelayChannel.open(...args):mode==="document"?RelayChannel.openDocument(...args):mode==="review"?RelayChannel.openReview(...args):mode==="versions"?RelayChannel.openVersions(...args):RelayChannel.openSuggestions(...args,"original"));try{sockets.at(-1)!.dispatchEvent(new MessageEvent("message",{data:JSON.stringify({format:"breditor/relay",formatVersion:1,id:null,result:{kind:"documentSuggestionsChanged",permissions}})}));expect(event).toHaveBeenCalledTimes(mode==="suggestions"?1:0);expect(closed).toHaveBeenCalledTimes(mode==="suggestions"?0:1);}finally{channel.close();}}
 });
});
