// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {render} from "../src/render.js";
import {presentationModel} from "../src/model.js";
import {restoreNative} from "../src/selection.js";
import {RichDomEditor} from "../src/controller.js";
import {defaultToolbar} from "../src/actions.js";
import {createRichSlashCommands} from "../src/slash_command_items.js";
import {mountRichSlashCommands} from "../src/slash_command_session.js";
import {encodeMentionIntent,groupMentionRuns,isRichMentionId,isRichMentionKind,isRichMentionLabel,mentionOf,requireRichMention} from "../src/mention.js";
import {filterRichMentionSuggestions,mountRichMentions,requireRichMentionSuggestions,type RichMentionOptions,type RichMentionSuggestion} from "../src/mention_session.js";
import {createStandardRichInlinePresentationV1} from "../src/standard_inline_v1.js";
import type {FormatLiteral,RichCommand,RichCoreEditor,RichSelection,RichView,RichWasmModule} from "../src/core.js";
import {compileStandardRichProfileV4} from "../index.js";
import {staticInlineCatalogV4,staticMentionFormatV4,renderStaticDocument} from "../../breditor-editor/src/static_document.js";

const fingerprint=`sha256:${"cd".repeat(32)}`;
const mention=(kind:string,id:string,label:string):FormatLiteral=>({type:"breditor/mention",properties:{"breditor/mention-id":id,"breditor/mention-kind":kind,"breditor/mention-label":label}});
const ann=mention("user","u-1","Ann"),strong:FormatLiteral={type:"breditor/strong",properties:{}};
const run=(text:string,formats:FormatLiteral[]=[])=>({kind:"text",text,formats});
function documentJson(runs:unknown[]){
 const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:runs}]};
 return {format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root};
}
function view(runs:unknown[]):RichView{
 return {format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(documentJson(runs)),readOnly:false,selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:"100",tables:[]} as unknown as RichView;
}
const catalog=JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...staticInlineCatalogV4,staticMentionFormatV4].sort((a,b)=>a.kind<b.kind?-1:1)});
function live(runs:unknown[]):HTMLElement{
 const surface=document.createElement("div");render(surface,presentationModel(view(runs),"original"),{inlinePresentation:createStandardRichInlinePresentationV1(catalog)});return surface;
}

describe("candidate rich V4 mention grammar (mirrors Rust mention.rs)",()=>{
 it("accepts and rejects exactly the Rust domains",()=>{
  for(const kind of ["user","page","tag"])expect(isRichMentionKind(kind)).toBe(true);
  for(const kind of ["","User","users","team"])expect(isRichMentionKind(kind)).toBe(false);
  for(const id of ["a","0","u-1","A.b_c:d-e","a".repeat(128)])expect(isRichMentionId(id)).toBe(true);
  for(const id of ["","-a",".a","a b","a/b","a@b","é","a".repeat(129)])expect(isRichMentionId(id)).toBe(false);
  for(const label of ["Ann","Ann Lee","Zoë","@twice","日本","é".repeat(128),"﻿Ann"])expect(isRichMentionLabel(label)).toBe(true);
  for(const label of [""," Ann","Ann "," Ann","An\nn","An\tn","A\u007F","A\u0085","A ","A ","A‮","A⁧",`${"é".repeat(128)}a`,"A\uD800"])expect(isRichMentionLabel(label)).toBe(false);
  expect(mentionOf(ann)).toEqual({kind:"user",id:"u-1",label:"Ann"});
  expect(mentionOf({...ann,properties:{...ann.properties,"breditor/x":"y"}})).toBeUndefined();
 });
 it("snapshots intent to primitives and rejects anything else before JSON",()=>{
  const selection={kind:"text",anchor:{block:"p",offset:"3",affinity:"after"},focus:{block:"p",offset:"6",affinity:"after"}};
  expect(encodeMentionIntent({selection,mention:{kind:"user",id:"u-1",label:"Ann"}})).toEqual({selection,mention:{kind:"user",id:"u-1",label:"Ann"}});
  for(const bad of [null,[],{selection},{selection,mention:{kind:"user",id:"u-1",label:"Ann"},x:1},{selection:{...selection,kind:"node"},mention:{kind:"user",id:"u",label:"A"}},{selection,mention:{kind:"user",id:"u",label:"A",x:1}},{selection,mention:{kind:"team",id:"u",label:"A"}},{selection,mention:{kind:"user",id:"u",label:{toString:()=>"A"}}}])expect(()=>encodeMentionIntent(bad)).toThrow(TypeError);
  expect(()=>requireRichMention(Object.create({kind:"user",id:"u",label:"A"}))).toThrow(TypeError);
 });
 it("groups whole @label units into chips and refuses partial stretches in strict mode",()=>{
  const runs=[run("Hi "),run("@Ann@A",[ann]),run("nn",[ann,strong]),run("!")];
  const items=groupMentionRuns(runs,(r,text,formats)=>({...r,text,formats}));
  expect(items.map(item=>item.kind==="run"?item.run.text:item.pieces.map(piece=>`${piece.text}${piece.formats.length}`).join("|"))).toEqual(["Hi ","@Ann0","@A0|nn1","!"]);
  expect(()=>groupMentionRuns([run("@An",[ann])],(r,text,formats)=>({...r,text,formats}),true)).toThrow("whole copies");
  expect(groupMentionRuns([run("@An",[ann])],(r,text,formats)=>({...r,text,formats}))[0]!.kind).toBe("run");
 });
});

describe("live mention chips",()=>{
 it("renders an inert non-editable chip with kind/id data and the stored label as text",()=>{
  const surface=live([run("Hi "),run("@A",[ann]),run("nn",[ann,strong]),run(" and "),run("@Plan",[mention("page","p:7","Plan")])]);
  const chips=[...surface.querySelectorAll<HTMLElement>(".breditor-mention")];
  expect(chips.map(chip=>[chip.dataset["mentionKind"],chip.dataset["mentionId"],chip.textContent,chip.getAttribute("contenteditable")])).toEqual([["user","u-1","@Ann","false"],["page","p:7","@Plan","false"]]);
  expect(chips[0]!.querySelector("strong")?.textContent).toBe("nn");
  expect(chips[0]!.querySelector("[data-rich-format='breditor/mention']")).toBeNull();
  expect(chips[0]!.querySelector("a")).toBeNull();
  // Two equal adjacent mentions are two chips.
  expect(live([run("@Ann@Ann",[ann])]).querySelectorAll(".breditor-mention")).toHaveLength(2);
  // The block's text (selection offsets) is unchanged by the chip.
  expect(surface.querySelector("[data-rich-text]")!.textContent).toBe("Hi @Ann and @Plan");
 });
 it("is identical to the static renderer apart from the editing affordance",()=>{
  const runs=[run("Hi "),run("@A",[ann]),run("nn",[ann,strong]),run(" x")];
  const surface=live(runs);for(const chip of surface.querySelectorAll(".breditor-mention"))chip.removeAttribute("contenteditable");
  const host=document.createElement("div");host.innerHTML=renderStaticDocument(documentJson(runs),{fragment:true});
  expect(host.querySelector("p")!.innerHTML).toBe(surface.querySelector("p")!.innerHTML);
  expect(host.querySelector(".breditor-mention")!.outerHTML).toBe('<span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">@A<strong data-rich-format="breditor/strong">nn</strong></span>');
 });
 it("places restored carets beside a chip, never inside it",()=>{
  const surface=live([run("@Ann",[ann]),run(" x")]);document.body.append(surface);
  const caret=(offset:string):RichSelection=>({kind:"text",anchor:{block:"p",offset,affinity:"after"},focus:{block:"p",offset,affinity:"after"}});
  const paragraph=surface.querySelector("p")!,chip=surface.querySelector(".breditor-mention")!;
  restoreNative(surface,caret("0"));let native=document.getSelection()!;expect([native.anchorNode,native.anchorOffset]).toEqual([paragraph,0]);
  restoreNative(surface,caret("4"));native=document.getSelection()!;expect(native.anchorNode).toBe(paragraph);expect(paragraph.childNodes[native.anchorOffset-1]).toBe(chip);
  surface.remove();
 });
});

describe("explicit V4 Wasm factory boundary for mentions",()=>{
 function local(descriptor:Record<string,unknown>,capability:unknown="1"){
  const observation={revision:"1",blockLayoutStateJson:vi.fn(),free:vi.fn()};
  const editor={observe:()=>observation,blockLayoutVersion:()=>"1",listNumberingVersion:()=>"1",textLanguageVersion:()=>"1",imageLinkVersion:()=>"1",detailsVersion:()=>"1",mentionVersion:()=>capability,tableCaptionVersion:()=>"1",pageBreakVersion:()=>"1",bookmarkVersion:()=>"1",execute:vi.fn(()=>({status:"content",takeObservation:()=>observation,free:vi.fn()})),free:vi.fn()};
  const raw={descriptorJson:()=>({status:"value",takeValue:()=>JSON.stringify({kind:"rich",abiVersion:1,schema:{name:"t",version:1},schemaFingerprint:fingerprint,...descriptor}),free:vi.fn()}),createEditor:()=>({status:"editor",takeEditor:()=>editor,free:vi.fn()}),free:vi.fn()};
  const factory=vi.fn(()=>({status:"profile",takeProfile:()=>raw,free:vi.fn()}));
  return {wasm:{BreditorRichProfile:{fromBootstrapJsonV4:factory,fromStandardBootstrapJsonV4:factory}} as unknown as RichWasmModule,raw,editor};
 }
 const v4={richLanguageVersion:4,taskStructureVersion:1,blockLayoutVersion:1,listNumberingVersion:1,textLanguageVersion:1,imageLinkVersion:1,detailsVersion:1,mentionVersion:1,tableCaptionVersion:1,pageBreakVersion:1,bookmarkVersion:1};
 it("requires mentionVersion 1 in the descriptor and on the owner, and snapshots insertMention",()=>{
  const a=local(v4),profile=compileStandardRichProfileV4(a.wasm,"bootstrap"),core=profile.createEditor("document");
  expect(core.supportsMentions?.()).toBe(true);
  const selection={kind:"text" as const,anchor:{block:"p",offset:"0",affinity:"after" as const},focus:{block:"p",offset:"1",affinity:"after" as const}};
  core.execute({kind:"insertMention",data:{selection,mention:{kind:"user",id:"u-1",label:"Ann"}}});
  expect(JSON.parse(a.editor.execute.mock.calls[0]![1] as string)).toEqual({kind:"insertMention",data:{selection,mention:{kind:"user",id:"u-1",label:"Ann"}}});
  expect(()=>core.execute({kind:"insertMention",data:{selection,mention:{kind:"user",id:"u 1",label:"Ann"}}})).toThrow(TypeError);
  for(const bad of [{...v4,mentionVersion:undefined},{...v4,mentionVersion:2}]){const b=local(bad);expect(()=>compileStandardRichProfileV4(b.wasm,"bootstrap")).toThrow("V4 profile");expect(b.raw.free).toHaveBeenCalledOnce();}
  for(const capability of ["0",null]){const c=local(v4,capability),pr=compileStandardRichProfileV4(c.wasm,"bootstrap");expect(()=>pr.createEditor("document")).toThrow("mention");expect(c.editor.free).toHaveBeenCalledOnce();pr.dispose();}
 });
});

interface Block {id:string;text:string}
type Text=Extract<RichSelection,{kind:"text"}>;
const caret=(block:string,offset:number):Text=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
/** Native-owner stand-in: exact revision guard, snapshot history, one history step per insertMention. */
function fakeCore(initial:readonly Block[],options:{readOnly?:boolean}={}){
 let blocks=initial.map(block=>({...block,mentions:[] as {start:number;end:number}[]})),selection:RichSelection|null=caret(initial[0]!.id,initial[0]!.text.length),revision=1;
 const undo:{blocks:typeof blocks;selection:RichSelection|null}[]=[],log:RichCommand[]=[];
 const element=(block:typeof blocks[number])=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":block.id},children:block.text?[{kind:"text",text:block.text,formats:[]}]:[]});
 const view=():RichView=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson:JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/mention",version:1},schemaFingerprint:"fixture",root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/block-id":"root"},children:blocks.map(element)}}),selection,pendingFormatsJson:null,undoDepth:undo.length,redoDepth:0,historyCapacity:100,grid:null,tables:[],...(options.readOnly?{readOnly:true as const}:{})} as unknown as RichView);
 const find=(id:string)=>{const block=blocks.find(value=>value.id===id);if(!block)throw Error(`unknown block ${id}`);return block;};
 const edit=(work:()=>void)=>{undo.push({blocks:blocks.map(block=>({...block,mentions:[...block.mentions]})),selection});work();revision++;return "content" as const;};
 const replace=(range:Text,text:string)=>edit(()=>{const block=find(range.anchor.block);const a=Number(range.anchor.offset),f=Number(range.focus.offset),start=Math.min(a,f),end=Math.max(a,f);block.text=block.text.slice(0,start)+text+block.text.slice(end);selection=caret(block.id,start+text.length);});
 const core={
  view,supportsGeneralRanges:()=>false,supportsMentions:()=>true,
  execute:vi.fn((command:RichCommand,expected?:string)=>{
   if(expected!==undefined&&expected!==String(revision))throw Error("stale publication");
   if(options.readOnly&&command.kind!=="setSelection")throw Error("read-only");
   log.push(command);
   switch(command.kind){
    case "setSelection":selection=command.selection;revision++;return "selection";
    case "insertPlainText":return replace(selection as Text,command.text);
    case "replaceTextRange":return replace(command.data.selection,command.data.text);
    case "insertMention":{const {selection:range,mention}=command.data;return replace(range,`@${mention.label} `);}
    case "undo":{const previous=undo.pop();if(!previous)return "unchanged";blocks=previous.blocks;selection=previous.selection;revision++;return "undo";}
    default:throw Error(`fixture does not implement ${command.kind}`);
   }
  }),
  dispose:vi.fn(),
 } as unknown as RichCoreEditor;
 return {core,log,blocks:()=>blocks};
}
const people:readonly RichMentionSuggestion[]=[{kind:"user",id:"u-1",label:"Ann Lee",description:"ann@example.com"},{kind:"user",id:"u-2",label:"Andrew"},{kind:"page",id:"p-1",label:"Annual plan"},{kind:"tag",id:"t-1",label:"Bug"}];
const mounted:(()=>void)[]=[];
afterEach(()=>{for(const release of mounted.splice(0))release();document.body.replaceChildren();});
function setup(text="",options:Partial<RichMentionOptions>&{readOnly?:boolean}={}){
 const native=fakeCore([{id:"a",text},{id:"b",text:"second"}],options);
 const host=document.createElement("div");document.body.append(host);
 const dom=new RichDomEditor(host,{core:native.core,toolbar:[]});
 const onCancel=vi.fn(),onError=vi.fn(),onExecute=vi.fn();
 const mentions=mountRichMentions(dom,{items:people,onCancel,onError,onExecute,...options});
 mounted.push(()=>{mentions.dispose();if(dom.searchState().closed===false)dom.dispose();host.remove();});
 return {...native,dom,mentions,onCancel,onError,onExecute};
}
function type(dom:RichDomEditor,text:string):void{for(const data of text)dom.surface.dispatchEvent(new InputEvent("beforeinput",{inputType:"insertText",data,bubbles:true,cancelable:true}));}
function key(dom:RichDomEditor,name:string):KeyboardEvent{const event=new KeyboardEvent("keydown",{key:name,bubbles:true,cancelable:true});dom.surface.dispatchEvent(event);return event;}
const menu=()=>document.querySelector<HTMLElement>("[data-breditor-mention]")!;

describe("@ mention suggestion session",()=>{
 it("opens on @ with an accessible listbox and inserts through one native command and one Undo step",()=>{
  const t=setup("Hi ");type(t.dom,"@an");
  const state=t.mentions.state();expect(state.open).toBe(true);expect(state.trigger).toEqual({block:"a",start:3});expect(state.query).toBe("an");
  expect(state.items.map(item=>item.label)).toEqual(["Ann Lee","Andrew","Annual plan"]);expect(state.items[0]!.id).toBe("user:u-1");
  const list=menu().querySelector("[role=listbox]")!;expect(list.getAttribute("aria-label")).toBe("Mentions");
  expect(t.dom.surface.getAttribute("aria-controls")).toBe(list.id);expect(t.dom.surface.getAttribute("aria-activedescendant")).toBe(list.querySelector("[role=option]")!.id);
  expect(menu().querySelector("[role=status]")!.textContent).toBe("3 suggestions available");
  key(t.dom,"ArrowDown");const before=t.log.length;expect(key(t.dom,"Enter").defaultPrevented).toBe(true);
  expect(t.log.slice(before)).toEqual([{kind:"insertMention",data:{selection:{kind:"text",anchor:{block:"a",offset:"3",affinity:"after"},focus:{block:"a",offset:"6",affinity:"after"}},mention:{kind:"user",id:"u-2",label:"Andrew"}}}]);
  expect(t.onExecute).toHaveBeenCalledWith({mention:{kind:"user",id:"u-2",label:"Andrew"},outcome:"content"});
  expect(t.blocks()[0]!.text).toBe("Hi @Andrew ");expect(t.mentions.state().open).toBe(false);expect(t.dom.surface.hasAttribute("aria-controls")).toBe(false);
  // Exactly one Undo restores the typed trigger.
  t.dom.execute({kind:"undo"});expect(t.blocks()[0]!.text).toBe("Hi @an");
 });
 it("aborts superseded async provider requests and rejects stale results",async()=>{
  const pending:{query:string;signal:AbortSignal;resolve:(items:readonly RichMentionSuggestion[])=>void}[]=[];
  const t=setup("",{items:(query,request)=>new Promise(resolve=>{pending.push({query,signal:request.signal,resolve});})});
  type(t.dom,"@a");expect(t.mentions.state().loading).toBe(true);expect(menu().querySelector("[role=status]")!.textContent).toBe("Loading suggestions…");
  expect(pending.map(entry=>entry.query)).toEqual(["","a"]);expect(pending[0]!.signal.aborted).toBe(true);
  expect(()=>key(t.dom,"Enter")).not.toThrow();expect(t.log.some(command=>command.kind==="insertMention")).toBe(false);
  pending[1]!.resolve(filterRichMentionSuggestions(people,"a"));pending[0]!.resolve([{kind:"tag",id:"stale",label:"Stale"}]);await Promise.resolve();await Promise.resolve();
  expect(t.mentions.state().items.map(item=>item.id)).toEqual(["user:u-1","user:u-2","page:p-1"]);
  type(t.dom,"x");const last=pending.at(-1)!;key(t.dom,"Escape");expect(last.signal.aborted).toBe(true);expect(t.onCancel).toHaveBeenCalledWith("dismissed");
  last.resolve(people);await Promise.resolve();expect(t.mentions.state().open).toBe(false);expect(t.blocks()[0]!.text).toBe("@ax");
 });
 it("validates provider output and ends on whitespace, a second @ or read-only views",async()=>{
  const onError=vi.fn();let t=setup("",{onError,items:()=>[{kind:"team",id:"x",label:"X"}] as never});type(t.dom,"@");
  expect(onError).toHaveBeenCalled();expect(()=>requireRichMentionSuggestions([{kind:"user",id:"u",label:"A"},{kind:"user",id:"u",label:"B"}])).toThrow("Duplicate");
  t=setup();type(t.dom,"@an ");expect(t.mentions.state().lastCancel).toBe("query-ended");
  t=setup();type(t.dom,"@a@");expect(t.mentions.state().lastCancel).toBe("query-ended");
  t=setup("a");type(t.dom,"@");expect(t.mentions.state().open).toBe(false);
  t=setup("",{readOnly:true});t.dom.surface.dispatchEvent(new InputEvent("beforeinput",{inputType:"insertText",data:"@",bubbles:true,cancelable:true}));expect(t.mentions.state().open).toBe(false);
  expect(()=>mountRichMentions(t.dom,{items:[]})).toThrow("already has mentions");
  expect(()=>mountRichMentions(t.dom,{items:[],core:{supportsMentions:()=>false} as unknown as RichCoreEditor})).toThrow("rich V4 owner");
 });
 it("coexists with slash commands on one surface without changing them",()=>{
  const t=setup();const slash=mountRichSlashCommands(t.dom,{items:createRichSlashCommands(defaultToolbar)});mounted.push(()=>slash.dispose());
  type(t.dom,"@");expect(t.mentions.state().open).toBe(true);expect(slash.state().open).toBe(false);key(t.dom,"Escape");
  type(t.dom," /");expect(slash.state().open).toBe(true);expect(t.mentions.state().open).toBe(false);
  expect(document.querySelector("[data-breditor-slash] [role=listbox]")!.getAttribute("aria-label")).toBe("Commands");
 });
});
