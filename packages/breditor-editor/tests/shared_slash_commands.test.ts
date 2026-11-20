import {afterEach,describe,expect,it,vi} from "vitest";
// Structural V2 controls normally compose the standard inline controls, which need a compiled inline
// presentation. Slash items never use inline controls, so the inline half is replaced by the common
// (presentation-free) shared toolbar; every structural control stays the real implementation.
vi.mock("../../breditor-collaboration/src/standard_toolbar.js",async()=>{
 const toolbar=await import("../../breditor-collaboration/src/toolbar.js");
 return {createStandardSharedToolbarV1:()=>[...toolbar.defaultSharedToolbarFor().filter(control=>control.id!=="bold"),...toolbar.moveSharedToolbarFor()]};
});
import {mountSharedEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {defaultSharedToolbarFor} from "../../breditor-collaboration/src/toolbar.js";
import {structuralSharedControlsForOwner} from "../../breditor-collaboration/src/structural_controls_v2.js";
import {createSharedSlashCommands,mountSharedSlashCommands,sharedSlashCommandKinds,type SharedSlashCommandOptions,type SharedSlashItem} from "../../breditor-collaboration/src/slash_commands.js";
import type {SharedRustOwner,RichSelection,SharedToolbarControl,SharedDispatch} from "../../breditor-collaboration/src/types.js";
import {mountSlashCommands} from "../src/shared_slash_commands.js";

type Run={kind:"text";text:string;formats:[]};
type N={kind:"element";type:string;entityId:null;properties:Record<string,unknown>;children:(N|Run)[]};
const el=(type:string,block:string,children:N["children"]=[],extra:Record<string,unknown>={}):N=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block,...extra},children});
const p=(block:string,value:string)=>el("paragraph",block,value?[{kind:"text",text:value,formats:[]}]:[]);
type Text=Extract<RichSelection,{kind:"text"}>;
const caret=(block:string,offset:number):Text=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
const textOf=(node:N)=>node.children.map(child=>child.kind==="text"?child.text:"").join("");
function find(root:N,block:string):{node:N;parent:N;index:number}|undefined{
 for(const [index,child] of root.children.entries()){if(child.kind!=="element")continue;if(child.properties["breditor/block-id"]===block)return {node:child,parent:root,index};const hit=find(child,block);if(hit)return hit;}
 return undefined;
}
function setText(node:N,value:string):void{node.children=value?[{kind:"text",text:value,formats:[]}]:[];}
type Command=SharedDispatch["commands"][number];
/** Minimal stand-in for the shared native owner: exact guarded views, one snapshot Undo group per dispatch, remote frames. */
function fakeOwner(initial:N[],{refuse=[] as string[]}={}){
 let root:N={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:initial},revision=0,selection:RichSelection|null=caret(String(initial[0]!.properties["breditor/block-id"]),textOf(initial[0]!).length),readOnly=false;
 const undo:{root:string;selection:RichSelection|null}[]=[],dispatched:SharedDispatch[]=[];
 const view=()=>({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),documentJson:JSON.stringify({schema:{name:"test/shared-slash",version:2},schemaFingerprint:"fixture",root}),selection,pendingFormatsJson:null,undoDepth:undo.length,redoDepth:0,historyCapacity:1000,grid:null,tables:[],...(readOnly?{readOnly:true,readOnlyRevision:"1"}:{})});
 const need=(block:string)=>{const hit=find(root,block);if(!hit)throw Error(`unknown block ${block}`);return hit;};
 const wrap=(first:string,wrapper:N)=>{const {parent,index,node}=need(first);parent.children.splice(index,1,wrapper);return node;};
 const apply=(command:Command):void=>{
  if(refuse.includes(command.kind))throw Error(`native refused ${command.kind}`);
  const d=command.data as Record<string,never>;
  switch(command.kind){
   case "delete_text":{const {node}=need(d.block),value=textOf(node);if(d.offset+d.length>value.length)throw Error("range");setText(node,value.slice(0,d.offset)+value.slice(d.offset+d.length));
    const s=selection;if(s?.kind==="text"&&s.focus.block===d.block&&Number(s.focus.offset)>d.offset)selection=caret(d.block,Math.max(d.offset,Number(s.focus.offset)-d.length));return;}
   case "set_heading":{const {node}=need(d.block),level=d.level as number|null;node.type=level===null?"breditor/paragraph":"breditor/heading";if(level===null)delete node.properties["breditor/level"];else node.properties["breditor/level"]=level;return;}
   case "set_code_block":{const {node}=need(d.block);node.type="breditor/code-block";node.properties["breditor/language"]=d.language;return;}
   case "wrap_list":{const style=d.style as {kind:string},node=find(root,d.first)!.node,item=el("list-item",(d.items as string[])[0]!);wrap(d.first,el(style.kind==="bullet"?"bullet-list":"ordered-list",d.container,[item],style.kind==="bullet"?{}:{"breditor/start":1}));item.children=[node];return;}
   case "wrap_task_list":{const node=find(root,d.first)!.node,item=el("task-item",(d.items as {block:string}[])[0]!.block,[],{"breditor/checked":false});wrap(d.first,el("task-list",d.container,[item]));item.children=[node];return;}
   case "wrap_blockquote":{const node=find(root,d.first)!.node;wrap(d.first,el("blockquote",d.wrapper,[node]));return;}
   case "insert_horizontal_rule":case "insert_blocks":{const parent=d.parent===null?root:need(d.parent).node,index=d.before===null?parent.children.length:parent.children.findIndex(c=>c.kind==="element"&&c.properties["breditor/block-id"]===d.before);
    parent.children.splice(index,0,...(command.kind==="insert_blocks"?(d.nodes as N[]):[el("horizontal-rule",d.block)]));return;}
   default:throw Error(`fixture does not implement ${command.kind}`);
  }
 };
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>{const frozen=JSON.stringify(view());return {view_json:()=>frozen,free:()=>{}};},free:vi.fn(),
  dispatch:vi.fn((_o:unknown,input:string)=>{
   const request=JSON.parse(input) as SharedDispatch;dispatched.push(request);if(readOnly)throw Error("read-only");
   const saved={root:JSON.stringify(root),selection};
   try{for(const command of request.commands)apply(command);}catch(error){root=JSON.parse(saved.root) as N;selection=saved.selection;throw error;}
   undo.push(saved);revision++;return true;}),
  undo_observed:vi.fn(()=>{const previous=undo.pop();if(!previous)return false;root=JSON.parse(previous.root) as N;selection=previous.selection;revision++;return true;}),redo_observed:vi.fn(()=>false),
  set_selection:vi.fn((_o:unknown,input:string)=>{selection=JSON.parse(input) as RichSelection|null;revision++;return true;}),
  insert_plain_text:vi.fn((_o:unknown,value:string)=>{
   if(readOnly)throw Error("read-only");const s=selection as Text,{node}=need(s.focus.block),offset=Number(s.focus.offset),before=textOf(node);
   undo.push({root:JSON.stringify(root),selection});setText(node,before.slice(0,offset)+value+before.slice(offset));selection=caret(s.focus.block,offset+value.length);revision++;return true;}),
  set_pending_formats:vi.fn(),navigate_grid:vi.fn(()=>JSON.stringify({kind:"unchanged"})),copy_clipboard:vi.fn(),
  /** Remote frames are JSON test intents; they never add a local Undo step. */
  receive_frame:vi.fn((input:string)=>{
   const frame=JSON.parse(input) as {kind:"insert";block:string;offset:number;text:string}|{kind:"remove";block:string}|{kind:"read-only"};
   if(frame.kind==="read-only")readOnly=true;
   else if(frame.kind==="remove"){const {parent,index}=need(frame.block);parent.children.splice(index,1);}
   else{const {node}=need(frame.block),before=textOf(node);setText(node,before.slice(0,frame.offset)+frame.text+before.slice(frame.offset));const s=selection;if(s?.kind==="text"&&s.focus.block===frame.block&&Number(s.focus.offset)>=frame.offset)selection=caret(frame.block,Number(s.focus.offset)+frame.text.length);}
   revision++;}),
 };
 return {raw,dispatched,root:()=>root,undoDepth:()=>undo.length,select:(s:RichSelection)=>{selection=s;revision++;}};
}
/** Real structural V2 controls (inline half replaced; see the mock above). */
function structuralControls():readonly SharedToolbarControl[]{
 const stub={richLanguageVersion:()=>2,supportsSelectionFormatting:()=>false,supportsCodeExit:()=>false,supportsFlowNavigation:()=>false} as unknown as SharedRichEditor;
 return structuralSharedControlsForOwner(stub,{} as never,2);
}
const mounted:(()=>void)[]=[];
afterEach(()=>{for(const release of mounted.splice(0))release();document.body.replaceChildren();vi.restoreAllMocks();});
function setup(text="",options:{toolbar?:readonly SharedToolbarControl[];items?:SharedSlashCommandOptions["items"];refuse?:string[];ui?:object;maxItems?:number}={}){
 const owner=fakeOwner([p("a",text),p("b","second")],{refuse:options.refuse??[]});
 const core=new SharedRichEditor(owner.raw as unknown as SharedRustOwner),host=document.createElement("div");document.body.append(host);
 const errors:unknown[]=[];const dom=mountSharedEditor(host,{core,coreOwnership:"borrow",toolbar:[],onError:e=>errors.push(e),...(options.ui?{ui:options.ui}:{})} as never);
 const onCancel=vi.fn(),onError=vi.fn(),onExecute=vi.fn();
 const slash=mountSharedSlashCommands(dom,{items:options.items??createSharedSlashCommands(options.toolbar??structuralControls(),undefined,dom.uiLocale()),onCancel,onError,onExecute,maxItems:options.maxItems??20});
 mounted.push(()=>{slash.dispose();dom.dispose();core.dispose();host.remove();});
 return {...owner,core,dom,slash,errors,onCancel,onError,onExecute};
}
function type(dom:{surface:HTMLElement},text:string):void{for(const data of text)dom.surface.dispatchEvent(new InputEvent("beforeinput",{inputType:"insertText",data,bubbles:true,cancelable:true}));}
function key(dom:{surface:HTMLElement},name:string,init:KeyboardEventInit={}):KeyboardEvent{const event=new KeyboardEvent("keydown",{key:name,bubbles:true,cancelable:true,...init});dom.surface.dispatchEvent(event);return event;}
const menu=()=>document.querySelector<HTMLElement>("[data-breditor-slash]")!;
const labels=(t:{slash:{state():{items:readonly {label:string}[]}}})=>t.slash.state().items.map(item=>item.label);
const remote=(t:{core:SharedRichEditor},frame:object)=>t.core.receiveFrame(JSON.stringify(frame));
const block=(t:{root():N},id:string)=>find(t.root(),id)?.node;

describe("shared slash-command session",()=>{
 it("opens on a typed slash with the local accessible listbox and the shared V2 catalog",()=>{
  const t=setup();type(t.dom,"/");
  expect(t.slash.state()).toMatchObject({open:true,trigger:{block:"a",start:0},query:""});
  expect(labels(t)).toEqual(["Text","Heading 1","Heading 2","Heading 3","Bullet list","Numbered list","Task list","Quote","Code block","Divider","Table"]);
  const list=menu().querySelector("[role=listbox]")!;expect(menu().contains(t.dom.surface)).toBe(false);
  expect(t.dom.surface.getAttribute("aria-controls")).toBe(list.id);expect(t.dom.surface.getAttribute("aria-expanded")).toBe("true");expect(t.dom.surface.getAttribute("aria-autocomplete")).toBe("list");
  expect(t.dom.surface.getAttribute("aria-activedescendant")).toBe(list.querySelector("[role=option]")!.id);
  expect(menu().querySelector("[role=status]")!.textContent).toBe("11 commands available");
  key(t.dom,"Escape");expect(t.slash.state()).toMatchObject({open:false,lastCancel:"dismissed"});expect(t.dom.surface.hasAttribute("aria-expanded")).toBe(false);
  expect(t.dispatched).toEqual([]);
 });
 it("offers only the V1 items a V1 toolbar can represent (no V4 or structural items)",()=>{
  const t=setup("",{toolbar:defaultSharedToolbarFor()});type(t.dom,"/");
  expect(labels(t)).toEqual(["Text","Heading 1","Heading 2","Heading 3","Bullet list","Numbered list","Table"]);
 });
 it("removes the trigger and converts the block in ONE guarded batch that one Undo reverts",()=>{
  const t=setup("Intro ");type(t.dom,"/hea");
  expect(t.slash.state().query).toBe("hea");expect(labels(t)).toEqual(["Heading 1","Heading 2","Heading 3"]);
  const typedDepth=t.undoDepth(),revision=t.dom.view().revision,typed=JSON.stringify(t.root());
  expect(key(t.dom,"Enter").defaultPrevented).toBe(true);
  expect(t.dispatched).toEqual([{commands:[{kind:"delete_text",data:{block:"a",offset:6,length:4}},{kind:"set_heading",data:{block:"a",level:1}}]}]);
  expect(t.onExecute).toHaveBeenCalledWith({item:"heading-1",request:t.dispatched[0],revision});
  expect(block(t,"a")).toMatchObject({type:"breditor/heading",properties:{"breditor/level":1}});expect(textOf(block(t,"a")!)).toBe("Intro ");
  expect(t.undoDepth()).toBe(typedDepth+1);expect(t.slash.state().open).toBe(false);expect(t.dom.view().selection).toEqual(caret("a",6));
  key(t.dom,"z",{ctrlKey:true});expect(t.raw.undo_observed).toHaveBeenCalledTimes(1);expect(JSON.stringify(t.root())).toBe(typed);
  expect(t.errors).toEqual([]);
 });
 it("sends exactly the batches the Rust contract proves are one history group",()=>{
  // Mirrors crates/breditor-collaboration/tests/shared_slash_batch_contracts.rs item by item.
  const expected:Record<string,unknown>={
   "paragraph":{kind:"set_heading",data:{block:"a",level:null}},
   "heading-2":{kind:"set_heading",data:{block:"a",level:2}},
   "bullet-list":{kind:"wrap_list",data:{first:"a",last:"a",container:expect.any(String),items:[expect.any(String)],style:{kind:"bullet"}}},
   "numbered-list":{kind:"wrap_list",data:{first:"a",last:"a",container:expect.any(String),items:[expect.any(String)],style:{kind:"ordered",start:1}}},
   "task-list":{kind:"wrap_task_list",data:{first:"a",last:"a",container:expect.any(String),items:[{block:expect.any(String),checked:false}]}},
   "blockquote":{kind:"wrap_blockquote",data:{first:"a",last:"a",wrapper:expect.any(String)}},
   "code-block":{kind:"set_code_block",data:{block:"a",language:null,format_policy:"reject_formatted"}},
   "horizontal-rule":{kind:"insert_horizontal_rule",data:{parent:null,before:"b",block:expect.any(String)}},
   "table":{kind:"insert_blocks",data:{parent:null,before:"b",nodes:[expect.objectContaining({type:"breditor/table"})]}},
  };
  for(const [item,command] of Object.entries(expected)){
   const t=setup("x ");type(t.dom,"/");const index=t.slash.state().items.findIndex(entry=>entry.id===item);expect(index,item).toBeGreaterThanOrEqual(0);
   const depth=t.undoDepth();t.slash.choose(index);
   expect(t.dispatched,item).toEqual([{commands:[{kind:"delete_text",data:{block:"a",offset:2,length:1}},command]}]);
   expect(t.undoDepth(),item).toBe(depth+1);expect(textOf(block(t,"a")!)).toBe("x ");
   expect(sharedSlashCommandKinds).toContain((command as {kind:string}).kind);
   for(const release of mounted.splice(0))release();
  }
 });
 it("cancels when a remote publication invalidates the trigger and keeps it open for unrelated remote edits",async()=>{
  const t=setup("Intro ");type(t.dom,"/he");expect(t.slash.state().open).toBe(true);
  await remote(t,{kind:"insert",block:"b",offset:0,text:"peer "});
  expect(t.slash.state()).toMatchObject({open:true,query:"he",trigger:{block:"a",start:6}});expect(textOf(block(t,"b")!)).toBe("peer second");
  await remote(t,{kind:"insert",block:"a",offset:0,text:"X"});
  expect(t.slash.state()).toMatchObject({open:false,lastCancel:"trigger-invalidated"});expect(t.onCancel).toHaveBeenCalledWith("trigger-invalidated");
  expect(menu().hidden).toBe(true);expect(t.dispatched).toEqual([]);
  // The typed text stays; nothing reopens without a newly typed slash.
  await remote(t,{kind:"insert",block:"b",offset:0,text:"!"});expect(t.slash.state().open).toBe(false);
 });
 it("cancels when a peer removes the trigger block",async()=>{
  const t=setup("Intro ");type(t.dom,"/");t.select(caret("a",7));await remote(t,{kind:"remove",block:"a"});
  expect(t.slash.state()).toMatchObject({open:false,lastCancel:"trigger-invalidated"});expect(t.dispatched).toEqual([]);
 });
 it("cancels on a remote read-only policy change and offers nothing while read-only",async()=>{
  const t=setup();type(t.dom,"/");expect(t.slash.state().open).toBe(true);
  await remote(t,{kind:"read-only"});
  expect(t.slash.state()).toMatchObject({open:false,lastCancel:"read-only"});expect(t.onCancel).toHaveBeenCalledWith("read-only");
  const items=createSharedSlashCommands(structuralControls()),view=t.dom.view();
  const {presentationModel}=await import("@breditor/experimental-rich-content/rendering");
  const model=presentationModel({...view,format:"breditor/rich-view"} as never,"original");
  expect(items.filter(item=>item.enabled({model,revision:view.revision,allocate:kind=>`x:${kind}`}))).toEqual([]);
  type(t.dom,"/");expect(t.slash.state().open).toBe(false);expect(t.dispatched).toEqual([]);
 });
 it("cancels on composition and does not open for composed text",()=>{
  const t=setup();type(t.dom,"/");t.dom.surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));
  expect(t.slash.state()).toMatchObject({open:false,lastCancel:"composition"});
  t.dom.surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true,data:""}));expect(t.dispatched).toEqual([]);
 });
 it("publishes nothing and leaves the typed trigger when Rust refuses the batch",()=>{
  const t=setup("x ",{refuse:["wrap_blockquote"]});type(t.dom,"/quo");const depth=t.undoDepth();
  expect(labels(t)).toEqual(["Quote"]);expect(()=>t.slash.choose()).toThrow(/native refused wrap_blockquote/);
  expect(textOf(block(t,"a")!)).toBe("x /quo");expect(block(t,"a")!.type).toBe("breditor/paragraph");expect(t.undoDepth()).toBe(depth);
 });
 it("omits controls whose action is not one allowlisted dispatch and refuses non-allowlisted custom batches",()=>{
  const controls=[...structuralControls()],items=createSharedSlashCommands(controls,[{id:"select-table",control:"select-table"},{id:"unquote",control:"unquote"},{id:"undo",control:"undo"}]);
  const t=setup("x ",{items:[...items,{id:"custom",label:"Custom split",enabled:()=>true,prepare:()=>({commands:[{kind:"split_text_block",data:{block:"a",offset:0,right:"r",right_heading:null}}]})} satisfies SharedSlashItem]});
  type(t.dom,"/");expect(labels(t)).toEqual(["Custom split"]);
  expect(()=>t.slash.choose()).toThrow(/cannot carry split_text_block/);expect(t.dispatched).toEqual([]);expect(textOf(block(t,"a")!)).toBe("x /");
 });
 it("discards stale async provider results and aborts superseded requests",async()=>{
  const signals:AbortSignal[]=[],resolvers:((items:readonly SharedSlashItem[])=>void)[]=[];
  const all=createSharedSlashCommands(defaultSharedToolbarFor());
  const t=setup("",{items:(_query,request)=>{signals.push(request.signal);return new Promise(resolve=>resolvers.push(resolve));}});
  type(t.dom,"/");expect(t.slash.state().loading).toBe(true);expect(menu().querySelector("[role=listbox]")!.getAttribute("aria-busy")).toBe("true");
  expect(key(t.dom,"Enter").defaultPrevented).toBe(false);
  type(t.dom,"h");expect(signals[0]!.aborted).toBe(true);
  resolvers[0]!(all);await Promise.resolve();expect(t.slash.state().loading).toBe(true);
  resolvers[1]!(all.filter(item=>item.id.startsWith("heading")));await Promise.resolve();await Promise.resolve();
  expect(t.slash.state()).toMatchObject({loading:false,query:"h"});expect(labels(t)).toEqual(["Heading 1","Heading 2","Heading 3"]);
  t.slash.choose(2);expect(t.dispatched[0]!.commands[1]).toEqual({kind:"set_heading",data:{block:"a",level:3}});
 });
 it("uses the editor's UI catalog for menu strings and standard item labels",()=>{
  const t=setup("",{toolbar:defaultSharedToolbarFor(),ui:{lang:"fr",strings:{slashLabel:"Commandes",slashCount:"{count} commandes"},slashItems:{"heading-1":{label:"Titre 1"}}}});
  type(t.dom,"/");expect(labels(t)).toContain("Titre 1");expect(menu().getAttribute("lang")).toBe("fr");
  expect(menu().querySelector("[role=listbox]")!.getAttribute("aria-label")).toBe("Commandes");expect(menu().querySelector("[role=status]")!.textContent).toBe("7 commandes");
 });
 it("mounts through the SDK with the session's own toolbar by default",()=>{
  const owner=fakeOwner([p("a","")]),core=new SharedRichEditor(owner.raw as unknown as SharedRustOwner),host=document.createElement("div");document.body.append(host);
  const dom=mountSharedEditor(host,{core,coreOwnership:"borrow",toolbar:[]} as never);
  const session={surface:dom.surface,search:()=>dom,view:()=>dom.view(),execute:(r:SharedDispatch,f?:boolean,v?:string)=>dom.execute(r,f,v),focus:()=>dom.focus(),uiLocale:()=>dom.uiLocale(),toolbarControls:()=>defaultSharedToolbarFor()};
  const slash=mountSlashCommands(session);
  try{
   type(dom,"/nu");expect(labels({slash})).toEqual(["Numbered list"]);const depth=owner.undoDepth();key(dom,"Tab");
   expect(owner.dispatched[0]!.commands.map(command=>command.kind)).toEqual(["delete_text","wrap_list"]);expect(owner.undoDepth()).toBe(depth+1);
   expect(()=>mountSlashCommands({...session,toolbarControls:undefined})).toThrow(/Pass slash-command items/);
  }finally{slash.dispose();dom.dispose();core.dispose();host.remove();}
 });
 it("refuses a second shared menu on the same surface and releases on dispose",()=>{
  const t=setup();expect(()=>mountSharedSlashCommands(t.dom,{items:[]})).toThrow(/already has slash commands/);
  t.slash.dispose();expect(menu()).toBeNull();const again=mountSharedSlashCommands(t.dom,{items:[]});again.dispose();
 });
});
