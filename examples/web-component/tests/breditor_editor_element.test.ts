import {afterEach,describe,expect,it} from "vitest";
import type {LocalEditor,LocalEditorOptions} from "@breditor/editor";
// The real SDK host-claim guard: a second claim on a host with a pending or live owner throws.
import {awaitInitialization,claimHost} from "../../../packages/breditor-editor/src/host.js";
import {createBreditorEditorElement,type BreditorEditorElement} from "../src/breditor_editor_element.js";

/** How the fake opener reacts to an abort while it waits for its runtime. */
type Mode="cooperative"|"stubborn"|"ignores-signal";
interface FakeOwner {id:number;disposed:number;readOnlyCalls:boolean[];options:LocalEditorOptions}
interface Opening {options:LocalEditorOptions;resolve():void;reject(error:unknown):void;owner?:FakeOwner}

function harness(mode:Mode="cooperative"){
 const openings:Opening[]=[],owners:FakeOwner[]=[];
 const open=(options:LocalEditorOptions):Promise<LocalEditor>=>{
  let resolve!:()=>void,reject!:(error:unknown)=>void;
  const runtime=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
  const opening:Opening={options,resolve,reject};openings.push(opening);
  const claim=mode==="ignores-signal"?claimHost(options.host):claimHost(options.host,options.signal);
  return (async()=>{
   try{
    if(mode==="cooperative")await awaitInitialization(runtime,options.signal);else await runtime;
    if(mode!=="ignores-signal")claim.assert();
    const surface=options.host.ownerDocument.createElement("div");surface.dataset["fakeSurface"]="";options.host.append(surface);
    const owner:FakeOwner={id:owners.length+1,disposed:0,readOnlyCalls:[],options};owners.push(owner);opening.owner=owner;
    let live=true;
    const editor={
     checkpointJson:()=>{if(!live)throw Error("disposed");return `checkpoint-${owner.id}`;},
     setReadOnly:(value:boolean)=>{owner.readOnlyCalls.push(value);return true;},
     focus:()=>{},
     dispose:()=>{owner.disposed+=1;if(live){live=false;surface.remove();claim.release();}},
    };
    return editor as unknown as LocalEditor;
   }catch(error){claim.rollback();throw error;}
  })();
 };
 return {open,openings,owners};
}

let sequence=0;
const defined:HTMLElement[]=[];
function define(open:(options:LocalEditorOptions)=>Promise<LocalEditor>,name=`breditor-editor-test-${++sequence}`):string{
 customElements.define(name,createBreditorEditorElement({open}));return name;
}
function create(name:string):{element:BreditorEditorElement;events:{type:string;detail:unknown}[]}{
 const element=document.createElement(name) as BreditorEditorElement,events:{type:string;detail:unknown}[]=[];
 for(const type of ["breditor-ready","breditor-change","breditor-error"])element.addEventListener(type,event=>events.push({type,detail:(event as CustomEvent).detail}));
 defined.push(element);return {element,events};
}
const tick=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
const types=(events:{type:string}[])=>events.map(event=>event.type);
afterEach(()=>{for(const element of defined.splice(0))element.remove();document.body.replaceChildren();});

describe("<breditor-editor> lifecycle",()=>{
 it("opens once on connection with the initial document, label and read-only policy",async()=>{
  const fake=harness(),{element,events}=create(define(fake.open));
  element.setAttribute("initial-document","{\"seed\":1}");element.setAttribute("label","Notes");element.setAttribute("read-only","");
  document.body.append(element);
  expect(element.phase).toBe("starting");expect(element.getAttribute("aria-busy")).toBe("true");
  await tick();expect(fake.openings).toHaveLength(1);
  const options=fake.openings[0]!.options;
  expect(options.initial).toEqual({kind:"document",documentJson:"{\"seed\":1}"});
  expect(options.label).toBe("Notes");expect(options.readOnly).toBe(true);expect(options.signal?.aborted).toBe(false);
  fake.openings[0]!.resolve();await tick();
  expect(element.phase).toBe("ready");expect(element.hasAttribute("aria-busy")).toBe(false);
  expect(types(events)).toEqual(["breditor-ready"]);
  expect((events[0]!.detail as {editor:LocalEditor}).editor).toBe(element.editor);
  expect(element.querySelectorAll("[data-fake-surface]")).toHaveLength(1);
 });

 it("cancels silently when disconnected during asynchronous startup and restores the host",async()=>{
  const fake=harness(),{element,events}=create(define(fake.open));
  document.body.append(element);await tick();const signal=fake.openings[0]!.options.signal!;
  element.remove();await tick();
  expect(signal.aborted).toBe(true);expect(element.phase).toBe("idle");
  fake.openings[0]!.resolve();await tick();
  expect(events).toEqual([]);expect(fake.owners).toHaveLength(0);expect(element.editor).toBeNull();
  expect(element.querySelectorAll("[data-fake-surface]")).toHaveLength(0);
  document.body.append(element);await tick();fake.openings[1]!.resolve();await tick();
  expect(types(events)).toEqual(["breditor-ready"]);expect(fake.owners).toHaveLength(1);
 });

 it("disposes an owner that resolves after disconnect even when the opener ignored the signal",async()=>{
  const fake=harness("ignores-signal"),{element,events}=create(define(fake.open));
  document.body.append(element);await tick();element.remove();await tick();
  fake.openings[0]!.resolve();await tick();
  expect(fake.owners).toHaveLength(1);expect(fake.owners[0]!.disposed).toBe(1);
  expect(events).toEqual([]);expect(element.editor).toBeNull();
  expect(element.querySelectorAll("[data-fake-surface]")).toHaveLength(0);
 });

 it("serializes a reconnect behind a cancelled opening that still holds the host",async()=>{
  const fake=harness("stubborn"),{element,events}=create(define(fake.open));
  document.body.append(element);await tick();element.remove();await tick();
  document.body.append(element);await tick();
  // The second opening waits on the lane: claiming now would throw "pending opening".
  expect(fake.openings).toHaveLength(1);expect(element.phase).toBe("starting");
  fake.openings[0]!.resolve();await tick();
  expect(fake.openings).toHaveLength(2);expect(events).toEqual([]);
  fake.openings[1]!.resolve();await tick();
  expect(types(events)).toEqual(["breditor-ready"]);expect(fake.owners).toHaveLength(1);
  expect(element.querySelectorAll("[data-fake-surface]")).toHaveLength(1);
 });

 it("keeps the live owner when moved within the document, including during startup",async()=>{
  const fake=harness(),{element,events}=create(define(fake.open)),a=document.createElement("div"),b=document.createElement("div");
  document.body.append(a,b);a.append(element);
  await tick();b.append(element);await tick();// Moved while starting.
  expect(fake.openings[0]!.options.signal?.aborted).toBe(false);
  fake.openings[0]!.resolve();await tick();
  const editor=element.editor;expect(editor).not.toBeNull();
  a.insertBefore(element,null);await tick();// Moved while ready.
  expect(element.editor).toBe(editor);expect(fake.owners[0]!.disposed).toBe(0);
  expect(fake.openings).toHaveLength(1);expect(types(events)).toEqual(["breditor-ready"]);
 });

 it("disposes on removal and reopens from the exact retained checkpoint on reconnect",async()=>{
  const fake=harness(),{element,events}=create(define(fake.open));
  element.initialDocument="{\"seed\":2}";document.body.append(element);await tick();fake.openings[0]!.resolve();await tick();
  element.remove();
  expect(fake.owners[0]!.disposed).toBe(0);// Teardown waits one microtask to recognize moves.
  await tick();
  expect(fake.owners[0]!.disposed).toBe(1);expect(element.phase).toBe("idle");expect(element.editor).toBeNull();
  expect(element.checkpointJson()).toBe("checkpoint-1");
  element.remove();await tick();expect(fake.owners[0]!.disposed).toBe(1);// Repeated disconnect is a no-op.
  document.body.append(element);await tick();
  expect(fake.openings[1]!.options.initial).toEqual({kind:"checkpoint",checkpointJson:"checkpoint-1"});
  fake.openings[1]!.resolve();await tick();
  expect(types(events)).toEqual(["breditor-ready","breditor-ready"]);
  expect(element.querySelectorAll("[data-fake-surface]")).toHaveLength(1);
 });

 it("discards the retained checkpoint when a new initial document is set while detached",async()=>{
  const fake=harness(),{element}=create(define(fake.open));
  document.body.append(element);await tick();fake.openings[0]!.resolve();await tick();
  element.remove();await tick();
  element.initialDocument="{\"seed\":3}";document.body.append(element);await tick();
  expect(fake.openings[1]!.options.initial).toEqual({kind:"document",documentJson:"{\"seed\":3}"});
 });

 it("applies read-only changes live and after a startup that raced them",async()=>{
  const fake=harness(),{element}=create(define(fake.open));
  document.body.append(element);await tick();
  expect(fake.openings[0]!.options.readOnly).toBeUndefined();
  element.readOnly=true;expect(element.hasAttribute("read-only")).toBe(true);
  fake.openings[0]!.resolve();await tick();
  expect(fake.owners[0]!.readOnlyCalls).toEqual([true]);
  element.readOnly=false;element.removeAttribute("read-only");
  expect(fake.owners[0]!.readOnlyCalls).toEqual([true,false]);
 });

 it("surfaces startup failure once and retries on request",async()=>{
  const fake=harness(),{element,events}=create(define(fake.open));
  document.body.append(element);await tick();const failure=new Error("runtime unavailable");
  fake.openings[0]!.reject(failure);await tick();
  expect(element.phase).toBe("failed");expect(events).toEqual([{type:"breditor-error",detail:{error:failure}}]);
  expect(element.querySelectorAll("[data-fake-surface]")).toHaveLength(0);
  element.retry();await tick();fake.openings[1]!.resolve();await tick();
  expect(element.phase).toBe("ready");expect(types(events)).toEqual(["breditor-error","breditor-ready"]);
  element.retry();await tick();expect(fake.openings).toHaveLength(2);// Never resets a live owner.
 });

 it("forwards change and owner errors only from the current owner",async()=>{
  const fake=harness(),{element,events}=create(define(fake.open));
  document.body.append(element);await tick();fake.openings[0]!.resolve();await tick();
  const options=fake.openings[0]!.options,view={revision:"1"},outcome={kind:"applied"};
  (options.onChange as (view:unknown,outcome:unknown)=>void)(view,outcome);
  options.onError?.("owner fault");
  expect(events.slice(1)).toEqual([{type:"breditor-change",detail:{view,outcome}},{type:"breditor-error",detail:{error:"owner fault"}}]);
  element.remove();await tick();
  (options.onChange as (view:unknown,outcome:unknown)=>void)(view,outcome);options.onError?.("late");
  expect(events).toHaveLength(3);
 });

 it("restarts with a fresh owner after adoption into another document",async()=>{
  const fake=harness(),{element}=create(define(fake.open));
  document.body.append(element);await tick();fake.openings[0]!.resolve();await tick();
  const other=document.implementation.createHTMLDocument("other");
  other.body.append(element);// Disconnect, adopt and connect in one operation.
  expect(fake.owners[0]!.disposed).toBe(1);await tick();
  expect(fake.openings).toHaveLength(2);
  expect(fake.openings[1]!.options.initial).toEqual({kind:"checkpoint",checkpointJson:"checkpoint-1"});
  expect(fake.openings[1]!.options.host.ownerDocument).toBe(other);
  element.remove();
 });

 it("replays properties assigned before the element was upgraded",async()=>{
  const fake=harness(),name=`breditor-editor-test-${++sequence}`;
  const element=document.createElement(name) as BreditorEditorElement;defined.push(element);
  element.readOnly=true;element.initialDocument="{\"seed\":4}";
  define(fake.open,name);customElements.upgrade(element);document.body.append(element);await tick();
  expect(fake.openings[0]!.options).toMatchObject({readOnly:true,initial:{kind:"document",documentJson:"{\"seed\":4}"}});
  expect(element.hasAttribute("read-only")).toBe(true);
 });
});
