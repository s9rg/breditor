import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {defaultToolbar} from "../../breditor-experimental-rich-content/src/actions.js";
import {createRichSlashCommands,filterRichSlashItems,type RichSlashItem} from "../../breditor-experimental-rich-content/src/slash_command_items.js";
import {mountRichSlashCommands,type RichSlashCommandOptions,type RichSlashCommands} from "../../breditor-experimental-rich-content/src/slash_command_session.js";
import type {RichCommand,RichCoreEditor,RichSelection,RichView} from "../../breditor-experimental-rich-content/src/core.js";

interface Block {id:string;type:"paragraph"|"heading";level:number|null;text:string}
type Text=Extract<RichSelection,{kind:"text"}>;
const caret=(block:string,offset:number):Text=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
/** Minimal stand-in for the native owner: exact revision guard, snapshot history and a command log. */
/** `composite`: the owner also runs `replaceTriggerThen` as one snapshot-history step, refusing atomically. */
function fakeCore(initial:readonly Block[],options:{general?:boolean;readOnly?:boolean;composite?:boolean}={}){
 let blocks=initial.map(block=>({...block})),selection:RichSelection|null=caret(initial[0]!.id,initial[0]!.text.length),revision=1;
 const undo:{blocks:Block[];selection:RichSelection|null}[]=[],log:RichCommand[]=[];
 const element=(block:Block)=>({kind:"element",type:`breditor/${block.type}`,entityId:null,properties:{"breditor/block-id":block.id,...(block.type==="heading"?{"breditor/level":block.level}:{})},children:block.text?[{kind:"text",text:block.text,formats:[]}]:[]});
 const view=():RichView=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson:JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/slash",version:1},schemaFingerprint:"fixture",root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/block-id":"root"},children:blocks.map(element)}}),selection,pendingFormatsJson:null,undoDepth:undo.length,redoDepth:0,historyCapacity:100,grid:null,tables:[],...(options.general?{rangeEditing:"general-v1" as const}:{}),...(options.readOnly?{readOnly:true as const}:{})});
 const find=(id:string)=>{const block=blocks.find(value=>value.id===id);if(!block)throw Error(`unknown block ${id}`);return block;};
 const edit=(work:()=>void)=>{undo.push({blocks:blocks.map(block=>({...block})),selection});work();revision++;return "content" as const;};
 const replace=(range:Text,text:string)=>edit(()=>{const block=find(range.anchor.block);if(range.focus.block!==block.id)throw Error("cross-block");const a=Number(range.anchor.offset),f=Number(range.focus.offset),start=Math.min(a,f),end=Math.max(a,f);block.text=block.text.slice(0,start)+text+block.text.slice(end);selection=caret(block.id,start+text.length);});
 const composite=(command:Extract<RichCommand,{kind:"replaceTriggerThen"}>)=>{
  if(!["setHeading","wrapList"].includes(command.data.command.kind))throw Error(`fixture does not compose ${command.data.command.kind}`);
  const saved={blocks:blocks.map(block=>({...block})),selection},depth=undo.length,observed=revision;
  try{replace(command.data.selection,"");run(command.data.command);}catch(error){blocks=saved.blocks;selection=saved.selection;undo.length=depth;revision=observed;throw error;}
  undo.length=depth;undo.push(saved);revision=Number(revision)-1;return "content" as const;
 };
 const run=(command:RichCommand):ReturnType<RichCoreEditor["execute"]>=>{
   switch(command.kind){
    case "setSelection":selection=command.selection;revision++;return "selection";
    case "insertPlainText":{const s=selection as Text;return replace(s,command.text);}
    case "replaceTextRange":case "replaceGeneralRangePlainText":return replace(command.data.selection,command.data.text);
    case "setHeading":return edit(()=>{const block=find(command.block);block.type=command.level===null?"paragraph":"heading";block.level=command.level;});
    case "wrapList":return edit(()=>{});
    case "replaceTriggerThen":if(!options.composite)throw Error("fixture does not implement replaceTriggerThen");return composite(command);
    case "undo":{const previous=undo.pop();if(!previous)return "unchanged";blocks=previous.blocks;selection=previous.selection;revision++;return "undo";}
    default:throw Error(`fixture does not implement ${command.kind}`);
   }
 };
 const core={
  view,supportsGeneralRanges:()=>options.general===true,...(options.composite?{supportsTriggerComposite:()=>true}:{}),
  execute:vi.fn((command:RichCommand,expected?:string)=>{
   if(expected!==undefined&&expected!==String(revision))throw Error("stale publication");
   if(options.readOnly&&command.kind!=="setSelection")throw Error("read-only");
   log.push(command);
   return run(command);
  }),
  dispose:vi.fn(),
 } as unknown as RichCoreEditor;
 return {core,log,blocks:()=>blocks,select:(s:RichSelection)=>{selection=s;}};
}
function setup(text="",options:{general?:boolean;readOnly?:boolean;composite?:boolean;items?:RichSlashCommandOptions["items"];onCancel?:RichSlashCommandOptions["onCancel"];onError?:RichSlashCommandOptions["onError"]}={}){
 const native=fakeCore([{id:"a",type:"paragraph",level:null,text},{id:"b",type:"paragraph",level:null,text:"second"}],options);
 const host=document.createElement("div");document.body.append(host);
 const dom=new RichDomEditor(host,{core:native.core,toolbar:[],...(options.general?{rangeEditing:"general-v1" as const}:{})});
 const onCancel=options.onCancel??vi.fn(),onError=options.onError??vi.fn(),onExecute=vi.fn();
 const slash=mountRichSlashCommands(dom,{items:options.items??createRichSlashCommands(defaultToolbar),onCancel,onError,onExecute});
 mounted.push(()=>{slash.dispose();if(dom.searchState().closed===false)dom.dispose();host.remove();});
 return {...native,dom,slash,onCancel,onError,onExecute};
}
const mounted:(()=>void)[]=[];
afterEach(()=>{for(const release of mounted.splice(0))release();document.body.replaceChildren();});
function type(dom:RichDomEditor,text:string):void{for(const data of text)dom.surface.dispatchEvent(new InputEvent("beforeinput",{inputType:"insertText",data,bubbles:true,cancelable:true}));}
function key(dom:RichDomEditor,name:string):KeyboardEvent{const event=new KeyboardEvent("keydown",{key:name,bubbles:true,cancelable:true});dom.surface.dispatchEvent(event);return event;}
const menu=()=>document.querySelector<HTMLElement>("[data-breditor-slash]")!;
const labels=(slash:RichSlashCommands)=>slash.state().items.map(item=>item.label);

describe("slash-command session",()=>{
 it("opens on a typed slash at a block start with an accessible listbox while focus stays in the editor",()=>{
  const t=setup();type(t.dom,"/");
  const state=t.slash.state();expect(state.open).toBe(true);expect(state.trigger).toEqual({block:"a",start:0});expect(state.query).toBe("");
  expect(labels(t.slash)).toEqual(["Text","Heading 1","Heading 2","Heading 3","Bullet list","Numbered list","Table"]);
  const list=menu().querySelector("[role=listbox]")!;expect(menu().hidden).toBe(false);expect(menu().contains(t.dom.surface)).toBe(false);
  expect(t.dom.surface.getAttribute("aria-controls")).toBe(list.id);expect(t.dom.surface.getAttribute("aria-expanded")).toBe("true");expect(t.dom.surface.getAttribute("aria-autocomplete")).toBe("list");
  const options=[...list.querySelectorAll("[role=option]")];expect(options).toHaveLength(7);expect(options[0]!.getAttribute("aria-selected")).toBe("true");
  expect(t.dom.surface.getAttribute("aria-activedescendant")).toBe(options[0]!.id);
  expect(menu().querySelector("[role=status]")!.textContent).toBe("7 commands available");
 });
 it("filters from the Rust-read query, moves with arrows and runs the existing command after removing the trigger",()=>{
  const t=setup("Intro ");type(t.dom,"/hea");
  expect(t.slash.state().query).toBe("hea");expect(labels(t.slash)).toEqual(["Heading 1","Heading 2","Heading 3"]);
  const down=key(t.dom,"ArrowDown");expect(down.defaultPrevented).toBe(true);expect(t.slash.state().active).toBe(1);
  key(t.dom,"ArrowUp");key(t.dom,"ArrowUp");expect(t.slash.state().active).toBe(2);
  expect(t.dom.surface.getAttribute("aria-activedescendant")).toMatch(/-option-2$/);
  const before=t.log.length,enter=key(t.dom,"Enter");expect(enter.defaultPrevented).toBe(true);
  expect(t.log.slice(before)).toEqual([{kind:"replaceTextRange",data:{selection:{kind:"text",anchor:{block:"a",offset:"6",affinity:"after"},focus:{block:"a",offset:"10",affinity:"after"}},text:""}},{kind:"setHeading",block:"a",level:3}]);
  expect(t.blocks()[0]).toMatchObject({type:"heading",level:3,text:"Intro "});
  expect(t.onExecute).toHaveBeenCalledWith({item:"heading-3",removal:"content",outcome:"content",composite:false});
  expect(t.slash.state().open).toBe(false);expect(menu().hidden).toBe(true);expect(t.dom.surface.hasAttribute("aria-controls")).toBe(false);expect(t.dom.surface.hasAttribute("aria-activedescendant")).toBe(false);
  // Fallback for an owner without the native composite: two history steps, the command, then the trigger removal.
  t.dom.execute({kind:"undo"});expect(t.blocks()[0]).toMatchObject({type:"paragraph",text:"Intro "});
  t.dom.execute({kind:"undo"});expect(t.blocks()[0]!.text).toBe("Intro /hea");
 });
 it("uses general-range removal when the Rust view declares general-v1 routing",()=>{
  const t=setup("",{general:true});type(t.dom,"/bul");
  t.slash.choose();const removal=t.log.find(command=>command.kind==="replaceGeneralRangePlainText"&&command.data.text==="");
  expect(removal).toMatchObject({data:{selection:{anchor:{block:"a",offset:"0"},focus:{block:"a",offset:"4"}}}});expect(t.log.at(-1)!.kind).toBe("wrapList");
 });
 it("clicking an option chooses it without moving focus",()=>{
  const t=setup();type(t.dom,"/");const option=menu().querySelectorAll<HTMLElement>("[role=option]")[1]!;
  const down=new MouseEvent("mousedown",{bubbles:true,cancelable:true});option.dispatchEvent(down);expect(down.defaultPrevented).toBe(true);
  option.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));expect(t.blocks()[0]).toMatchObject({type:"heading",level:1,text:""});
 });
 it("only opens at a start or after whitespace and never for remote/programmatic publications",()=>{
  const t=setup("a");type(t.dom,"/");expect(t.slash.state().open).toBe(false);
  t.dom.execute({kind:"insertPlainText",text:" /"});expect(t.slash.state().open).toBe(false);
  type(t.dom,"/");expect(t.slash.state().open).toBe(false);// query would contain a second slash
  type(t.dom," /");expect(t.slash.state().open).toBe(true);expect(t.slash.state().trigger).toEqual({block:"a",start:6});
 });
 it("Escape dismisses, keeps the typed text and does not reopen for the same trigger",()=>{
  const t=setup();type(t.dom,"/he");const escape=key(t.dom,"Escape");expect(escape.defaultPrevented).toBe(true);
  expect(t.onCancel).toHaveBeenCalledWith("dismissed");expect(t.blocks()[0]!.text).toBe("/he");type(t.dom,"a");expect(t.slash.state().open).toBe(false);
  const arrow=key(t.dom,"ArrowDown");expect(arrow.defaultPrevented).toBe(false);
 });
 it("ends on whitespace, selection leaving the trigger, invalidating edits, composition, blur and editor disposal",()=>{
  const reasons:string[]=[];const onCancel=(reason:string)=>reasons.push(reason);
  let t=setup("",{onCancel});type(t.dom,"/he ");expect(reasons.pop()).toBe("query-ended");
  t=setup("",{onCancel});type(t.dom,"/he");t.dom.execute({kind:"setSelection",selection:caret("a",0)});expect(reasons.pop()).toBe("selection-left");
  t=setup("",{onCancel});type(t.dom,"/he");t.dom.execute({kind:"setSelection",selection:caret("b",2)});expect(reasons.pop()).toBe("selection-left");
  t=setup("x ",{onCancel});type(t.dom,"/he");t.dom.execute({kind:"replaceTextRange",data:{selection:{kind:"text",anchor:{block:"a",offset:"0",affinity:"after"},focus:{block:"a",offset:"1",affinity:"after"}},text:"yy"}});expect(reasons.pop()).toBe("trigger-invalidated");
  t=setup("",{onCancel});type(t.dom,"/he");t.dom.surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));expect(reasons.pop()).toBe("composition");
  t=setup("",{onCancel});type(t.dom,"/he");t.dom.surface.dispatchEvent(new FocusEvent("focusout",{bubbles:true,relatedTarget:null}));expect(reasons.pop()).toBe("blur");
  t=setup("",{onCancel});type(t.dom,"/he");t.dom.dispose();expect(reasons.pop()).toBe("editor-closed");expect(()=>t.slash.choose()).toThrow("No slash-command session");
  t=setup("",{onCancel});type(t.dom,"/");const menus=document.querySelectorAll("[data-breditor-slash]").length;t.slash.dispose();expect(reasons.pop()).toBe("disposed");expect(t.slash.state().disposed).toBe(true);expect(document.querySelectorAll("[data-breditor-slash]")).toHaveLength(menus-1);
 });
 it("does not open on read-only views",()=>{
  const t=setup("",{readOnly:true});t.dom.surface.dispatchEvent(new InputEvent("beforeinput",{inputType:"insertText",data:"/",bubbles:true,cancelable:true}));expect(t.slash.state().open).toBe(false);
 });
 it("aborts superseded async provider requests and rejects stale results",async()=>{
  const pending:{query:string;signal:AbortSignal;resolve:(items:readonly RichSlashItem[])=>void}[]=[];
  const all=createRichSlashCommands(defaultToolbar);
  const t=setup("",{items:(query,request)=>new Promise(resolve=>{pending.push({query,signal:request.signal,resolve});})});
  type(t.dom,"/h");expect(t.slash.state().loading).toBe(true);expect(menu().querySelector("[role=listbox]")!.getAttribute("aria-busy")).toBe("true");
  expect(pending.map(entry=>entry.query)).toEqual(["","h"]);expect(pending[0]!.signal.aborted).toBe(true);expect(pending[1]!.signal.aborted).toBe(false);
  expect(()=>key(t.dom,"Enter")).not.toThrow();expect(t.log.some(command=>command.kind==="setHeading")).toBe(false);
  pending[1]!.resolve(filterRichSlashItems(all,"h"));pending[0]!.resolve(all);await Promise.resolve();await Promise.resolve();
  expect(t.slash.state().loading).toBe(false);expect(labels(t.slash)).toEqual(["Heading 1","Heading 2","Heading 3","Text"]);
  type(t.dom,"x");const last=pending.at(-1)!;key(t.dom,"Escape");expect(last.signal.aborted).toBe(true);last.resolve(all);await Promise.resolve();expect(t.slash.state().open).toBe(false);
 });
 it("does not call an async provider again when an unrelated publication leaves the query unchanged",async()=>{
  const all=createRichSlashCommands(defaultToolbar),queries:string[]=[];
  const t=setup("",{items:query=>{queries.push(query);return Promise.resolve(filterRichSlashItems(all,query));}});
  type(t.dom,"/h");await Promise.resolve();await Promise.resolve();expect(queries).toEqual(["","h"]);expect(t.slash.state().loading).toBe(false);
  t.dom.execute({kind:"setHeading",block:"b",level:1});
  expect(t.slash.state().open).toBe(true);expect(queries).toEqual(["","h"]);
  type(t.dom,"e");expect(queries).toEqual(["","h","he"]);
 });
 it("runs an allowlisted command as one native replaceTriggerThen when the owner supports it",()=>{
  const t=setup("Intro ",{composite:true});expect(t.dom.supportsTriggerComposite()).toBe(true);type(t.dom,"/hea");
  key(t.dom,"ArrowUp");const before=t.log.length;key(t.dom,"Enter");
  const selection={kind:"text",anchor:{block:"a",offset:"6",affinity:"after"},focus:{block:"a",offset:"10",affinity:"after"}};
  expect(t.log.slice(before)).toEqual([{kind:"replaceTriggerThen",data:{selection,command:{kind:"setHeading",block:"a",level:3}}}]);
  expect(t.blocks()[0]).toMatchObject({type:"heading",level:3,text:"Intro "});
  expect(t.onExecute).toHaveBeenCalledWith({item:"heading-3",removal:"content",outcome:"content",composite:true});
  // One Undo restores the typed `/hea` and the paragraph.
  t.dom.execute({kind:"undo"});expect(t.blocks()[0]).toMatchObject({type:"paragraph",text:"Intro /hea"});
 });
 it("uses the composite under general-v1 routing too",()=>{
  const t=setup("",{general:true,composite:true});type(t.dom,"/bul");t.slash.choose();
  expect(t.log.at(-1)).toMatchObject({kind:"replaceTriggerThen",data:{selection:{anchor:{offset:"0"},focus:{offset:"4"}},command:{kind:"wrapList"}}});
  expect(t.log.some(command=>command.kind==="replaceGeneralRangePlainText"&&command.data.text==="")).toBe(false);
 });
 it("keeps the two-step path for commands outside the native allowlist",()=>{
  const plain:RichSlashItem={id:"stamp",label:"Stamp",enabled:()=>true,command:()=>({kind:"insertPlainText",text:"!"})};
  const t=setup("",{composite:true,items:[plain]});type(t.dom,"/st");
  expect(t.slash.choose()).toEqual({item:"stamp",removal:"content",outcome:"content",composite:false});
  expect(t.log.slice(-2).map(command=>command.kind)).toEqual(["replaceTextRange","insertPlainText"]);expect(t.blocks()[0]!.text).toBe("!");
 });
 it("a natively refused composite publishes nothing and keeps the typed trigger",()=>{
  const onError=vi.fn(),bad:RichSlashItem={id:"bad",label:"Bad heading",enabled:()=>true,command:()=>({kind:"setHeading",block:"missing",level:1})};
  const t=setup("",{composite:true,onError,items:[bad]});type(t.dom,"/b");const revision=t.dom.view().revision;
  expect(()=>t.slash.choose()).toThrow("unknown block missing");
  expect(t.blocks()[0]).toMatchObject({type:"paragraph",text:"/b"});expect(t.dom.view().revision).toBe(revision);expect(t.dom.view().undoDepth).toBe(2);
  key(t.dom,"Escape");type(t.dom,"x");expect(t.blocks()[0]!.text).toBe("/bx");
 });
 it("reports provider failures and inapplicable commands without DOM fallbacks",async()=>{
  const onError=vi.fn();let t=setup("",{onError,items:()=>Promise.reject(Error("offline"))});type(t.dom,"/");await Promise.resolve();await Promise.resolve();
  expect(onError).toHaveBeenCalledWith(Error("offline"));expect(menu().querySelector("[role=status]")!.textContent).toBe("offline");
  const empty:RichSlashItem={id:"noop",label:"Nothing",enabled:()=>true,command:()=>null};
  onError.mockClear();t=setup("",{onError,items:[empty]});type(t.dom,"/");expect(t.slash.choose()).toEqual({item:"noop",removal:"content",outcome:null,composite:false});
  expect(t.blocks()[0]!.text).toBe("");expect(onError.mock.calls[0]![0].message).toContain("no longer applicable");
  expect(()=>mountRichSlashCommands(t.dom,{items:[]})).toThrow("already has slash commands");
  expect(()=>createRichSlashCommands(defaultToolbar,[{id:"x",control:"heading"},{id:"x",control:"bullet"}])).toThrow("Duplicate");
 });
});
