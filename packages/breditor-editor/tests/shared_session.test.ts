import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({runtime:vi.fn(),compile:vi.fn(),compileV2:vi.fn(),compileV3:vi.fn(),compileV4:vi.fn(),toolbarV4:vi.fn(()=>[]),open:vi.fn(),mount:vi.fn(),restoreTyping:vi.fn(),restoreGeneral:vi.fn(),supportsGeneral:vi.fn()}));
vi.mock("../src/shared_profile.js",()=>({initializeSharedRuntime:mocks.runtime,standardSharedProfileConfiguration:{format:"breditor/shared-rich-profile",formatVersion:1,schema:{name:"test/profile",version:1},extensions:[]},structuralSharedProfileConfigurationV2:{format:"breditor/shared-rich-profile",formatVersion:2,schema:{name:"test/profile",version:2},extensions:[]},layoutSharedProfileConfigurationV3:{format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"test/profile",version:3},extensions:[]},richSharedProfileConfigurationV4:{format:"breditor/shared-rich-profile",formatVersion:4,schema:{name:"test/profile",version:4},extensions:[]}}));
vi.mock("@breditor/collaboration",()=>({SharedEditorError:class extends Error {constructor(readonly code:string,message:string){super(message);}},restoreSharedTypingEditor:mocks.restoreTyping,restoreSharedGeneralEditor:mocks.restoreGeneral,supportsSharedGeneralRanges:mocks.supportsGeneral,compileStandardSharedProfileV1:mocks.compile,compileStandardStructuralSharedProfileV2:mocks.compileV2,compileStandardLayoutSharedProfileV3:mocks.compileV3,compileStandardRichSharedProfileV4:mocks.compileV4,SharedPersistentSession:{open:mocks.open},mountSharedEditor:mocks.mount,createStandardSharedToolbarV1:()=>[],createStructuralSharedToolbarV2:()=>[],createLayoutSharedToolbarV3:()=>[],createRichSharedToolbarV4:mocks.toolbarV4}));
vi.mock("@breditor/experimental-rich-content",()=>({createStandardRichInlinePresentationV1:()=>({})}));
import {openSharedEditor,SharedEditorOpenError} from "../src/shared_session.js";
import {openSharedDocumentEditor} from "../src/shared_document_session.js";

function setup(){
 const events:string[]=[],host=document.createElement("div"),original=document.createElement("button");host.append(original);
 const raw={observe:vi.fn(()=>({free:vi.fn()})),set_selection:vi.fn(),free:vi.fn()};
 const profile={descriptor_json:()=>JSON.stringify({schema:{name:"test/profile",version:1},schemaFingerprint:"native proof"}),inline_catalog_json:()=>"catalog",create:vi.fn(()=>raw),join_frame:vi.fn(()=>raw),restore:vi.fn(()=>raw),free:vi.fn()};
 const core={view:()=>({revision:"1"}),checkpointJson:()=>"exact journal"};
 const session={core,recovered:false,close:vi.fn(async()=>{events.push("saved and released");}),discardAndClose:vi.fn(async()=>{}),state:()=>({status:"saved"}),flush:vi.fn(async()=>{}),retry:vi.fn(async()=>{})};
 const dom={surface:document.createElement("div"),toolbar:document.createElement("div"),status:document.createElement("p"),dispose:vi.fn(()=>{events.push("UI stopped");host.replaceChildren();delete host.dataset["breditorShared"]; }),execute:vi.fn(),select:vi.fn(),focus:vi.fn(),refreshAssets:vi.fn(),closeTypingGroup:vi.fn(()=>true)};
 mocks.runtime.mockResolvedValue({});mocks.compile.mockReturnValue(profile);mocks.compileV2.mockReturnValue(profile);mocks.compileV3.mockReturnValue(profile);mocks.compileV4.mockReturnValue(profile);mocks.open.mockImplementation(async options=>{options.create();return session;});
 mocks.mount.mockImplementation(()=>{host.dataset["breditorShared"]="";host.replaceChildren(dom.surface);return dom;});
 return {events,host,original,raw,profile,session,dom,options:{host,database:"store",room:"room",writer:"101"}};
}
beforeEach(()=>{for(const fn of Object.values(mocks))fn.mockReset();});
describe("durable SDK session coordinator",()=>{
 it("placeholder capability rejects before durable storage or writer creation in both scopes",async()=>{
  for(const documentScope of [false,true]){const t=setup();await expect(documentScope?openSharedDocumentEditor({...t.options,selectionEditing:"document-v1",placeholder:"Prompt"}):openSharedEditor({...t.options,placeholder:"Prompt"})).rejects.toMatchObject({code:"placeholder_unavailable"});expect(mocks.open).not.toHaveBeenCalled();expect(t.profile.create).not.toHaveBeenCalled();expect(t.profile.restore).not.toHaveBeenCalled();expect(mocks.mount).not.toHaveBeenCalled();expect(t.profile.free).toHaveBeenCalledOnce();expect(t.host.firstChild).toBe(t.original);}
  mocks.runtime.mockClear();const bad=setup();mocks.runtime.mockClear();await expect(openSharedEditor({...bad.options,placeholder:"\ud800"})).rejects.toThrow("placeholder");expect(mocks.runtime).not.toHaveBeenCalled();expect(mocks.open).not.toHaveBeenCalled();expect(bad.host.firstChild).toBe(bad.original);
 });
 it.each(["generalCheckpoint","generalTypingCheckpoint"] as const)("selects %s only through its explicit initial discriminator",async kind=>{
  const t=setup();mocks.supportsGeneral.mockReturnValue(true);mocks.restoreGeneral.mockReturnValue(t.raw);
  const editor=await openSharedEditor({...t.options,initial:{kind,checkpointJson:"opaque general save"}}),history=kind==="generalTypingCheckpoint"?"typing-v1":"explicit";
  expect(mocks.open.mock.calls[0]![0]).toMatchObject({rangeEditing:"general-v1",history});expect(mocks.restoreGeneral).toHaveBeenCalledWith(t.profile,"room","opaque general save",history);expect(mocks.restoreTyping).not.toHaveBeenCalled();expect(t.profile.restore).not.toHaveBeenCalled();await editor.close();
 });
 it("rejects unknown/conflicting policies before claiming the host or initializing Wasm",async()=>{
  const t=setup();await expect(openSharedEditor({...t.options,rangeEditing:"auto" as "general-v1"})).rejects.toThrow("rangeEditing original or general-v1");
  await expect(openSharedEditor({...t.options,rangeEditing:"original",initial:{kind:"generalCheckpoint",checkpointJson:"opaque"}})).rejects.toThrow("declared general-v1");
  await expect(openSharedEditor({...t.options,history:"explicit",initial:{kind:"generalTypingCheckpoint",checkpointJson:"opaque"}})).rejects.toThrow("declared natural history");expect(mocks.runtime).not.toHaveBeenCalled();expect(t.host.firstChild).toBe(t.original);
 });
 it("requires the complete general recovery factory before opening a durable writer",async()=>{
  const t=setup();mocks.supportsGeneral.mockReturnValue(false);await expect(openSharedEditor({...t.options,rangeEditing:"general-v1"})).rejects.toMatchObject({code:"general_range_unavailable"});expect(mocks.open).not.toHaveBeenCalled();expect(t.profile.free).toHaveBeenCalledOnce();expect(t.host.firstChild).toBe(t.original);
 });
 it("dispatches stored general and original saves only to their declared recovery factories",async()=>{
  const t=setup();mocks.supportsGeneral.mockReturnValue(true);mocks.restoreGeneral.mockReturnValue(t.raw);mocks.restoreTyping.mockReturnValue(t.raw);
  mocks.open.mockImplementation(async options=>{options.restore("ordinary general","explicit","general-v1");options.restore("natural general","typing-v1","general-v1");options.restore("ordinary original","explicit");options.restore("natural original","typing-v1");return t.session;});
  const editor=await openSharedEditor({...t.options,rangeEditing:"general-v1",history:"typing-v1"});expect(mocks.restoreGeneral.mock.calls).toEqual([[t.profile,"room","ordinary general","explicit"],[t.profile,"room","natural general","typing-v1"]]);expect(t.profile.restore).toHaveBeenCalledWith("room","ordinary original");expect(mocks.restoreTyping).toHaveBeenCalledWith(t.profile,"room","natural original");await editor.close();
 });
 it("exposes exactly the mounted toolbar controls for shared slash-command catalogs",async()=>{
  const t=setup(),custom=[{id:"h1",label:"H1",enabled:()=>true,run:()=>{}}],editor=await openSharedEditor({...t.options,toolbar:()=>custom});
  expect(mocks.mount.mock.calls[0]![1].toolbar).toBe(custom);expect(editor.toolbarControls()).toEqual(custom);expect(Object.isFrozen(editor.toolbarControls())).toBe(true);await editor.close();
 });
 it("default options neither require new capability nor add a general storage discriminator",async()=>{
  const t=setup(),editor=await openSharedEditor(t.options);expect(mocks.supportsGeneral).not.toHaveBeenCalled();expect(mocks.open.mock.calls[0]![0]).not.toHaveProperty("rangeEditing");expect(editor.rangePolicy()).toBe("original");await editor.close();
 });
 it.each(["explicit","typing-v1"] as const)("failed general %s startup cleanup hands off its declared exact recovery family",async history=>{
  const t=setup();mocks.supportsGeneral.mockReturnValue(true);t.session.core.view=()=>({revision:"1",rangeEditing:"general-v1",...(history==="typing-v1"?{historyGrouping:"typing-v1"}:{})}) as ReturnType<typeof t.session.core.view>;
  mocks.mount.mockImplementation(()=>{throw Error("Bad toolbar");});t.session.close.mockRejectedValueOnce(Error("Quota"));let failure:unknown;try{await openSharedEditor({...t.options,rangeEditing:"general-v1",history});}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(SharedEditorOpenError);const recovery=(failure as SharedEditorOpenError).recovery;expect(recovery.rangePolicy?.()).toBe("general-v1");expect(recovery.historyPolicy?.()).toBe(history);expect(recovery.checkpointJson()).toBe("exact journal");expect(t.session.discardAndClose).not.toHaveBeenCalled();await recovery.close();expect(t.session.close).toHaveBeenCalledTimes(2);expect(t.host.firstChild).toBe(t.original);
 });
 it("unknown policy and an explicitly conflicting recovery family reject before runtime or host claim",async()=>{
  const t=setup();await expect(openSharedEditor({...t.options,history:"automatic" as "explicit"})).rejects.toThrow("Expected history");await expect(openSharedEditor({...t.options,history:"explicit",initial:{kind:"typingCheckpoint",checkpointJson:"grouped"}})).rejects.toThrow("declared natural history");expect(mocks.runtime).not.toHaveBeenCalled();expect(t.host.firstChild).toBe(t.original);
 });
 it("declares grouped recovery separately and never falls back to the original factory",async()=>{
  const t=setup();mocks.restoreTyping.mockReturnValue(t.raw);
  const editor=await openSharedEditor({...t.options,initial:{kind:"typingCheckpoint",checkpointJson:"grouped"}});
  expect(mocks.open.mock.calls[0]![0].history).toBe("typing-v1");expect(mocks.restoreTyping).toHaveBeenCalledWith(t.profile,"room","grouped");expect(t.profile.restore).not.toHaveBeenCalled();expect(editor.closeTypingGroup("1")).toBe(true);expect(t.dom.closeTypingGroup).toHaveBeenCalledWith("1");await editor.close();
  const other=setup();mocks.restoreTyping.mockImplementation(()=>{throw Error("Missing native capability");});await expect(openSharedEditor({...other.options,initial:{kind:"typingCheckpoint",checkpointJson:"grouped"}})).rejects.toThrow("Missing native capability");expect(other.profile.restore).not.toHaveBeenCalled();expect(other.host.firstChild).toBe(other.original);
 });
 it("restores only the declared stored family, including original journals upgraded by explicit opt-in",async()=>{
  const t=setup();mocks.restoreTyping.mockReturnValue(t.raw);mocks.open.mockImplementation(async options=>{expect(options.history).toBe("typing-v1");options.restore("legacy","explicit");options.restore("grouped","typing-v1");return t.session;});
  const editor=await openSharedEditor({...t.options,history:"typing-v1"});expect(t.profile.restore).toHaveBeenCalledWith("room","legacy");expect(mocks.restoreTyping).toHaveBeenCalledWith(t.profile,"room","grouped");await editor.close();
 });
 it("resume-only opening never seeds a fresh writer when no durable journal exists",async()=>{
  const t=setup();await expect(openSharedEditor({...t.options,initial:{kind:"resume"}})).rejects.toMatchObject({code:"session_missing"});
  expect(t.profile.create).not.toHaveBeenCalled();expect(t.profile.join_frame).not.toHaveBeenCalled();expect(t.host.firstChild).toBe(t.original);expect(t.profile.free).toHaveBeenCalledOnce();
 });
 it("selects shared V2 only explicitly and rejects an invalid selector before claiming its host",async()=>{
  const t=setup(),editor=await openSharedEditor({...t.options,richLanguage:2});
  expect(mocks.compileV2).toHaveBeenCalledWith({},expect.objectContaining({formatVersion:2,schema:{name:"test/profile",version:2}}));expect(mocks.compile).not.toHaveBeenCalled();await editor.close();
  const other=setup();await expect(openSharedEditor({...other.options,richLanguage:5 as 2})).rejects.toThrow("richLanguage 1, 2, 3 or 4");expect(other.host.firstChild).toBe(other.original);
 });
 it("selects shared V4 construction, toolbar and durable model binding only through the explicit V4 option",async()=>{
  const t=setup(),editor=await openSharedEditor({...t.options,richLanguage:4});
  expect(mocks.compileV4).toHaveBeenCalledWith({},expect.objectContaining({formatVersion:4,schema:{name:"test/profile",version:4}}));expect(mocks.compile).not.toHaveBeenCalled();expect(mocks.compileV2).not.toHaveBeenCalled();expect(mocks.compileV3).not.toHaveBeenCalled();
  expect(mocks.open.mock.calls[0]![0].richLanguage).toBe(4);expect(mocks.toolbarV4).toHaveBeenCalledOnce();await editor.close();
 });
 it("rejects unknown future languages instead of mapping them to V4 or any older language",async()=>{
  for(const language of [5,0,"4",4.5]){const t=setup();await expect(openSharedEditor({...t.options,richLanguage:language as 4})).rejects.toThrow("richLanguage 1, 2, 3 or 4");
   expect(mocks.compileV4).not.toHaveBeenCalled();expect(mocks.compileV3).not.toHaveBeenCalled();expect(mocks.open).not.toHaveBeenCalled();expect(t.host.firstChild).toBe(t.original);}
 });
 it("selects V3 construction and durable model binding only through the explicit V3 option",async()=>{
  const t=setup(),editor=await openSharedEditor({...t.options,richLanguage:3});
  expect(mocks.compileV3).toHaveBeenCalledWith({},expect.objectContaining({formatVersion:3,schema:{name:"test/profile",version:3}}));expect(mocks.compile).not.toHaveBeenCalled();expect(mocks.compileV2).not.toHaveBeenCalled();expect(mocks.open.mock.calls[0]![0].richLanguage).toBe(3);await editor.close();
 });
 it("prepares an admitted empty caret, borrows the native core and stops UI before one durable close",async()=>{
  const t=setup(),editor=await openSharedEditor({...t.options,initial:{kind:"empty",blockId:"first"}});
  expect(t.profile.create).toHaveBeenCalledWith(expect.stringContaining('"breditor/document-id":"room"'),"101");expect(t.raw.set_selection).toHaveBeenCalledWith(expect.any(Object),expect.stringContaining('"block":"first"'));expect(t.profile.free).toHaveBeenCalledTimes(1);expect(mocks.mount.mock.calls[0]![1].coreOwnership).toBe("borrow");
  const a=editor.close(),b=editor.close();expect(a).toBe(b);expect(t.events).toEqual(["UI stopped","saved and released"]);await a;expect(t.session.close).toHaveBeenCalledTimes(1);expect(t.session.discardAndClose).not.toHaveBeenCalled();expect(()=>editor.focus()).toThrow("closing or closed");await editor.close();expect(t.session.close).toHaveBeenCalledTimes(1);
 });
 it("abort cancels only initialization, restores the host and creates no native factory or lease",async()=>{
  const t=setup(),abort=new AbortController();let finish!:(runtime:object)=>void;mocks.runtime.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const opening=openSharedEditor({...t.options,signal:abort.signal});abort.abort();await expect(opening).rejects.toMatchObject({name:"AbortError"});expect(t.host.firstChild).toBe(t.original);expect(mocks.compile).not.toHaveBeenCalled();expect(mocks.open).not.toHaveBeenCalled();finish({});
 });
 it("an abort while storage opens waits for safe writer closure and never mounts a late result",async()=>{
  const t=setup(),abort=new AbortController();let finish!:(session:typeof t.session)=>void;mocks.open.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const opening=openSharedEditor({...t.options,signal:abort.signal});await vi.waitFor(()=>expect(mocks.open).toHaveBeenCalled());abort.abort();finish(t.session);await expect(opening).rejects.toMatchObject({name:"AbortError"});expect(mocks.mount).not.toHaveBeenCalled();expect(t.session.close).toHaveBeenCalledTimes(1);expect(t.profile.free).toHaveBeenCalledTimes(1);expect(t.host.firstChild).toBe(t.original);
 });
 it("a failed mount restores exact original nodes; failed cleanup hands off rather than discards its owner",async()=>{
  const t=setup();mocks.mount.mockImplementation(()=>{t.host.textContent="partial mount";throw Error("Bad toolbar");});t.session.close.mockRejectedValue(Error("Quota"));
  let failure:unknown;try{await openSharedEditor(t.options);}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(SharedEditorOpenError);expect((failure as SharedEditorOpenError).recovery.checkpointJson()).toBe("exact journal");expect(t.session.discardAndClose).not.toHaveBeenCalled();expect(t.host.firstChild).toBe(t.original);expect(t.profile.free).toHaveBeenCalledTimes(1);
 });
 it("a failed close keeps checkpoint access, rejects UI commands and can be retried without remount",async()=>{
  const t=setup(),editor=await openSharedEditor(t.options);t.session.close.mockRejectedValueOnce(Error("Quota"));await expect(editor.close()).rejects.toThrow("Quota");expect(editor.checkpointJson()).toBe("exact journal");expect(()=>editor.execute({commands:[]})).toThrow("closing or closed");expect(t.dom.dispose).toHaveBeenCalledTimes(1);expect(t.session.discardAndClose).not.toHaveBeenCalled();await editor.close();expect(t.session.close).toHaveBeenCalledTimes(2);expect(t.dom.dispose).toHaveBeenCalledTimes(1);
 });
 it("adapter shutdown runs once and a throwing shutdown callback cannot cancel saving",async()=>{
  const t=setup(),closing=vi.fn(()=>{throw Error("Adapter failure");}),report=vi.fn(),editor=await openSharedEditor({...t.options,onClosing:closing,onError:report});await editor.close();await editor.close();expect(closing).toHaveBeenCalledTimes(1);expect(closing).toHaveBeenCalledWith(editor);expect(report).toHaveBeenCalledWith(expect.any(Error));expect(t.session.close).toHaveBeenCalledTimes(1);
 });
});
