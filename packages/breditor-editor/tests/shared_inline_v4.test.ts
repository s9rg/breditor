import {afterEach,describe,expect,it,vi} from "vitest";
import {mountSharedEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {sharedInlineControlsV4,mountSharedMentions} from "../../breditor-collaboration/src/inline_v4.js";
import {sharedTextLanguageInput,sharedMentionInput,sharedImageLinkInput} from "../../breditor-collaboration/src/inline_v4_input.js";
import {sharedV4SliceVersions} from "../../breditor-collaboration/src/protocol.js";
import type {SharedRustOwner,RichSelection,SharedDispatch,ActionContext} from "../../breditor-collaboration/src/types.js";
import {mountMentions} from "../src/shared_mentions.js";
import {presentationModel} from "@breditor/experimental-rich-content/rendering";

type Run={kind:"text";text:string;formats:object[]};
type N={kind:"element";type:string;entityId:null;properties:Record<string,unknown>;children:(N|Run)[]};
type Text=Extract<RichSelection,{kind:"text"}>;
const el=(type:string,block:string,children:N["children"]=[],extra:Record<string,unknown>={}):N=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block,...extra},children});
const p=(block:string,value:string)=>el("paragraph",block,value?[{kind:"text",text:value,formats:[]}]:[]);
const caret=(block:string,offset:number):Text=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
const textOf=(node:N)=>node.children.map(child=>child.kind==="text"?child.text:"").join("");
const slices=Object.fromEntries(sharedV4SliceVersions.map(name=>[name,1]));
const sliceMethods=["list_numbering_version","text_language_version","image_link_version","details_version","mention_version","table_caption_version","page_break_version","bookmark_version"];
const language=(tag:string)=>({type:"breditor/text-language",properties:{"breditor/language-tag":tag}});

/**
 * Minimal stand-in for a native shared V4 owner: exact guarded views, one snapshot Undo group per
 * publication and JSON remote frames. Rust admission itself is covered by
 * crates/breditor-collaboration/tests/shared_v4_inline_contracts.rs.
 */
function fakeOwner(children:N[],{inline=true,selection=caret("a",0) as RichSelection|null}={}){
 let root:N={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children},revision=0,current=selection;
 const undo:{root:string;selection:RichSelection|null}[]=[],dispatched:SharedDispatch[]=[],calls:{method:string;input:string}[]=[];
 const find=(node:N,block:string):N|undefined=>{for(const child of node.children){if(child.kind!=="element")continue;if(child.properties["breditor/block-id"]===block)return child;const hit=find(child,block);if(hit)return hit;}return undefined;};
 const need=(block:string)=>{const hit=find(root,block);if(!hit)throw Error(`unknown block ${block}`);return hit;};
 const view=()=>({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),documentJson:JSON.stringify({schema:{name:"test/shared-v4",version:1},schemaFingerprint:"fixture",root}),selection:current,pendingFormatsJson:null,undoDepth:undo.length,redoDepth:0,historyCapacity:1000,grid:null,readOnly:false});
 const publish=(work:()=>void)=>{const saved={root:JSON.stringify(root),selection:current};try{work();}catch(error){root=JSON.parse(saved.root) as N;current=saved.selection;throw error;}undo.push(saved);revision++;return true;};
 const mention=(data:{anchor:{block:string;offset:string};focus:{block:string;offset:string};mention:{kind:string;id:string;label:string}})=>{
  const node=need(data.anchor.block),value=textOf(node),start=Number(data.anchor.offset),end=Number(data.focus.offset),m=data.mention;
  node.children=[{kind:"text",text:value.slice(0,start),formats:[]},{kind:"text",text:`@${m.label}`,formats:[{type:"breditor/mention",properties:{"breditor/mention-id":m.id,"breditor/mention-kind":m.kind,"breditor/mention-label":m.label}}]},{kind:"text",text:` ${value.slice(end)}`,formats:[]}].filter(run=>run.text) as Run[];
 };
 const raw:Record<string,unknown>={
  descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:14,journalVersion:15,richLanguageVersion:4,blockLayoutVersion:1,...slices}),
  observe:()=>{const frozen=JSON.stringify(view());return {view_json:()=>frozen,free:()=>{}};},free:vi.fn(),
  rich_language_version:()=>"4",block_layout_version:()=>"1",block_layout_state_json:vi.fn(()=>JSON.stringify({blocks:"0"})),change_selection_layout:vi.fn(()=>true),
  selection_formatting_version:()=>"1",selection_coverage_json:vi.fn(()=>"{}"),change_selection_formats:vi.fn(()=>true),
  selection_format_state_json:vi.fn((_o:unknown,kind:string)=>JSON.stringify({format:"breditor/rich-selection-format-state",formatVersion:1,kind,state:current?.kind==="text"&&textOf(need(current.focus.block))?{kind:"uniform",format:language("fr-CA")}:{kind:"unset"}})),
  dispatch:vi.fn((_o:unknown,input:string)=>{const request=JSON.parse(input) as SharedDispatch;dispatched.push(request);return publish(()=>{
   for(const command of request.commands){if(command.kind!=="insert_mention")throw Error(`fixture does not implement ${command.kind}`);mention(command.data as never);}
   if(request.selectionUpdate?.kind==="set")current=request.selectionUpdate.value;});}),
  undo_observed:vi.fn(()=>{const previous=undo.pop();if(!previous)return false;root=JSON.parse(previous.root) as N;current=previous.selection;revision++;return true;}),redo_observed:vi.fn(()=>false),
  set_selection:vi.fn((_o:unknown,input:string)=>{current=JSON.parse(input) as RichSelection|null;revision++;return true;}),
  insert_plain_text:vi.fn((_o:unknown,value:string)=>{const s=current as Text,node=need(s.focus.block),offset=Number(s.focus.offset),before=textOf(node);
   undo.push({root:JSON.stringify(root),selection:current});node.children=[{kind:"text",text:before.slice(0,offset)+value+before.slice(offset),formats:[]}];current=caret(s.focus.block,offset+value.length);revision++;return true;}),
  set_pending_formats:vi.fn(),navigate_grid:vi.fn(()=>JSON.stringify({kind:"unchanged"})),copy_clipboard:vi.fn(),
  receive_frame:vi.fn((input:string)=>{const frame=JSON.parse(input) as {block:string;offset:number;text:string};const node=need(frame.block),before=textOf(node);
   node.children=[{kind:"text",text:before.slice(0,frame.offset)+frame.text+before.slice(frame.offset),formats:[]}];const s=current;if(s?.kind==="text"&&s.focus.block===frame.block&&Number(s.focus.offset)>=frame.offset)current=caret(frame.block,Number(s.focus.offset)+frame.text.length);revision++;}),
 };
 for(const name of sliceMethods)raw[name]=()=>"1";
 if(inline){
  raw["inline_commands_v4_version"]=()=>"1";
  for(const method of ["set_text_language","insert_mention","set_image_link"])raw[method]=vi.fn((_o:unknown,input:string)=>{calls.push({method,input});return publish(()=>{});});
 }
 return {raw,dispatched,calls,root:()=>root,undoDepth:()=>undo.length,need};
}

const mounted:(()=>void)[]=[];
afterEach(()=>{for(const release of mounted.splice(0))release();document.body.replaceChildren();vi.restoreAllMocks();});

describe("shared V4 inline command inputs",()=>{
 it("snapshot exactly the local slice intent JSON and refuse anything else",()=>{
  expect(sharedTextLanguageInput("fr-ca")).toBe('{"language":"fr-ca"}');expect(sharedTextLanguageInput(null)).toBe('{"language":null}');
  for(const value of [undefined,1,{toString:()=>"en"}])expect(()=>sharedTextLanguageInput(value)).toThrow(TypeError);
  const target={kind:"text",anchor:{block:"a",offset:"2",affinity:"after"},focus:{block:"a",offset:"5",affinity:"before"}};
  expect(JSON.parse(sharedMentionInput(target,{kind:"user",id:"u-1",label:"Ann"}))).toEqual({selection:target,mention:{kind:"user",id:"u-1",label:"Ann"}});
  for(const [selection,mention] of [[{kind:"node",block:"a"},{kind:"user",id:"u",label:"A"}],[target,{kind:"user",id:"u"}],[target,{kind:"user",id:"u",label:"A",extra:1}],[target,{kind:"user",id:7,label:"A"}],[{...target,anchor:{block:"a",offset:2,affinity:"after"}},{kind:"user",id:"u",label:"A"}]])
   expect(()=>sharedMentionInput(selection,mention)).toThrow(TypeError);
  expect(sharedImageLinkInput({image:"img",href:"https://example.com/",newWindow:true})).toBe('{"image":"img","href":"https://example.com/","newWindow":true}');
  expect(sharedImageLinkInput({image:"img",href:null})).toBe('{"image":"img","href":null}');
  for(const value of [{image:"img",href:null,newWindow:false},{image:"img"},{image:"img",href:"x",extra:1},{image:1,href:null},{image:"img",href:"x",newWindow:"yes"},[]])expect(()=>sharedImageLinkInput(value)).toThrow(TypeError);
 });
});

describe("SharedRichEditor V4 inline commands",()=>{
 it("reports the native capability only for a complete V4 owner and publishes guarded native calls",()=>{
  const t=fakeOwner([p("a","Hello")]),core=new SharedRichEditor(t.raw as unknown as SharedRustOwner);mounted.push(()=>core.dispose());
  expect([core.supportsInlineCommandsV4(),core.supportsTextLanguage(),core.supportsMentions(),core.supportsImageLinks()]).toEqual([true,true,true,true]);
  const revision=core.view().revision;
  expect(core.setTextLanguage("FR-ca",revision)).toBe(true);
  expect(()=>core.setTextLanguage("en",revision)).toThrow();
  expect(core.insertMention(caret("a",5),{kind:"page",id:"p-1",label:"Roadmap"})).toBe(true);
  expect(core.setImageLink({image:"img",href:"https://example.com/",newWindow:true})).toBe(true);
  expect(core.setImageLink({image:"img",href:null})).toBe(true);
  expect(t.calls).toEqual([
   {method:"set_text_language",input:'{"language":"FR-ca"}'},
   {method:"insert_mention",input:JSON.stringify({selection:caret("a",5),mention:{kind:"page",id:"p-1",label:"Roadmap"}})},
   {method:"set_image_link",input:'{"image":"img","href":"https://example.com/","newWindow":true}'},
   {method:"set_image_link",input:'{"image":"img","href":null}'},
  ]);
  expect(()=>core.setImageLink({image:"img",href:null,newWindow:true} as never)).toThrow(TypeError);expect(t.calls).toHaveLength(4);
 });
 it("refuses every inline command on a V4 owner without the native commands",()=>{
  const t=fakeOwner([p("a","Hello")],{inline:false}),core=new SharedRichEditor(t.raw as unknown as SharedRustOwner);mounted.push(()=>core.dispose());
  expect([core.supportsInlineCommandsV4(),core.supportsTextLanguage(),core.supportsMentions(),core.supportsImageLinks()]).toEqual([false,false,false,false]);
  expect(()=>core.setTextLanguage("en")).toThrow(/V4 owner/);expect(()=>core.insertMention(caret("a",0),{kind:"user",id:"u",label:"A"})).toThrow(/V4 owner/);
  expect(()=>core.setImageLink({image:"img",href:null})).toThrow(/V4 owner/);expect(()=>sharedInlineControlsV4(core)).toThrow(/native V4 owner/);
 });
});

describe("shared V4 inline toolbar controls",()=>{
 const image=(block:string,decorative:boolean,link?:string)=>el("image",block,[],{"breditor/image-id":`${block}-id`,"breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/alt-text":decorative?"":"Chart","breditor/decorative":decorative,...(link?{"breditor/image-href":link}:{})});
 function controls(selection:RichSelection){
  const t=fakeOwner([p("a","Hello"),image("fig",false,"https://example.com/a"),image("deco",true)],{selection}),core=new SharedRichEditor(t.raw as unknown as SharedRustOwner);mounted.push(()=>core.dispose());
  const view=core.view(),model=presentationModel({...view,format:"breditor/rich-view"} as never,"original");
  const context={core,model,get revision(){return core.view().revision;},allocate:(kind:string)=>`x:${kind}`} as unknown as ActionContext;
  return {t,core,context,byId:Object.fromEntries(sharedInlineControlsV4(core).map(control=>[control.id,control]))};
 }
 it("are the local V4 language and image-link controls publishing one native command each",()=>{
  const {t,context,byId}=controls({kind:"text",anchor:{block:"a",offset:"0",affinity:"after"},focus:{block:"a",offset:"5",affinity:"after"}});
  expect(Object.keys(byId)).toEqual(["text-language","reset-text-language","image-link","reset-image-link"]);
  expect(byId["text-language"]!.read!(context)).toEqual({kind:"uniform",values:{value:"fr-CA"}});
  expect(byId["text-language"]!.enabled(context)).toBe(true);expect(byId["reset-text-language"]!.enabled(context)).toBe(true);
  expect(()=>byId["text-language"]!.run(context,undefined,{value:"en_US"})).toThrow(/well-formed language tag/);
  byId["text-language"]!.run(context,undefined,{value:" zh-hant-tw "});byId["reset-text-language"]!.run(context);
  expect(t.calls).toEqual([{method:"set_text_language",input:'{"language":"zh-Hant-TW"}'},{method:"set_text_language",input:'{"language":null}'}]);
  // No image is selected: the image controls are unavailable.
  expect(byId["image-link"]!.enabled(context)).toBe(false);expect(byId["image-link"]!.read!(context)).toEqual({kind:"unavailable"});
 });
 it("link the selected image by its image identity and explain the decorative refusal",()=>{
  const linked=controls({kind:"node",block:"fig"});
  expect(linked.byId["image-link"]!.read!(linked.context)).toEqual({kind:"uniform",values:{href:"https://example.com/a",target:"same"}});
  linked.byId["image-link"]!.run(linked.context,undefined,{href:"HTTPS://Example.com/b",target:"new"});
  linked.byId["image-link"]!.run(linked.context,undefined,{href:"https://example.com/a",target:"same"});
  linked.byId["reset-image-link"]!.run(linked.context);
  expect(linked.t.calls).toEqual([{method:"set_image_link",input:'{"image":"fig-id","href":"https://example.com/b","newWindow":true}'},{method:"set_image_link",input:'{"image":"fig-id","href":null}'}]);
  const deco=controls({kind:"node",block:"deco"});
  expect(deco.byId["reset-image-link"]!.enabled(deco.context)).toBe(false);
  expect(()=>deco.byId["image-link"]!.run(deco.context,undefined,{href:"https://example.com/",target:"same"})).toThrow(/decorative image cannot be a link/);
  expect(deco.t.calls).toEqual([]);
 });
});

describe("shared @ mention menu",()=>{
 const people=[{kind:"user" as const,id:"u-ann",label:"Ann Lee"},{kind:"user" as const,id:"u-bo",label:"Bo"},{kind:"page" as const,id:"p-road",label:"Roadmap"}];
 function setup(text:string){
  const t=fakeOwner([p("a",text),p("b","second")],{selection:caret("a",text.length)});
  const core=new SharedRichEditor(t.raw as unknown as SharedRustOwner),host=document.createElement("div");document.body.append(host);
  const dom=mountSharedEditor(host,{core,coreOwnership:"borrow",toolbar:[]} as never);
  const onCancel=vi.fn(),onExecute=vi.fn();
  const mentions=mountSharedMentions(dom,{items:people,onCancel,onExecute,core});
  mounted.push(()=>{mentions.dispose();dom.dispose();core.dispose();host.remove();});
  return {...t,core,dom,mentions,onCancel,onExecute};
 }
 const type=(dom:{surface:HTMLElement},text:string)=>{for(const data of text)dom.surface.dispatchEvent(new InputEvent("beforeinput",{inputType:"insertText",data,bubbles:true,cancelable:true}));};
 it("replaces the typed trigger by one insert_mention command that one Undo reverts",()=>{
  const t=setup("Hi ");type(t.dom,"@an");
  expect(t.mentions.state()).toMatchObject({open:true,trigger:{block:"a",start:3},query:"an"});
  expect(t.mentions.state().items.map(item=>item.label)).toEqual(["Ann Lee"]);
  const typed=JSON.stringify(t.root()),depth=t.undoDepth(),revision=t.dom.view().revision;
  const execution=t.mentions.choose();
  expect(t.dispatched).toEqual([{commands:[{kind:"insert_mention",data:{anchor:{block:"a",offset:"3",affinity:"after"},focus:{block:"a",offset:"6",affinity:"after"},mention:{kind:"user",id:"u-ann",label:"Ann Lee"}}}],selectionUpdate:{kind:"set",value:caret("a",3+1+7+1)}}]);
  expect(execution).toEqual({mention:{kind:"user",id:"u-ann",label:"Ann Lee"},request:t.dispatched[0],revision});
  expect(t.onExecute).toHaveBeenCalledWith(execution);
  expect(textOf(t.need("a"))).toBe("Hi @Ann Lee ");expect(t.undoDepth()).toBe(depth+1);expect(t.mentions.state().open).toBe(false);
  expect(t.dom.surface.querySelector("[data-mention-id=u-ann]")?.textContent).toBe("@Ann Lee");
  t.core.undo();expect(JSON.stringify(t.root())).toBe(typed);
 });
 it("is invalidated by a peer edit at the trigger, not by a disjoint peer edit",async()=>{
  const t=setup("Hi ");type(t.dom,"@a");
  await t.core.receiveFrame(JSON.stringify({block:"b",offset:0,text:"peer "}));
  expect(t.mentions.state()).toMatchObject({open:true,query:"a",trigger:{block:"a",start:3}});
  await t.core.receiveFrame(JSON.stringify({block:"a",offset:0,text:"X"}));
  expect(t.mentions.state()).toMatchObject({open:false,lastCancel:"trigger-invalidated"});expect(t.onCancel).toHaveBeenCalledWith("trigger-invalidated");
  expect(t.dispatched).toEqual([]);
 });
 it("refuses to mount for an owner without native mentions; the SDK helper borrows a session",()=>{
  const t=fakeOwner([p("a","")],{inline:false}),core=new SharedRichEditor(t.raw as unknown as SharedRustOwner),host=document.createElement("div");document.body.append(host);
  const dom=mountSharedEditor(host,{core,coreOwnership:"borrow",toolbar:[]} as never);mounted.push(()=>{dom.dispose();core.dispose();host.remove();});
  expect(()=>mountSharedMentions(dom,{items:people,core})).toThrow(/native mentions/);
  const session={surface:dom.surface,search:()=>dom,view:()=>dom.view(),execute:(r:SharedDispatch,f?:boolean,v?:string)=>dom.execute(r,f,v),focus:()=>dom.focus(),core};
  expect(()=>mountMentions(session as never,{items:people})).toThrow(/native mentions/);
 });
});
