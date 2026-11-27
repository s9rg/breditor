import {beforeEach,expect,it,vi} from "vitest";
// Fake native owners: a checkpoint is the exact JSON of {text,history,selection}. A test-only
// fault hook (`mocks.armed`) makes the next owner call trap with a Wasm RuntimeError and then
// leaves that owner poisoned, like a Rust object whose borrow was aborted by the trap.
interface State {text:string;history:number;selection:unknown;typing:boolean}
interface FakeDom {surface:HTMLDivElement;poisoned:boolean;core:ReturnType<typeof makeCore>;input(text:string):void;dispose:ReturnType<typeof vi.fn>;focus:ReturnType<typeof vi.fn>;options:Record<string,unknown>}
const mocks=vi.hoisted(()=>({compile:vi.fn(),runtime:vi.fn(),mount:vi.fn(),armed:false as boolean,doms:[] as FakeDom[]}));
vi.mock("../src/runtime.js",()=>({initializeLocalRuntime:mocks.runtime}));
vi.mock("@breditor/experimental-rich-content",()=>({compileStandardRichProfileV1:mocks.compile,compileStandardStructuralRichProfileV2:mocks.compile,compileStandardLayoutRichProfileV3:mocks.compile,compileStandardRichProfileV4:mocks.compile,createRichToolbarV4:()=>[],createStandardRichInlinePresentationV1:()=>({}),createStandardRichToolbarV1:()=>[],createStructuralRichToolbarV2:()=>[],createLayoutRichToolbarV3:()=>[],mountRichEditor:mocks.mount,mountDocumentRichEditor:mocks.mount,insertImageFiles:vi.fn()}));
import {openLocalEditor} from "../src/local.js";
import {openLocalDocumentEditor} from "../src/local_document.js";
import {CrashRecoveryError,classifyCrash,type CrashDiagnostic,type CrashFailedDiagnostic,type CrashRestartedDiagnostic} from "../src/crash_recovery.js";
const secret="SECRET-CONTENT";
function makeCore(state:State){
 const core={state,poisoned:false,
  supportsTypingHistory:()=>true,enableTypingHistory:vi.fn(()=>{state.typing=true;return true;}),
  supportsReadOnly:()=>true,setReadOnly:vi.fn((_value:boolean)=>true),supportsGeneralRanges:()=>true,
  supportsRestrictedEditing:()=>true,setRestrictedEditing:vi.fn((_policy:unknown)=>true),
  execute:vi.fn(),
  checkpointJson:()=>JSON.stringify(state),
  view:()=>({revision:String(state.history),selection:state.selection,historyGrouping:state.typing?"typing-v1":undefined}),
  dispose:vi.fn(()=>{if(core.poisoned)throw Error("recursive use of an object detected which would lead to unsafe aliasing in rust");}),
 };
 return core;
}
function restore(checkpointJson:string,typing:boolean){const state=JSON.parse(checkpointJson) as State;if(state.typing!==typing)throw Error("wrong checkpoint family");return makeCore(state);}
function profile(){
 return {descriptor:()=>({schema:{name:"example/unit",version:1},schemaFingerprint:"test"}),inlineCatalogJson:()=>"[]",
  createEditor:vi.fn(()=>makeCore({text:"",history:0,selection:null,typing:false})),
  restoreEditor:vi.fn((json:string)=>restore(json,false)),supportsTypingHistory:()=>true,restoreTypingEditor:vi.fn((json:string)=>restore(json,true)),
  supportsDocumentSelection:()=>true,createDocumentEditor:vi.fn(()=>makeCore({text:"",history:0,selection:null,typing:false})),
  restoreDocumentEditor:vi.fn((json:string)=>restore(json,false)),restoreDocumentTypingEditor:vi.fn((json:string)=>restore(json,true)),
  dispose:vi.fn()};
}
function mount(host:HTMLElement,options:Record<string,unknown> & {core:ReturnType<typeof makeCore>}):unknown{
 const core=options.core,surface=document.createElement("div");surface.tabIndex=0;
 host.dataset["breditorRich"]="";host.replaceChildren(surface);
 const guard=()=>{
  if(dom.poisoned)throw Error("recursive use of an object detected which would lead to unsafe aliasing in rust");
  if(mocks.armed){mocks.armed=false;dom.poisoned=true;core.poisoned=true;throw new WebAssembly.RuntimeError("unreachable");}
 };
 const dom={surface,toolbar:document.createElement("div"),status:document.createElement("p"),poisoned:false,core,options,
  execute(command:{kind:string;text?:string;selection?:unknown}){
   guard();
   if(command.kind==="insert"){core.state.text+=command.text;core.state.history++;(options["onChange"] as (v:unknown,o:string)=>void|undefined)?.(core.view(),"content");return "content";}
   if(command.kind==="setSelection"){core.state.selection=command.selection;(options["onChange"] as (v:unknown,o:string)=>void|undefined)?.(core.view(),"selection");return "selection";}
   return "unchanged";
  },
  // The controller's input path: a throw is reported through onError, never to the caller.
  input(text:string){try{dom.execute({kind:"insert",text});}catch(error){(options["onError"] as ((e:unknown)=>void)|undefined)?.(error);}},
  view:()=>{guard();return core.view();},checkpointJson:()=>{guard();return core.checkpointJson();},
  focus:vi.fn(()=>surface.focus()),setReadOnly:(value:boolean)=>core.setReadOnly(value),setRestrictedEditing:(policy:unknown)=>core.setRestrictedEditing(policy),setPlaceholderLabel:vi.fn(),
  dispose:vi.fn(()=>{host.replaceChildren();delete host.dataset["breditorRich"];core.dispose();}),
 };
 mocks.doms.push(dom as never);return dom;
}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
function events(){
 const crash=vi.fn<(d:CrashDiagnostic)=>void>(),restarted=vi.fn<(d:CrashRestartedDiagnostic)=>void>(),failed=vi.fn<(d:CrashFailedDiagnostic)=>void>();
 return {crash,restarted,failed,options:{onCrash:crash,onRestarted:restarted,onFailed:failed}};
}
let host:HTMLElement,currentProfile:ReturnType<typeof profile>;
beforeEach(()=>{
 vi.clearAllMocks();vi.restoreAllMocks();mocks.armed=false;mocks.doms=[];document.body.replaceChildren();
 currentProfile=profile();mocks.compile.mockImplementation(()=>currentProfile);mocks.runtime.mockResolvedValue({});mocks.mount.mockImplementation(mount);
 host=document.createElement("main");document.body.append(host);
});
const initial={kind:"document" as const,documentJson:"{}"};
it("restarts a trapped owner from the last exact checkpoint into the same host, keeping history",async()=>{
 const e=events(),onError=vi.fn(),onChange=vi.fn();
 const editor=await openLocalEditor({host,initial,onChange,onError,crashRecovery:e.options});
 expect(editor.recovery()).toEqual({phase:"running",restarts:0,editsSinceCheckpoint:0,checkpoint:"initial"});
 editor.execute({kind:"insert",text:secret} as never);
 const saved=editor.checkpointJson();
 editor.execute({kind:"insert",text:" unsaved"} as never);editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"b",offset:"1",affinity:"after"},focus:{block:"b",offset:"1",affinity:"after"}}} as never);
 expect(editor.recovery()).toMatchObject({editsSinceCheckpoint:1,checkpoint:"exact"});expect(onChange).toHaveBeenCalledTimes(3);
 const broken=mocks.doms[0]!;broken.surface.focus();
 mocks.armed=true;
 expect(()=>editor.execute({kind:"insert",text:"x"} as never)).toThrow(WebAssembly.RuntimeError);
 // Input is frozen and the editor refuses calls until the fresh owner is mounted.
 expect(host.hasAttribute("inert")).toBe(true);expect(host.getAttribute("aria-busy")).toBe("true");expect(host.getAttribute("data-breditor-recovery")).toBe("restarting");
 expect(editor.recovery().phase).toBe("restarting");
 expect(()=>editor.view()).toThrow(CrashRecoveryError);
 expect(e.crash).toHaveBeenCalledOnce();
 const crash=e.crash.mock.calls[0]![0];
 expect(crash).toEqual({format:"breditor/crash-diagnostic",formatVersion:1,reason:"wasm-trap",errorName:"RuntimeError",source:"api",restartsInWindow:0,editsLost:1,checkpoint:"exact"});
 await vi.waitFor(()=>expect(e.restarted).toHaveBeenCalledOnce());
 expect(e.restarted.mock.calls[0]![0]).toEqual({...crash,restarts:1});
 expect(JSON.stringify([e.crash.mock.calls,e.restarted.mock.calls])).not.toContain(secret);
 // Verified headlessly, then reopened from exactly that checkpoint into the same host.
 expect(currentProfile.restoreEditor.mock.calls.map(call=>call[0])).toEqual([saved,saved]);
 expect(broken.dispose).toHaveBeenCalledOnce();expect(mocks.doms).toHaveLength(2);
 const fresh=mocks.doms[1]!;expect(host.firstChild).toBe(fresh.surface);expect(editor.surface).toBe(fresh.surface);
 expect(JSON.parse(editor.checkpointJson())).toMatchObject({text:secret,history:1});
 expect(host.hasAttribute("inert")).toBe(false);expect(host.hasAttribute("aria-busy")).toBe(false);expect(host.hasAttribute("data-breditor-recovery")).toBe(false);
 // Focus was inside the host, so the fresh surface is focused; the later selection is reapplied.
 expect(fresh.focus).toHaveBeenCalled();expect(document.activeElement).toBe(fresh.surface);
 expect(editor.view().selection).toMatchObject({kind:"text",anchor:{offset:"1"}});
 expect(editor.recovery()).toEqual({phase:"running",restarts:1,editsSinceCheckpoint:0,checkpoint:"exact"});
 expect(onError).not.toHaveBeenCalled();
 editor.execute({kind:"insert",text:"!"} as never);expect(JSON.parse(editor.checkpointJson()).text).toBe(`${secret}!`);
 editor.dispose();expect(fresh.dispose).toHaveBeenCalledOnce();expect(host.childNodes).toHaveLength(0);
});
it("detects input-path traps through onError and restarts typing history from its own family",async()=>{
 const e=events(),onError=vi.fn();
 const editor=await openLocalEditor({host,initial,history:"typing-v1",onError,crashRecovery:e.options});
 mocks.doms[0]!.input("a");editor.checkpointJson();
 mocks.armed=true;mocks.doms[0]!.input("b");
 expect(onError).toHaveBeenCalledOnce();expect(onError.mock.calls[0]![0]).toBeInstanceOf(WebAssembly.RuntimeError);
 expect(e.crash.mock.calls[0]![0]).toMatchObject({source:"input",reason:"wasm-trap"});
 await vi.waitFor(()=>expect(e.restarted).toHaveBeenCalledOnce());
 expect(currentProfile.restoreTypingEditor).toHaveBeenCalledTimes(2);expect(currentProfile.restoreEditor).not.toHaveBeenCalled();
 expect(JSON.parse(editor.checkpointJson())).toMatchObject({text:"a",typing:true});
 editor.dispose();
});
it("classifies only traps, poisoned owners and boundary invariants as crashes",async()=>{
 expect(classifyCrash(new WebAssembly.RuntimeError("unreachable"))).toBe("wasm-trap");
 expect(classifyCrash(Error("recursive use of an object detected which would lead to unsafe aliasing in rust"))).toBe("poisoned-owner");
 expect(classifyCrash(Error("null pointer passed to rust"))).toBe("poisoned-owner");
 expect(classifyCrash(Object.assign(Error("The rich read value was absent"),{code:"breditor_rich.boundary"}))).toBe("invariant");
 for(const refusal of [Object.assign(Error("stale"),{code:"breditor_rich.stale_observation"}),Object.assign(Error("locked"),{code:"breditor_rich.read_only"}),TypeError("bad"),"text"])expect(classifyCrash(refusal)).toBeUndefined();
 const e=events(),onError=vi.fn(),editor=await openLocalEditor({host,initial,onError,crashRecovery:e.options});
 const dom=mocks.doms[0]!,execute=vi.spyOn(dom as unknown as {execute:(c:unknown)=>unknown},"execute").mockImplementationOnce(()=>{throw Object.assign(Error("stale"),{code:"breditor_rich.stale_observation"});});
 expect(()=>editor.execute({kind:"insert",text:"x"} as never)).toThrow("stale");execute.mockRestore();
 (dom.options["onError"] as (e:unknown)=>void)(Error("Image file insertion requires an asset host"));
 expect(e.crash).not.toHaveBeenCalled();expect(editor.recovery().phase).toBe("running");expect(onError).toHaveBeenCalledOnce();
 editor.dispose();
});
it("stays frozen and read-only after the restart budget, keeping the verified checkpoint and the broken DOM",async()=>{
 let now=1_000_000;vi.spyOn(Date,"now").mockImplementation(()=>now);
 const e=events(),editor=await openLocalEditor({host,initial,crashRecovery:{...e.options,maxRestarts:2,windowMs:10_000}});
 editor.execute({kind:"insert",text:secret} as never);const saved=editor.checkpointJson();
 for(let restart=1;restart<=2;restart++){
  mocks.armed=true;expect(()=>editor.execute({kind:"insert",text:"x"} as never)).toThrow();now+=1000;
  await vi.waitFor(()=>expect(e.restarted).toHaveBeenCalledTimes(restart));
 }
 mocks.armed=true;expect(()=>editor.execute({kind:"insert",text:"x"} as never)).toThrow();
 expect(e.failed).toHaveBeenCalledOnce();expect(e.failed.mock.calls[0]![0]).toMatchObject({failure:"budget",restartsInWindow:2,reason:"wasm-trap"});
 const broken=mocks.doms[2]!;
 expect(editor.recovery()).toMatchObject({phase:"failed",restarts:2});
 expect(host.getAttribute("data-breditor-recovery")).toBe("failed");expect(host.hasAttribute("inert")).toBe(true);
 expect(host.firstChild).toBe(broken.surface);expect(broken.dispose).not.toHaveBeenCalled();
 for(const call of [()=>editor.execute({kind:"insert",text:"y"} as never),()=>editor.checkpointJson(),()=>editor.setReadOnly(false)])expect(call).toThrow(expect.objectContaining({name:"CrashRecoveryError",code:"failed"}));
 expect(editor.verifiedCheckpointJson()).toBe(saved);
 // No further restart is ever attempted, even after the window passes.
 await new Promise(resolve=>setTimeout(resolve,0));now+=60_000;
 expect(mocks.doms).toHaveLength(3);expect(e.restarted).toHaveBeenCalledTimes(2);
 // A crashed owner's native free failure is not rethrown by dispose.
 expect(()=>editor.dispose()).not.toThrow();expect(broken.dispose).toHaveBeenCalledOnce();
 expect(host.hasAttribute("inert")).toBe(false);expect(host.hasAttribute("data-breditor-recovery")).toBe(false);expect(editor.recovery().phase).toBe("disposed");
});
it("the budget window slides and maxRestarts 0 fails on the first crash",async()=>{
 let now=0;vi.spyOn(Date,"now").mockImplementation(()=>now);
 const e=events(),editor=await openLocalEditor({host,initial,crashRecovery:{...e.options,maxRestarts:1,windowMs:5_000}});
 mocks.armed=true;expect(()=>editor.view()).toThrow();await vi.waitFor(()=>expect(e.restarted).toHaveBeenCalledOnce());
 now=5_000;mocks.armed=true;expect(()=>editor.view()).toThrow();await vi.waitFor(()=>expect(e.restarted).toHaveBeenCalledTimes(2));
 expect(e.failed).not.toHaveBeenCalled();editor.dispose();
 const none=events(),zero=await openLocalEditor({host,initial,crashRecovery:{...none.options,maxRestarts:0}});
 mocks.armed=true;expect(()=>zero.view()).toThrow();
 expect(none.failed.mock.calls[0]![0]).toMatchObject({failure:"budget",restartsInWindow:0});expect(none.restarted).not.toHaveBeenCalled();zero.dispose();
});
it("never restarts when the kept checkpoint fails exact verification",async()=>{
 const e=events(),editor=await openLocalEditor({host,initial,crashRecovery:e.options});
 editor.execute({kind:"insert",text:secret} as never);const saved=editor.checkpointJson();
 // The verifying restore re-exports a different checkpoint: not exact, so no restart.
 currentProfile.restoreEditor.mockImplementationOnce(json=>{const core=restore(json,false);core.checkpointJson=()=>json.replace(secret,"other");return core;});
 mocks.armed=true;expect(()=>editor.checkpointJson()).toThrow();
 await vi.waitFor(()=>expect(e.failed).toHaveBeenCalledOnce());
 expect(e.failed.mock.calls[0]![0]).toMatchObject({failure:"verification",reason:"wasm-trap"});
 expect(mocks.doms).toHaveLength(1);expect(mocks.doms[0]!.dispose).not.toHaveBeenCalled();expect(host.firstChild).toBe(mocks.doms[0]!.surface);
 expect(editor.verifiedCheckpointJson()).toBe(saved);expect(e.restarted).not.toHaveBeenCalled();
 // A verification restore that throws (for example a second trap) also fails closed.
 const t=events(),other=document.createElement("section");document.body.append(other);
 const second=await openLocalEditor({host:other,initial,crashRecovery:t.options});
 currentProfile.restoreEditor.mockImplementationOnce(()=>{throw new WebAssembly.RuntimeError("unreachable");});
 mocks.armed=true;expect(()=>second.view()).toThrow();
 await vi.waitFor(()=>expect(t.failed).toHaveBeenCalledOnce());expect(t.failed.mock.calls[0]![0].failure).toBe("verification");
 editor.dispose();second.dispose();
});
it("dispose during restart cancels verification or reopening without events or leaks",async()=>{
 for(const stage of ["verify","reopen"] as const){
  mocks.doms=[];
  const e=events(),editor=await openLocalEditor({host,initial,crashRecovery:e.options});
  const gate=deferred<object>();let calls=0;
  // Runtime call 1 is the verification; call 2 is the reopening (which honours the restart abort signal).
  mocks.runtime.mockImplementation(()=>{calls++;return (stage==="verify"?calls===1:calls===2)?gate.promise:Promise.resolve({});});
  mocks.armed=true;expect(()=>editor.view()).toThrow();
  await vi.waitFor(()=>expect(calls).toBe(stage==="verify"?1:2));
  editor.dispose();expect(editor.recovery().phase).toBe("disposed");
  gate.resolve({});await new Promise(resolve=>setTimeout(resolve,0));
  expect(e.restarted).not.toHaveBeenCalled();expect(e.failed).not.toHaveBeenCalled();
  expect(mocks.doms).toHaveLength(1);expect(mocks.doms[0]!.dispose).toHaveBeenCalledOnce();
  expect(host.childNodes).toHaveLength(0);expect(host.hasAttribute("inert")).toBe(false);expect(host.hasAttribute("data-breditor-rich")).toBe(false);
  expect(()=>editor.view()).toThrow(expect.objectContaining({code:"disposed"}));
  mocks.runtime.mockResolvedValue({});
 }
});
it("a failed reopening ends in the failed state; dispose from onCrash stops recovery",async()=>{
 const e=events(),editor=await openLocalEditor({host,initial,crashRecovery:e.options});
 mocks.mount.mockImplementationOnce(()=>{throw Error("mount failed");});
 mocks.armed=true;expect(()=>editor.view()).toThrow();
 await vi.waitFor(()=>expect(e.failed).toHaveBeenCalledOnce());expect(e.failed.mock.calls[0]![0].failure).toBe("reopen");
 expect(editor.verifiedCheckpointJson()).toContain("\"history\":0");editor.dispose();
 let disposeEditor=()=>{};const stop=await openLocalEditor({host,initial,crashRecovery:{onCrash:()=>disposeEditor(),onRestarted:e.restarted}});disposeEditor=()=>stop.dispose();
 const before=mocks.doms.length;mocks.armed=true;expect(()=>stop.view()).toThrow();await new Promise(resolve=>setTimeout(resolve,0));
 expect(stop.recovery().phase).toBe("disposed");expect(mocks.doms).toHaveLength(before);expect(e.restarted).not.toHaveBeenCalled();
});
it("reapplies live read-only and restricted policy to the restarted owner",async()=>{
 const e=events(),editor=await openLocalEditor({host,initial,crashRecovery:e.options});
 editor.setReadOnly(true);editor.setRestrictedEditing({editable:["b"]});
 mocks.armed=true;expect(()=>editor.view()).toThrow();await vi.waitFor(()=>expect(e.restarted).toHaveBeenCalledOnce());
 const fresh=mocks.doms[1]!.core;expect(fresh.setReadOnly).toHaveBeenCalledWith(true);expect(fresh.setRestrictedEditing).toHaveBeenCalledWith({editable:["b"]});
 editor.dispose();
});
it("document editors restart from their own checkpoint family and reapply restricted policy",async()=>{
 const e=events(),editor=await openLocalDocumentEditor({host,selectionEditing:"document-v1",initial,history:"typing-v1",crashRecovery:e.options});
 editor.execute({kind:"insert",text:secret} as never);const saved=editor.checkpointJson();editor.setRestrictedEditing({editable:["b"]});
 mocks.armed=true;expect(()=>editor.execute({kind:"insert",text:"x"} as never)).toThrow();
 await vi.waitFor(()=>expect(e.restarted).toHaveBeenCalledOnce());
 expect(currentProfile.restoreDocumentTypingEditor.mock.calls.map(call=>call[0])).toEqual([saved,saved]);
 expect(editor.selectionPolicy()).toBe("document-v1");expect(JSON.parse(editor.checkpointJson()).text).toBe(secret);
 expect(mocks.doms[1]!.core.setRestrictedEditing).toHaveBeenCalledWith({editable:["b"]});
 editor.dispose();
});
it("validates crashRecovery before runtime work and keeps the plain opening unchanged",async()=>{
 for(const bad of [null,[],{maxRestarts:-1},{maxRestarts:1.5},{windowMs:0},{onCrash:"x"},{unknown:true}]){
  await expect(openLocalEditor({host,initial,crashRecovery:bad as never})).rejects.toThrow(TypeError);
 }
 expect(mocks.runtime).not.toHaveBeenCalled();expect(host.childNodes).toHaveLength(0);
 const plain=await openLocalEditor({host,initial});expect("recovery" in plain).toBe(false);plain.dispose();
});
