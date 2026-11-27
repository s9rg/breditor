// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {mountRichMultiRootEditor,restoreRichRootSet,type RichRootSetPort,type RichRootSetState,type RichRootCheckpointPart,type RichRootSetStep} from "../src/multi_root.js";
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
type Root={id:string;label:string|null;attributes:Record<string,string>};
type Step={step:Exclude<RichRootSetStep,"root">;root:string;index?:number;from?:number;to?:number;before?:Record<string,string>;after?:Record<string,string>};
/** Minimal JS coordinator with the same contract as the native one (journal + cursor + structure steps). */
function fakeSet(fakes:Map<RichCoreEditor,Fake>):RichRootSetPort&{calls:string[]}{
 let roots:Root[]=[],journal:(string|Step)[]=[],cursor=0,active:string|null=null,revision=0;
 const detached=new Map<string,Root>(),seen=new Map<string,{commits:number;undos:number}>(),calls:string[]=[];
 const kind=(entry:string|Step|undefined):RichRootSetStep|null=>entry===undefined?null:typeof entry==="string"?"root":entry.step;
 const owner=(entry:string|Step|undefined):string|null=>entry===undefined?null:typeof entry==="string"?entry:entry.root;
 const state=():RichRootSetState=>({format:"breditor/rich-root-set-state",formatVersion:1,revision:String(revision),complete:true,roots:roots.map(root=>({...root})),detached:[...detached.keys()],active,undoDepth:cursor,redoDepth:journal.length-cursor,undoTarget:owner(journal[cursor-1]),redoTarget:owner(journal[cursor]),undoStep:kind(journal[cursor-1]),redoStep:kind(journal[cursor])});
 const release=()=>{for(const id of [...detached.keys()]){const reachable=journal.slice(0,cursor).some(entry=>typeof entry!=="string"&&entry.step==="remove"&&entry.root===id)||journal.slice(cursor).some(entry=>typeof entry!=="string"&&entry.step==="add"&&entry.root===id);if(!reachable){detached.delete(id);journal=journal.filter(entry=>owner(entry)!==id);}}};
 const clear=()=>{journal=journal.slice(0,cursor);release();};
 const record=(step:Step)=>{journal.push(step);cursor=journal.length;revision++;return state();};
 const index=(id:string)=>{const at=roots.findIndex(root=>root.id===id);if(at<0)throw Error("breditor_rich.root_unknown");return at;};
 const detach=(at:number)=>{const [root]=roots.splice(at,1);detached.set(root!.id,root!);if(active===root!.id)active=roots[Math.min(at,roots.length-1)]?.id??null;};
 const attach=(id:string,at:number)=>{roots.splice(at,0,detached.get(id)!);detached.delete(id);active=id;};
 const apply=(step:Step,forward:boolean)=>{
  if(step.step==="add"){if(forward)attach(step.root,step.index!);else detach(step.index!);}
  else if(step.step==="remove"){if(forward)detach(step.index!);else attach(step.root,step.index!);}
  else if(step.step==="move"){const [root]=roots.splice(forward?step.from!:step.to!,1);roots.splice(forward?step.to!:step.from!,0,root!);active=step.root;}
  else{roots[index(step.root)]!.attributes={...(forward?step.after:step.before)};active=step.root;}
 };
 const setAttributes=(id:string,attributes:Readonly<Record<string,string>>)=>{const root=roots[index(id)]!,before=root.attributes;if(JSON.stringify(before)===JSON.stringify(attributes))return state();clear();root.attributes={...attributes};active=id;return record({step:"attributes",root:id,before,after:{...attributes}});};
 return {calls,state,
  addRoot(meta,core,at,options){
   if(roots.some(root=>root.id===meta.id)||detached.has(meta.id))throw Error("breditor_rich.root_duplicate");
   const fake=fakes.get(core as RichCoreEditor)!,position=at??roots.length;seen.set(meta.id,{commits:fake.commits(),undos:fake.undos()});
   const root={id:meta.id,label:meta.label??null,attributes:{...meta.attributes}};
   if(options?.undoable){clear();roots.splice(position,0,root);active=meta.id;return record({step:"add",root:meta.id,index:position});}
   roots.splice(position,0,root);active??=meta.id;revision++;return state();
  },
  removeRoot(id,options){
   const at=index(id);if(roots.length===1)throw Error("breditor_rich.root_last");
   if(options?.undoable){clear();detach(at);return record({step:"remove",root:id,index:at});}
   roots.splice(at,1);const before=journal.slice(0,cursor).filter(entry=>entry===id).length;journal=journal.filter(entry=>entry!==id);cursor-=before;if(active===id)active=roots[0]?.id??null;revision++;return state();
  },
  moveRoot(id,to){const from=index(id);if(from===to)return state();clear();const [root]=roots.splice(from,1);roots.splice(to,0,root!);active=id;return record({step:"move",root:id,from,to});},
  setAttributes,
  setAttribute(id,key,value){return setAttributes(id,{...roots[index(id)]!.attributes,[key]:value});},
  removeAttribute(id,key){const next={...roots[index(id)]!.attributes};delete next[key];return setAttributes(id,next);},
  undoStructure(){const entry=journal[cursor-1];if(entry===undefined||typeof entry==="string")throw Error("breditor_rich.root_structure_step");calls.push(`undo:${entry.step}:${entry.root}`);apply(entry,false);cursor--;revision++;return state();},
  redoStructure(){const entry=journal[cursor];if(entry===undefined||typeof entry==="string")throw Error("breditor_rich.root_structure_step");calls.push(`redo:${entry.step}:${entry.root}`);apply(entry,true);cursor++;revision++;return state();},
  focus(id){calls.push(`focus:${id}`);active=id;revision++;return state();},
  reconcile(id,core){
   const fake=fakes.get(core as RichCoreEditor)!,last=seen.get(id)!;
   if(fake.commits()===last.commits&&fake.undos()===last.undos)return false;
   calls.push(`reconcile:${id}`);
   if(fake.commits()>last.commits){clear();journal.push(id);cursor=journal.length;}
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
 const changes:string[]=[],structure:string[]=[];
 const editor=mountRichMultiRootEditor(container,{set,roots:[{id:"header",label:"Header",core:fakes[0]!.core},{id:"content",label:"Content",core:fakes[1]!.core}],toolbar:()=>[],onChange:change=>changes.push(`${change.root}:${change.outcome}`),onRootsChange:state=>structure.push(state.roots.map(root=>root.id).join(","))});
 return {fakes,map,set,container,editor,changes,structure};
}
const sections=(container:HTMLElement)=>[...container.querySelectorAll<HTMLElement>("[data-breditor-root]")].map(section=>section.dataset["breditorRoot"]);
const shownToolbars=(editor:{toolbar:HTMLDivElement})=>[...editor.toolbar.children].filter(toolbar=>!(toolbar as HTMLElement).hidden).length;
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});
/** jsdom cannot focus editable surfaces; record which element the editor focuses. */
function trackFocus():HTMLElement[]{const focused:HTMLElement[]=[];vi.spyOn(HTMLElement.prototype,"focus").mockImplementation(function(this:HTMLElement){focused.push(this);});return focused;}

describe("multi-root DOM editor",()=>{
 it("mounts one surface per root, one shared toolbar slot and labels from root metadata",()=>{
  const {container,editor}=setup();
  const elements=[...container.querySelectorAll<HTMLElement>("[data-breditor-root]")];
  expect(sections(container)).toEqual(["header","content"]);
  expect(elements.map(section=>section.querySelector(".breditor-rich-surface")!.getAttribute("aria-label"))).toEqual(["Header","Content"]);
  const toolbars=[...editor.toolbar.querySelectorAll<HTMLElement>(".breditor-rich-toolbar")];
  expect(toolbars).toHaveLength(2);
  expect(toolbars.map(toolbar=>toolbar.hidden)).toEqual([false,true]);
  expect(elements.every(section=>!section.querySelector(".breditor-rich-toolbar"))).toBe(true);
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
 it("adds, reads and removes roots outside history when asked and checkpoints every root",()=>{
  const {editor,container,map,fakes}=setup(),focused=trackFocus();
  const extra=fakeCore("sidebar");map.set(extra.core,extra);
  editor.addRoot({id:"sidebar",label:"Sidebar",core:extra.core},0,{undoable:false});
  expect(sections(container)).toEqual(["sidebar","header","content"]);
  expect(()=>editor.addRoot({id:"sidebar",core:fakeCore("dup").core})).toThrow();
  editor.removeRoot("sidebar",{undoable:false});
  expect(extra.core.dispose).toHaveBeenCalledTimes(1);
  editor.root("header")!.execute({kind:"insertPlainText",text:"A"} as RichCommand);
  expect(JSON.parse(editor.getData("header")).root.children[0].children[0].text).toBe("xA");
  const removed=editor.removeRoot("header",{undoable:false});
  expect(removed.checkpointJson).toBe("checkpoint:header:xA");
  expect(fakes[0]!.core.dispose).toHaveBeenCalledTimes(1);
  expect(editor.state().undoDepth).toBe(0);
  expect(sections(container)).toEqual(["content"]);
  expect(editor.toolbar.children).toHaveLength(1);
  const checkpoint=JSON.parse(editor.checkpointJson()) as {parts:RichRootCheckpointPart[]};
  expect(checkpoint.parts).toEqual([{id:"content",history:"explicit",selection:"original",checkpoint:"checkpoint:content:x"}]);
  editor.dispose();
  expect(container.childElementCount).toBe(0);
 });
 it("removes a root as one Undo step and remounts the same owner where it was on Undo",async()=>{
  const {editor,container,fakes,set,structure}=setup();
  editor.root("header")!.execute({kind:"insertPlainText",text:"A"} as RichCommand);
  const focused=trackFocus();
  const removed=editor.removeRoot("header");
  expect(removed.documentJson).toContain("xA");
  expect(sections(container)).toEqual(["content"]);
  expect(fakes[0]!.core.dispose).not.toHaveBeenCalled();
  expect(editor.state().detached).toEqual(["header"]);
  expect(editor.toolbar.children).toHaveLength(1);
  // The removed root was active: its neighbour becomes active and shows its toolbar.
  // Real focus follow on removal is proven in experiments/rich-browser/multi-root.spec.mjs.
  expect(editor.root("content")!.toolbar.hidden).toBe(false);
  // A detached root's owner is part of the checkpoint.
  const parts=(JSON.parse(editor.checkpointJson()) as {parts:RichRootCheckpointPart[]}).parts;
  expect(parts.map(part=>[part.id,part.detached??false])).toEqual([["content",false],["header",true]]);
  // Undo from the remaining root's toolbar is routed to the structure step.
  expect(editor.root("content")!.execute({kind:"undo"} as RichCommand)).toBe("unchanged");
  await flush();
  expect(set.calls).toContain("undo:remove:header");
  expect(sections(container)).toEqual(["header","content"]);
  expect(editor.root("header")!.surface.getAttribute("aria-label")).toBe("Header");
  expect(editor.getData("header")).toContain("xA");
  expect(editor.activeRoot()).toBe("header");
  expect(focused.at(-1)).toBe(editor.root("header")!.surface);
  expect(shownToolbars(editor)).toBe(1);
  expect(editor.root("header")!.toolbar.hidden).toBe(false);
  expect(editor.undo()).toBe("undo");
  expect(fakes[0]!.text()).toBe("x");
  expect(editor.redo()).toBe("redo");
  expect(editor.redo()).toBe("redo");
  expect(sections(container)).toEqual(["content"]);
  expect(structure).toEqual(["content","header,content","content"]);
  // A new edit does not release it: the removal is still undoable.
  editor.root("content")!.execute({kind:"insertPlainText",text:"B"} as RichCommand);
  await flush();
  expect(fakes[0]!.core.dispose).not.toHaveBeenCalled();
  editor.dispose();
  expect(fakes[0]!.core.dispose).toHaveBeenCalledTimes(1);
 });
 it("undoes an added root, then releases its owner once a new edit clears Redo",async()=>{
  const {editor,container,map,fakes}=setup(),focused=trackFocus();
  const extra=fakeCore("sidebar");map.set(extra.core,extra);
  editor.addRoot({id:"sidebar",label:"Sidebar",core:extra.core},1);
  expect(sections(container)).toEqual(["header","sidebar","content"]);
  expect(editor.activeRoot()).toBe("sidebar");
  expect(editor.state().undoStep).toBe("add");
  expect(editor.undo()).toBe("undo");
  expect(sections(container)).toEqual(["header","content"]);
  expect(extra.core.dispose).not.toHaveBeenCalled();
  expect(editor.redo()).toBe("redo");
  expect(sections(container)).toEqual(["header","sidebar","content"]);
  expect(focused.at(-1)).toBe(editor.root("sidebar")!.surface);
  editor.undo();
  editor.root("content")!.execute({kind:"insertPlainText",text:"C"} as RichCommand);
  await flush();
  expect(editor.state().detached).toEqual([]);
  expect(extra.core.dispose).toHaveBeenCalledTimes(1);
  expect(fakes[1]!.core.dispose).not.toHaveBeenCalled();
 });
 it("moves roots and changes attributes as global Undo steps",()=>{
  const {editor,container}=setup();
  editor.moveRoot("header",1);
  expect(sections(container)).toEqual(["content","header"]);
  editor.setAttribute("content","order","1");
  editor.setAttributes("content",{order:"1",section:"body"});
  editor.removeAttribute("content","order");
  expect(editor.state().roots[0]!.attributes).toEqual({section:"body"});
  expect(editor.undo()).toBe("undo");
  expect(editor.state().roots[0]!.attributes).toEqual({order:"1",section:"body"});
  editor.undo();editor.undo();
  expect(editor.state().roots[0]!.attributes).toEqual({});
  expect(editor.undo()).toBe("undo");
  expect(sections(container)).toEqual(["header","content"]);
  expect(editor.undo()).toBe("unchanged");
 });
 it("keeps restored detached roots unmounted and releases those the coordinator no longer retains",()=>{
  const fake=fakeCore("gone"),map=new Map([[fake.core,fake]]),set=fakeSet(map),container=document.createElement("div");
  const live=fakeCore("live");map.set(live.core,live);
  set.addRoot({id:"live"},live.core);
  expect(()=>mountRichMultiRootEditor(document.createElement("div"),{set,roots:[{id:"gone",core:fake.core,detached:true}]})).toThrow("Only restored roots can be detached");
  const editor=mountRichMultiRootEditor(container,{set,restored:true,roots:[{id:"live",core:live.core},{id:"gone",core:fake.core,detached:true}]});
  expect(sections(container)).toEqual(["live"]);
  // This coordinator does not list it in `detached`, so the restored owner is released.
  expect(fake.core.dispose).toHaveBeenCalledTimes(1);
  editor.dispose();
  expect(fake.core.dispose).toHaveBeenCalledTimes(1);
 });
 it("restores each root with its codec family and attaches it before mounting",()=>{
  const fake=fakeCore("a"),gone=fakeCore("b"),attach=vi.fn(()=>({roots:[{id:"a",label:"A",attributes:{order:"1"}}]}) as unknown as RichRootSetState);
  const set={restore:()=>[{id:"a",history:"typing-v1",selection:"original",checkpoint:"cp"},{id:"b",detached:true,history:"explicit",selection:"original",checkpoint:"old"}],attach,state:()=>({roots:[{id:"a",label:"A",attributes:{order:"1"}}]})} as unknown as RichRootSetPort;
  const restoreTypingEditor=vi.fn(()=>fake.core),restoreEditor=vi.fn(()=>gone.core);
  const roots=restoreRichRootSet(set,{restoreTypingEditor,restoreEditor} as unknown as RichCoreProfile,"{}");
  expect(restoreTypingEditor).toHaveBeenCalledWith("cp");
  expect(restoreEditor).toHaveBeenCalledWith("old");
  expect(attach).toHaveBeenCalledWith("a",fake.core);
  expect(attach).toHaveBeenCalledWith("b",gone.core);
  expect(roots).toEqual([{id:"a",core:fake.core,label:"A",attributes:{order:"1"}},{id:"b",core:gone.core,detached:true}]);
 });
});
