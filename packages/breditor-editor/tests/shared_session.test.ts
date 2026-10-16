import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({runtime:vi.fn(),compile:vi.fn(),compileV2:vi.fn(),open:vi.fn(),mount:vi.fn()}));
vi.mock("../src/shared_profile.js",()=>({initializeSharedRuntime:mocks.runtime,standardSharedProfileConfiguration:{format:"breditor/shared-rich-profile",formatVersion:1,schema:{name:"test/profile",version:1},extensions:[]},structuralSharedProfileConfigurationV2:{format:"breditor/shared-rich-profile",formatVersion:2,schema:{name:"test/profile",version:2},extensions:[]}}));
vi.mock("@breditor/collaboration",()=>({SharedEditorError:class extends Error {constructor(readonly code:string,message:string){super(message);}},compileStandardSharedProfileV1:mocks.compile,compileStandardStructuralSharedProfileV2:mocks.compileV2,SharedPersistentSession:{open:mocks.open},mountSharedEditor:mocks.mount,createStandardSharedToolbarV1:()=>[],createStructuralSharedToolbarV2:()=>[]}));
vi.mock("@breditor/experimental-rich-content",()=>({createStandardRichInlinePresentationV1:()=>({})}));
import {openSharedEditor,SharedEditorOpenError} from "../src/shared_session.js";

function setup(){
 const events:string[]=[],host=document.createElement("div"),original=document.createElement("button");host.append(original);
 const raw={observe:vi.fn(()=>({free:vi.fn()})),set_selection:vi.fn(),free:vi.fn()};
 const profile={descriptor_json:()=>JSON.stringify({schema:{name:"test/profile",version:1},schemaFingerprint:"native proof"}),inline_catalog_json:()=>"catalog",create:vi.fn(()=>raw),join_frame:vi.fn(()=>raw),restore:vi.fn(()=>raw),free:vi.fn()};
 const core={view:()=>({revision:"1"}),checkpointJson:()=>"exact journal"};
 const session={core,recovered:false,close:vi.fn(async()=>{events.push("saved and released");}),discardAndClose:vi.fn(async()=>{}),state:()=>({status:"saved"}),flush:vi.fn(async()=>{}),retry:vi.fn(async()=>{})};
 const dom={surface:document.createElement("div"),toolbar:document.createElement("div"),status:document.createElement("p"),dispose:vi.fn(()=>{events.push("UI stopped");host.replaceChildren();delete host.dataset["breditorShared"]; }),execute:vi.fn(),select:vi.fn(),focus:vi.fn(),refreshAssets:vi.fn()};
 mocks.runtime.mockResolvedValue({});mocks.compile.mockReturnValue(profile);mocks.compileV2.mockReturnValue(profile);mocks.open.mockImplementation(async options=>{options.create();return session;});
 mocks.mount.mockImplementation(()=>{host.dataset["breditorShared"]="";host.replaceChildren(dom.surface);return dom;});
 return {events,host,original,raw,profile,session,dom,options:{host,database:"store",room:"room",writer:"101"}};
}
beforeEach(()=>{for(const fn of Object.values(mocks))fn.mockReset();});
describe("durable SDK session coordinator",()=>{
 it("resume-only opening never seeds a fresh writer when no durable journal exists",async()=>{
  const t=setup();await expect(openSharedEditor({...t.options,initial:{kind:"resume"}})).rejects.toMatchObject({code:"session_missing"});
  expect(t.profile.create).not.toHaveBeenCalled();expect(t.profile.join_frame).not.toHaveBeenCalled();expect(t.host.firstChild).toBe(t.original);expect(t.profile.free).toHaveBeenCalledOnce();
 });
 it("selects shared V2 only explicitly and rejects an invalid selector before claiming its host",async()=>{
  const t=setup(),editor=await openSharedEditor({...t.options,richLanguage:2});
  expect(mocks.compileV2).toHaveBeenCalledWith({},expect.objectContaining({formatVersion:2,schema:{name:"test/profile",version:2}}));expect(mocks.compile).not.toHaveBeenCalled();await editor.close();
  const other=setup();await expect(openSharedEditor({...other.options,richLanguage:3 as 2})).rejects.toThrow("richLanguage 1 or 2");expect(other.host.firstChild).toBe(other.original);
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
