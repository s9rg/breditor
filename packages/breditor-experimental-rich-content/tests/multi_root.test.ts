// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {mountRichMultiRootEditor,restoreRichRootSet,type RichRootSetPort,type RichRootSetState,type RichRootCheckpointPart} from "../src/multi_root.js";
import type {RichCommand,RichCoreEditor,RichCoreProfile,RichView} from "../src/core.js";

// Native state is stubbed: these are DOM routing contracts. Rust tests prove the journal;
// experiments/rich-browser/multi-root.spec.mjs proves real Wasm in three engines.
function fakeCore(name:string){
 let revision=1,text="x",commits=0,undone:string[]=[];const history:string[]=[];
 const caret={kind:"text" as const,anchor:{block:"p",offset:"1",affinity:"after" as const},focus:{block:"p",offset:"1",affinity:"after" as const}};
 const documentJson=()=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"t/roots",version:1},schemaFingerprint:"fixture",root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":name},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:[{kind:"text",text,formats:[]}]}]}});
 const view=():RichView=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson:documentJson(),selection:caret,pendingFormatsJson:null,undoDepth:history.length,redoDepth:undone.length,historyCapacity:100,grid:null,tables:[]});
 const core={view,documentJson,checkpointJson:()=>`checkpoint:${name}:${text}`,clipboard:()=>null,inlineFormatState:()=>{throw Error("unused");},dispose:vi.fn(),
  execute:vi.fn((command:RichCommand)=>{
   revision++;
   if(command.kind==="undo"){const last=history.pop()!;undone.push(text);text=last;return "undo" as const;}
   if(command.kind==="redo"){history.push(text);text=undone.pop()!;return "redo" as const;}
   if(command.kind==="insertPlainText"){history.push(text);undone=[];text+=(command as {text:string}).text;commits++;return "content" as const;}
   return "selection" as const;
  })} as unknown as RichCoreEditor;
 return {core,name,commits:()=>commits,undos:()=>history.length,text:()=>text};
}
type Fake=ReturnType<typeof fakeCore>;
/** Minimal JS coordinator with the same contract as the native one (journal + cursor). */
function fakeSet(fakes:Map<RichCoreEditor,Fake>):RichRootSetPort&{calls:string[]}{
 const roots:{id:string;label:string|null;attributes:Record<string,string>}[]=[];let journal:string[]=[],cursor=0,active:string|null=null,revision=0;
 const seen=new Map<string,{commits:number;undos:number}>(),calls:string[]=[];
 const state=():RichRootSetState=>({format:"breditor/rich-root-set-state",formatVersion:1,revision:String(revision),complete:true,roots:roots.map(root=>({...root})),active,undoDepth:cursor,redoDepth:journal.length-cursor,undoTarget:journal[cursor-1]??null,redoTarget:journal[cursor]??null});
 return {calls,state,
  addRoot(meta,core){if(roots.some(root=>root.id===meta.id))throw Error("breditor_rich.root_duplicate");const fake=fakes.get(core as RichCoreEditor)!;roots.push({id:meta.id,label:meta.label??null,attributes:{...meta.attributes}});seen.set(meta.id,{commits:fake.commits(),undos:fake.undos()});active??=meta.id;revision++;return state();},
  removeRoot(id){roots.splice(roots.findIndex(root=>root.id===id),1);const before=journal.slice(0,cursor).filter(entry=>entry===id).length;journal=journal.filter(entry=>entry!==id);cursor-=before;if(active===id)active=roots[0]?.id??null;revision++;return state();},
  setAttributes(id,attributes){roots.find(root=>root.id===id)!.attributes={...attributes};return state();},
  focus(id){calls.push(`focus:${id}`);active=id;revision++;return state();},
  reconcile(id,core){
   const fake=fakes.get(core as RichCoreEditor)!,last=seen.get(id)!;
   if(fake.commits()===last.commits&&fake.undos()===last.undos)return false;
   calls.push(`reconcile:${id}`);
   if(fake.commits()>last.commits){journal=journal.slice(0,cursor);journal.push(id);cursor++;}
   else if(fake.undos()<last.undos)cursor--;else cursor++;
   seen.set(id,{commits:fake.commits(),undos:fake.undos()});active=id;revision++;return true;
  },
  checkpointJson:parts=>JSON.stringify({journal,cursor,parts}),
  restore:()=>[{id:"a",history:"explicit",selection:"original",checkpoint:"cp"}],
  attach:()=>state(),dispose:vi.fn(),
 };
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(){
 const fakes=[fakeCore("header"),fakeCore("content")],map=new Map(fakes.map(fake=>[fake.core,fake]));
 const set=fakeSet(map),container=document.createElement("div");document.body.append(container);
 const changes:string[]=[];
 const editor=mountRichMultiRootEditor(container,{set,roots:[{id:"header",label:"Header",core:fakes[0]!.core},{id:"content",label:"Content",core:fakes[1]!.core}],toolbar:()=>[],onChange:change=>changes.push(`${change.root}:${change.outcome}`)});
 return {fakes,map,set,container,editor,changes};
}
afterEach(()=>{document.body.replaceChildren();});

describe("multi-root DOM editor",()=>{
 it("mounts one surface per root, one shared toolbar slot and labels from root metadata",()=>{
  const {container,editor}=setup();
  const sections=[...container.querySelectorAll<HTMLElement>("[data-breditor-root]")];
  expect(sections.map(section=>section.dataset["breditorRoot"])).toEqual(["header","content"]);
  expect(sections.map(section=>section.querySelector(".breditor-rich-surface")!.getAttribute("aria-label"))).toEqual(["Header","Content"]);
  const toolbars=[...editor.toolbar.querySelectorAll<HTMLElement>(".breditor-rich-toolbar")];
  expect(toolbars).toHaveLength(2);
  expect(toolbars.map(toolbar=>toolbar.hidden)).toEqual([false,true]);
  expect(sections.every(section=>!section.querySelector(".breditor-rich-toolbar"))).toBe(true);
  expect(editor.rootIds()).toEqual(["header","content"]);
 });
 it("follows focus with the active root and its toolbar",()=>{
  const {editor,set}=setup();
  editor.root("content")!.surface.dispatchEvent(new FocusEvent("focusin",{bubbles:true}));
  expect(set.calls).toContain("focus:content");
  expect(editor.activeRoot()).toBe("content");
  expect([...editor.toolbar.children].map(toolbar=>(toolbar as HTMLElement).hidden)).toEqual([true,false]);
 });
 it("records every dispatch and routes Undo/Redo across roots in global order",async()=>{
  const {editor,fakes,set,changes}=setup();
  editor.root("header")!.execute({kind:"insertPlainText",text:"A"} as RichCommand);
  editor.root("content")!.execute({kind:"insertPlainText",text:"B"} as RichCommand);
  expect(set.calls.filter(call=>call.startsWith("reconcile"))).toEqual(["reconcile:header","reconcile:content"]);
  // Each root's view reports the global depths, so every Undo control is enabled.
  expect(editor.root("header")!.view().undoDepth).toBe(2);
  // Undo requested in header runs in content (the newest unit) after header's dispatch drains.
  expect(editor.root("header")!.execute({kind:"undo"} as RichCommand)).toBe("unchanged");
  await flush();
  expect(fakes[1]!.text()).toBe("x");expect(fakes[0]!.text()).toBe("xA");
  expect(editor.activeRoot()).toBe("content");
  expect(editor.undo()).toBe("undo");
  expect(fakes[0]!.text()).toBe("x");
  expect(editor.undo()).toBe("unchanged");
  expect(editor.redo()).toBe("redo");
  expect(fakes[0]!.text()).toBe("xA");
  expect(changes).toEqual(["header:content","content:content","content:undo","header:undo","header:redo"]);
 });
 it("adds, reads and removes roots outside history and checkpoints every root",()=>{
  const {editor,container,map}=setup();
  const extra=fakeCore("sidebar");map.set(extra.core,extra);
  editor.addRoot({id:"sidebar",label:"Sidebar",core:extra.core},0);
  expect([...container.querySelectorAll<HTMLElement>("[data-breditor-root]")].map(section=>section.dataset["breditorRoot"])).toEqual(["sidebar","header","content"]);
  expect(()=>editor.addRoot({id:"sidebar",core:fakeCore("dup").core})).toThrow();
  editor.removeRoot("sidebar");
  editor.root("header")!.execute({kind:"insertPlainText",text:"A"} as RichCommand);
  expect(JSON.parse(editor.getData("header")).root.children[0].children[0].text).toBe("xA");
  const removed=editor.removeRoot("header");
  expect(removed.checkpointJson).toBe("checkpoint:header:xA");
  expect(editor.state().undoDepth).toBe(0);
  expect(container.querySelectorAll("[data-breditor-root]")).toHaveLength(1);
  const checkpoint=JSON.parse(editor.checkpointJson()) as {parts:RichRootCheckpointPart[]};
  expect(checkpoint.parts).toEqual([{id:"content",history:"explicit",selection:"original",checkpoint:"checkpoint:content:x"}]);
  editor.dispose();
  expect(container.childElementCount).toBe(0);
 });
 it("restores each root with its codec family and attaches it before mounting",()=>{
  const fake=fakeCore("a"),attach=vi.fn(()=>({roots:[{id:"a",label:"A",attributes:{order:"1"}}]}) as unknown as RichRootSetState);
  const set={restore:()=>[{id:"a",history:"typing-v1",selection:"original",checkpoint:"cp"}],attach,state:()=>({roots:[{id:"a",label:"A",attributes:{order:"1"}}]})} as unknown as RichRootSetPort;
  const restoreTypingEditor=vi.fn(()=>fake.core);
  const roots=restoreRichRootSet(set,{restoreTypingEditor,restoreEditor:()=>{throw Error("wrong family");}} as unknown as RichCoreProfile,"{}");
  expect(restoreTypingEditor).toHaveBeenCalledWith("cp");
  expect(attach).toHaveBeenCalledWith("a",fake.core);
  expect(roots).toEqual([{id:"a",core:fake.core,label:"A",attributes:{order:"1"}}]);
 });
});
