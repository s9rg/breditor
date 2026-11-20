import {afterEach,describe,expect,it,vi} from "vitest";
import {mountSharedEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {SharedEditorError} from "../../breditor-collaboration/src/shared_editor_error.js";
import {createSharedStructureControlsV4,sharedStructureRequestV4,sharedStructureCommandKindsV4} from "../../breditor-collaboration/src/structure_v4.js";
import {createSharedSlashCommands,mountSharedSlashCommands,sharedSlashCommandKinds,standardSharedSlashPicks} from "../../breditor-collaboration/src/slash_commands.js";
import type {SharedRustOwner,RichSelection,SharedToolbarControl,SharedDispatch} from "../../breditor-collaboration/src/types.js";
import {presentationModel} from "@breditor/experimental-rich-content/rendering";

type Run={kind:"text";text:string;formats:[]};
type N={kind:"element";type:string;entityId:null;properties:Record<string,unknown>;children:(N|Run)[]};
const el=(type:string,block:string,children:N["children"]=[],extra:Record<string,unknown>={}):N=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block,...extra},children});
const p=(block:string,value:string)=>el("paragraph",block,value?[{kind:"text",text:value,formats:[]}]:[]);
type Text=Extract<RichSelection,{kind:"text"}>;
const caret=(block:string,offset:number):Text=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
const textOf=(node:N)=>node.children.map(child=>child.kind==="text"?child.text:"").join("");
const idOf=(node:N|Run)=>node.kind==="element"?String(node.properties["breditor/block-id"]):"";
function find(root:N,block:string):{node:N;parent:N;index:number}|undefined{
 for(const [index,child] of root.children.entries()){if(child.kind!=="element")continue;if(idOf(child)===block)return {node:child,parent:root,index};const hit=find(child,block);if(hit)return hit;}
 return undefined;
}
const cell=(row:string,column:string)=>el("table-cell",`cell-${row}-${column}`,[p(`p-${row}-${column}`,"x")],{"breditor/column-id":column,"breditor/header":false});
const table=(caption?:N)=>el("table","tbl",[el("table-row","row-1",[cell("1","c1"),cell("1","c2")],{"breditor/row-id":"r1"}),...(caption?[caption]:[])],
 {"breditor/table-id":"t","breditor/columns":[{id:"c1",width:120},{id:"c2",width:120}],"breditor/merges":[],"breditor/retracted-merges":[]});
const section=()=>el("details","sec",[el("details-summary","sum",[{kind:"text",text:"More",formats:[]}]),p("body","Body")],{"breditor/details-open":true});
type Command=SharedDispatch["commands"][number];
const slices=["listNumberingVersion","textLanguageVersion","imageLinkVersion","detailsVersion","mentionVersion","tableCaptionVersion","pageBreakVersion","bookmarkVersion"];
/** Minimal stand-in for a shared V4 native owner: one snapshot Undo group per dispatch. */
function fakeOwner(initial:N[],{structure=true}={}){
 let root:N={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:initial},revision=0,selection:RichSelection|null=caret(idOf(initial[0]!),0);
 const undo:{root:string;selection:RichSelection|null}[]=[],dispatched:SharedDispatch[]=[];
 const view=()=>({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),documentJson:JSON.stringify({schema:{name:"test/shared-v4",version:1},schemaFingerprint:"fixture",root}),selection,pendingFormatsJson:null,undoDepth:undo.length,redoDepth:0,historyCapacity:1000,grid:null,tables:[]});
 const need=(block:string)=>{const hit=find(root,block);if(!hit)throw Error(`unknown block ${block}`);return hit;};
 const apply=(command:Command):void=>{
  const d=command.data as Record<string,never>;
  switch(command.kind){
   case "delete_text":{const {node}=need(d.block),value=textOf(node);node.children=[{kind:"text",text:value.slice(0,d.offset)+value.slice(d.offset+d.length),formats:[]}].filter(r=>r.text);return;}
   case "wrap_details":{const {parent,index}=need(d.first),last=need(d.last).index;const body=parent.children.splice(index,last-index+1,el("details",d.wrapper,[],d.open?{"breditor/details-open":true}:{}));(parent.children[index] as N).children=[el("details-summary",d.summary),...body];return;}
   case "unwrap_details":{const {parent,index,node}=need(d.wrapper),[summary,...body]=node.children as N[];parent.children.splice(index,1,{...summary!,type:"breditor/paragraph"},...body);return;}
   case "insert_page_break":{const index=d.before===null?root.children.length:need(d.before).index;if(d.before!==null&&need(d.before).parent!==root)throw Error("root only");root.children.splice(index,0,el("page-break",d.block));return;}
   case "delete_page_break":{const {parent,index}=need(d.block);parent.children.splice(index,1,...(d.paragraph?[p(d.paragraph,"")]:[]));return;}
   case "add_table_caption":{const {node}=need(d.block);if(node.children.at(-1)?.kind==="element"&&(node.children.at(-1) as N).type==="breditor/paragraph")throw Error("exists");node.children.push(p(d.caption,""));return;}
   case "remove_table_caption":{const {node}=need(d.block);if((node.children.at(-1) as N).type==="breditor/paragraph")node.children.pop();return;}
   case "insert_blocks":{const parent=d.parent===null?root:need(d.parent).node,index=d.before===null?parent.children.length:need(d.before).index;parent.children.splice(index,0,...(d.nodes as N[]));return;}
   default:throw Error(`fixture does not implement ${command.kind}`);
  }
 };
 const descriptor={format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:14,journalVersion:15,richLanguageVersion:4,blockLayoutVersion:1,...Object.fromEntries(slices.map(name=>[name,1]))};
 const raw:Record<string,unknown>={descriptor_json:()=>JSON.stringify(descriptor),observe:()=>{const frozen=JSON.stringify(view());return {view_json:()=>frozen,free:()=>{}};},free:vi.fn(),
  block_layout_version:()=>"1",block_layout_state_json:()=>JSON.stringify({kind:"unavailable"}),change_selection_layout:vi.fn(),rich_language_version:()=>"4",
  list_numbering_version:()=>"1",text_language_version:()=>"1",image_link_version:()=>"1",details_version:()=>"1",mention_version:()=>"1",table_caption_version:()=>"1",page_break_version:()=>"1",bookmark_version:()=>"1",
  ...(structure?{structure_commands_v4_version:()=>"1"}:{}),
  dispatch:vi.fn((_o:unknown,input:string)=>{
   const request=JSON.parse(input) as SharedDispatch;dispatched.push(request);const saved={root:JSON.stringify(root),selection};
   try{for(const command of request.commands)apply(command);}catch(error){root=JSON.parse(saved.root) as N;selection=saved.selection;throw error;}
   if(request.selectionUpdate?.kind==="set")selection=request.selectionUpdate.value;
   undo.push(saved);revision++;return true;}),
  undo_observed:vi.fn(()=>{const previous=undo.pop();if(!previous)return false;root=JSON.parse(previous.root) as N;selection=previous.selection;revision++;return true;}),redo_observed:vi.fn(()=>false),
  set_selection:vi.fn((_o:unknown,input:string)=>{selection=JSON.parse(input) as RichSelection|null;revision++;return true;}),
  insert_plain_text:vi.fn((_o:unknown,value:string)=>{const s=selection as Text,{node}=need(s.focus.block),offset=Number(s.focus.offset),before=textOf(node);
   undo.push({root:JSON.stringify(root),selection});node.children=[{kind:"text",text:before.slice(0,offset)+value+before.slice(offset),formats:[]}];selection=caret(s.focus.block,offset+value.length);revision++;return true;}),
  insert_hard_break:vi.fn(()=>true),set_pending_formats:vi.fn(),navigate_grid:vi.fn(()=>JSON.stringify({kind:"unchanged"})),copy_clipboard:vi.fn(),
 };
 return {raw,dispatched,root:()=>root,undoDepth:()=>undo.length,select:(s:RichSelection)=>{selection=s;revision++;}};
}
const mounted:(()=>void)[]=[];
afterEach(()=>{for(const release of mounted.splice(0))release();document.body.replaceChildren();vi.restoreAllMocks();});
function setup(children:N[],options:{structure?:boolean}={}){
 const owner=fakeOwner(children,options),core=new SharedRichEditor(owner.raw as unknown as SharedRustOwner);
 mounted.push(()=>core.dispose());
 let next=0;const allocate=(kind:string)=>`${kind}-${++next}`;
 const context=()=>{const view=core.view();return {core,model:presentationModel({...view,format:"breditor/rich-view"} as never,"original"),revision:view.revision,allocate};};
 return {...owner,core,context,select:(selection:RichSelection)=>{core.select(selection);}};
}
const control=(controls:readonly SharedToolbarControl[],id:string)=>{const found=controls.find(c=>c.id===id);if(!found)throw Error(`missing ${id}`);return found;};

describe("shared V4 structure commands",()=>{
 it("reports the capability only on a matching V4 owner and refuses without it",()=>{
  const t=setup([p("a","One")]);expect(t.core.supportsSharedStructureV4()).toBe(true);
  expect(createSharedStructureControlsV4(t.core).map(c=>[c.id,c.label])).toEqual([["details","Collapsible section"],["undetails","Remove collapsible section"],["page-break","Page break"],["table-caption","Table caption"]]);
  const old=setup([p("a","One")],{structure:false});expect(old.core.supportsSharedStructureV4()).toBe(false);
  expect(createSharedStructureControlsV4(old.core)).toEqual([]);
  expect(()=>old.core.insertPageBreak("pb",null)).toThrow(SharedEditorError);expect(old.dispatched).toEqual([]);
  expect(sharedStructureCommandKindsV4).toEqual(["wrap_details","unwrap_details","insert_page_break","delete_page_break","add_table_caption","remove_table_caption"]);
 });
 it("sends one guarded dispatch per SharedRichEditor method with the local selection policy",()=>{
  const t=setup([p("a","One"),p("b","Two"),table()]);
  t.core.wrapDetails("a","b","s","s-sum");
  t.core.unwrapDetails("s");
  t.core.insertPageBreak("pb","b");
  t.core.deletePageBreak("pb",null);
  t.core.addTableCaption("tbl","cap");
  expect(t.core.view().selection).toEqual(caret("cap",0));
  t.core.removeTableCaption("tbl");
  t.core.addTableCaption("tbl","cap-2");t.select(caret("a",1));t.core.removeTableCaption("tbl");
  expect(t.dispatched).toEqual([
   {commands:[{kind:"wrap_details",data:{first:"a",last:"b",wrapper:"s",summary:"s-sum",open:true}}]},
   {commands:[{kind:"unwrap_details",data:{wrapper:"s"}}]},
   {commands:[{kind:"insert_page_break",data:{block:"pb",before:"b"}}]},
   {commands:[{kind:"delete_page_break",data:{block:"pb",paragraph:null}}]},
   {commands:[{kind:"add_table_caption",data:{block:"tbl",caption:"cap"}}],selectionUpdate:{kind:"set",value:caret("cap",0)},pendingFormatsUpdate:{kind:"set",value:null}},
   {commands:[{kind:"remove_table_caption",data:{block:"tbl"}}],selectionUpdate:{kind:"set",value:{kind:"node",block:"tbl"}},pendingFormatsUpdate:{kind:"set",value:null}},
   {commands:[{kind:"add_table_caption",data:{block:"tbl",caption:"cap-2"}}],selectionUpdate:{kind:"set",value:caret("cap-2",0)},pendingFormatsUpdate:{kind:"set",value:null}},
   {commands:[{kind:"remove_table_caption",data:{block:"tbl"}}]},
  ]);
  expect(t.undoDepth()).toBe(8);
  expect(()=>sharedStructureRequestV4(t.core,{kind:"delete_text",data:{block:"a",offset:0,length:1}})).toThrow(/structure command/);
 });
 it("runs the toolbar controls against the selection exactly like the local V4 controls",()=>{
  const t=setup([p("a","One"),section(),table(),p("z","End")]),controls=createSharedStructureControlsV4(t.core);
  // Collapsible section wraps the caret's block; Remove collapsible section lifts the nearest one.
  t.select(caret("a",1));expect(control(controls,"details").enabled(t.context())).toBe(true);
  control(controls,"details").run(t.context());
  expect(t.dispatched.at(-1)).toEqual({commands:[{kind:"wrap_details",data:{first:"a",last:"a",wrapper:"details-1",summary:"summary-2",open:true}}]});
  t.select(caret("body",0));expect(control(controls,"undetails").enabled(t.context())).toBe(true);
  control(controls,"undetails").run(t.context());expect(t.dispatched.at(-1)!.commands).toEqual([{kind:"unwrap_details",data:{wrapper:"sec"}}]);
  // A summary is never wrapped; Page break lands after the caret's whole root block.
  t.select(caret("p-1-c1",0));expect(control(controls,"details").enabled(t.context())).toBe(true);
  control(controls,"page-break").run(t.context());
  expect(t.dispatched.at(-1)!.commands).toEqual([{kind:"insert_page_break",data:{block:expect.stringMatching(/^page-break-/),before:"z"}}]);
  // Table caption: pressed reading, add with a caret in it, remove.
  t.select(caret("p-1-c1",0));expect(control(controls,"table-caption").read!(t.context())).toEqual({kind:"uniform",pressed:false});
  control(controls,"table-caption").run(t.context());
  const added=t.dispatched.at(-1)!;expect(added.commands[0]).toMatchObject({kind:"add_table_caption",data:{block:"tbl"}});
  expect(t.core.view().selection).toEqual(caret((added.commands[0]!.data as {caption:string}).caption,0));
  expect(control(controls,"table-caption").read!(t.context())).toEqual({kind:"uniform",pressed:true});
  control(controls,"table-caption").run(t.context());
  expect(t.dispatched.at(-1)).toEqual({commands:[{kind:"remove_table_caption",data:{block:"tbl"}}],selectionUpdate:{kind:"set",value:{kind:"node",block:"tbl"}},pendingFormatsUpdate:{kind:"set",value:null}});
  t.select(caret("z",0));expect(control(controls,"table-caption").enabled(t.context())).toBe(false);
 });
 it("adds Collapsible section and Page break to the shared slash menu as one-batch items",()=>{
  expect(sharedSlashCommandKinds).toEqual(expect.arrayContaining(["wrap_details","insert_page_break"]));
  expect(standardSharedSlashPicks.slice(-2).map(pick=>[pick.id,pick.control,pick.label])).toEqual([["details","details","Collapsible section"],["page-break","page-break","Page break"]]);
  const t=setup([p("a","x "),p("b","Two")]),host=document.createElement("div");document.body.append(host);
  const dom=mountSharedEditor(host,{core:t.core,coreOwnership:"borrow",toolbar:[]} as never);
  const items=createSharedSlashCommands(createSharedStructureControlsV4(t.core),standardSharedSlashPicks,dom.uiLocale());
  expect(items.map(item=>item.label)).toEqual(["Collapsible section","Page break"]);
  const slash=mountSharedSlashCommands(dom,{items});mounted.push(()=>{slash.dispose();dom.dispose();host.remove();});
  t.select(caret("a",2));dom.surface.dispatchEvent(new InputEvent("beforeinput",{inputType:"insertText",data:"/",bubbles:true,cancelable:true}));
  expect(slash.state().open).toBe(true);
  const depth=t.undoDepth();slash.choose(slash.state().items.findIndex(item=>item.id==="page-break"));
  expect(t.dispatched.at(-1)!.commands).toEqual([{kind:"delete_text",data:{block:"a",offset:2,length:1}},{kind:"insert_page_break",data:{block:expect.any(String),before:"b"}}]);
  expect(t.undoDepth()).toBe(depth+1);
  expect(t.root().children.map(idOf)).toEqual(["a",expect.any(String),"b"]);expect(textOf(find(t.root(),"a")!.node)).toBe("x ");
 });
 it("maps Backspace/Delete/Enter at section and caption boundaries to the local behaviour",()=>{
  const t=setup([p("a","One"),section(),table(p("cap","")),p("z","End")]),host=document.createElement("div");document.body.append(host);
  const dom=mountSharedEditor(host,{core:t.core,coreOwnership:"borrow",toolbar:[]} as never);mounted.push(()=>{dom.dispose();host.remove();});
  const input=(inputType:string)=>dom.surface.dispatchEvent(new InputEvent("beforeinput",{inputType,bubbles:true,cancelable:true}));
  // Backspace in an empty caption removes it (one step) and selects the table.
  t.select(caret("cap",0));input("deleteContentBackward");
  expect(t.dispatched.at(-1)).toEqual({commands:[{kind:"remove_table_caption",data:{block:"tbl"}}],selectionUpdate:{kind:"set",value:{kind:"node",block:"tbl"}},pendingFormatsUpdate:{kind:"set",value:null}});
  // Enter in an open summary opens a fresh first body paragraph; Delete at its end enters the body.
  t.select(caret("sum",4));input("insertParagraph");
  const enter=t.dispatched.at(-1)!;expect(enter.commands[0]).toMatchObject({kind:"insert_blocks",data:{parent:"sec",before:"body"}});
  expect(t.core.view().selection).toEqual(caret(idOf((enter.commands[0]!.data as {nodes:N[]}).nodes[0]!),0));
  t.select(caret("sum",4));input("deleteContentForward");expect(t.core.view().selection).toEqual(caret(idOf(find(t.root(),"sec")!.node.children[1]!),0));
  // Backspace at the first body start moves to the summary end; at the summary start it unwraps.
  const count=t.dispatched.length;t.select(caret(idOf(find(t.root(),"sec")!.node.children[1]!),0));input("deleteContentBackward");
  expect(t.dispatched.length).toBe(count);expect(t.core.view().selection).toMatchObject({kind:"text",focus:{block:"sum",offset:"4"}});
  t.select(caret("sum",0));input("deleteContentBackward");expect(t.dispatched.at(-1)!.commands).toEqual([{kind:"unwrap_details",data:{wrapper:"sec"}}]);
  expect(find(t.root(),"sum")!.node.type).toBe("breditor/paragraph");
 });
});
