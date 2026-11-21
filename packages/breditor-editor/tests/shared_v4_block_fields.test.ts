import {describe,it,expect,vi} from "vitest";
import {model} from "@breditor/experimental-rich-content/rendering";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {sharedV4BlockFieldControls,sharedListNumberingCommands,encodeSharedSetBookmark,encodeSharedRenameBookmark,parseSharedBookmarkIndex,sharedSelectedOrderedList,sharedBookmarkTarget,sharedSelectedDetails} from "../../breditor-collaboration/src/v4_block_fields.js";
import {sharedV4SliceVersions} from "../../breditor-collaboration/src/protocol.js";
import type {SharedRustOwner,SharedCommand} from "../../breditor-collaboration/src/types.js";
import type {ActionContext} from "../../breditor-collaboration/src/actions.js";

const slices=Object.fromEntries(sharedV4SliceVersions.map(name=>[name,1]));
const v4={abiVersion:1,modelVersion:14,journalVersion:15,richLanguageVersion:4,blockLayoutVersion:1,...slices};
const sliceMethods=["list_numbering_version","text_language_version","image_link_version","details_version","mention_version","table_caption_version","page_break_version","bookmark_version"];
const el=(type:string,block:string,children:unknown[]=[],extra:Record<string,unknown>={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block,...extra},children});
const t=(text:string,formats:unknown[]=[])=>({kind:"text",text,formats});
const doc={format:"breditor/document",formatVersion:2,schema:{name:"test/v4",version:1},schemaFingerprint:"sha256:x",root:{...el("document","root",[
 el("heading","intro",[t("Intro")],{"breditor/level":1,"breditor/bookmark":"intro"}),
 el("paragraph","para",[t("See here")]),
 el("ordered-list","list",[el("list-item","a",[el("paragraph","a-text",[t("alpha")])])],{"breditor/start":3,"breditor/list-style":2}),
 el("details","sec",[el("details-summary","sum",[t("More")]),el("paragraph","body",[t("Body")])],{"breditor/details-open":true}),
]),properties:{"breditor/document-id":"room"}}};
function caret(block:string,start=0,end=start){return {kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}};}
function raw(blockFields=true){
 const view={format:"breditor/shared-rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(doc),selection:null,pendingFormatsJson:null,causalVersion:"v",selectionOutcome:{kind:"preserved"}};
 const owner:Record<string,unknown>={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",...v4}),observe:vi.fn(()=>({view_json:()=>JSON.stringify(view),free:vi.fn()})),
  block_layout_version:()=>"1",block_layout_state_json:vi.fn(()=>"{}"),change_selection_layout:vi.fn(()=>true),rich_language_version:()=>"4",free:vi.fn(),
  dispatch:vi.fn(()=>true),export_frame:vi.fn(()=>""),updates:vi.fn(()=>new Uint8Array())};
 for(const name of sliceMethods)owner[name]=()=>"1";
 if(blockFields){owner["v4_block_fields_version"]=()=>"1";owner["set_details_open"]=vi.fn(()=>true);owner["bookmark_index_json"]=vi.fn(()=>JSON.stringify({bookmarks:[{name:"intro",block:"intro"}],links:[{block:"para",target:"gone"}],brokenLinks:[{block:"para",target:"gone"}]}));}
 return owner;
}
function context(core:SharedRichEditor,selection:unknown):ActionContext{
 const view={format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(doc),selection,pendingFormatsJson:null} as never;
 return {core,model:model(view),revision:core.view().revision,allocate:(kind:string)=>`${kind}-new`};
}
function commands(owner:Record<string,unknown>,call=0):SharedCommand[]{
 const json=(owner["dispatch"] as ReturnType<typeof vi.fn>).mock.calls[call]![1] as string;return (JSON.parse(json) as {commands:SharedCommand[]}).commands;
}

describe("shared V4 block-field commands",()=>{
 it("reports the capability only on complete native V4 owners",()=>{
  const core=new SharedRichEditor(raw() as unknown as SharedRustOwner);
  expect([core.supportsListNumbering(),core.supportsBookmarks(),core.supportsDetails()]).toEqual([true,true,true]);core.dispose();
  const old=new SharedRichEditor(raw(false) as unknown as SharedRustOwner);
  expect([old.supportsListNumbering(),old.supportsBookmarks(),old.supportsDetails()]).toEqual([false,false,false]);
  expect(()=>old.setBookmark({block:"para",name:"x"})).toThrow("block-field commands");expect(()=>old.bookmarkIndex()).toThrow("block-field commands");
  expect(()=>sharedV4BlockFieldControls(old)).toThrow("matching native V4 owner");
  old.dispose();
 });
 it("lowers numbering intent to one group with an optional start change, like the local command",()=>{
  expect(sharedListNumberingCommands({list:"l",style:"upper-roman"})).toEqual([{kind:"set_list_numbering",data:{list:"l",style:{set:"upper-roman"},reversed:null}}]);
  expect(sharedListNumberingCommands({list:"l",style:null,reversed:false})).toEqual([{kind:"set_list_numbering",data:{list:"l",style:"clear",reversed:false}}]);
  expect(sharedListNumberingCommands({list:"l",reversed:true,start:9})).toEqual([{kind:"set_list_kind",data:{container:"l",style:{kind:"ordered",start:9}}},{kind:"set_list_numbering",data:{list:"l",style:"keep",reversed:true}}]);
  expect(sharedListNumberingCommands({list:"l",start:2})).toEqual([{kind:"set_list_kind",data:{container:"l",style:{kind:"ordered",start:2}}}]);
  for(const bad of [{list:"l"},{list:"l",style:"disc"},{list:"l",reversed:"yes"},{list:"l",start:0},{list:"l",start:Number.NaN},{list:"l",start:2**31},{list:1,style:null},{list:"l",style:null,extra:1},Object.create({list:"l"}),null,[]])expect(()=>sharedListNumberingCommands(bad)).toThrow(TypeError);
 });
 it("snapshots bookmark intent to primitives and parses the native index strictly",()=>{
  expect(encodeSharedSetBookmark({block:"b",name:null})).toEqual({kind:"set_bookmark",data:{block:"b",name:null}});
  expect(encodeSharedRenameBookmark({from:"a",to:"b"})).toEqual({kind:"rename_bookmark",data:{from:"a",to:"b"}});
  for(const bad of [{block:"b"},{block:"b",name:1},{block:"b",name:"x",more:1}])expect(()=>encodeSharedSetBookmark(bad)).toThrow(TypeError);
  for(const bad of [{from:"a"},{from:"a",to:{toString:()=>"b"}}])expect(()=>encodeSharedRenameBookmark(bad)).toThrow(TypeError);
  expect(()=>parseSharedBookmarkIndex(JSON.stringify({bookmarks:[{name:1,block:"b"}],links:[],brokenLinks:[]}))).toThrow("bookmark index");
  const index=parseSharedBookmarkIndex(JSON.stringify({bookmarks:[],links:[{block:"p",target:"x"}],brokenLinks:[{block:"p",target:"x"}]}));
  expect(Object.isFrozen(index.links[0])).toBe(true);
 });
 it("dispatches native commands through the guarded owner, one group per call",()=>{
  const owner=raw(),core=new SharedRichEditor(owner as unknown as SharedRustOwner);
  core.setListNumbering({list:"list",style:"lower-roman",start:5});expect(commands(owner)).toEqual(sharedListNumberingCommands({list:"list",style:"lower-roman",start:5}));
  core.setBookmark({block:"para",name:"here"});expect(commands(owner,1)).toEqual([{kind:"set_bookmark",data:{block:"para",name:"here"}}]);
  core.renameBookmark({from:"intro",to:"start"});expect(commands(owner,2)).toEqual([{kind:"rename_bookmark",data:{from:"intro",to:"start"}}]);
  core.setDetailsOpen("sec",false);expect((owner["set_details_open"] as ReturnType<typeof vi.fn>).mock.calls[0]!.slice(1)).toEqual(["sec",false]);
  expect(()=>core.setDetailsOpen("sec","no" as unknown as boolean)).toThrow(TypeError);
  expect(core.bookmarkIndex().brokenLinks).toEqual([{block:"para",target:"gone"}]);
  expect(()=>core.setBookmark({block:"para",name:"x"},"stale")).toThrow();
  core.dispose();
 });
 it("adds owner-bound V4 controls that target the local V4 nodes and send only changes",()=>{
  const owner=raw(),core=new SharedRichEditor(owner as unknown as SharedRustOwner);
  const toolbar=sharedV4BlockFieldControls(core),ids=toolbar.map(c=>c.id);
  for(const id of ["list-numbering","bookmark","remove-bookmark","link-bookmark","details-open"])expect(ids).toContain(id);
  const control=(id:string)=>toolbar.find(c=>c.id===id)!;
  const inList=context(core,caret("a-text",1));
  expect(sharedSelectedOrderedList(inList.model as never)?.properties["breditor/block-id"]).toBe("list");
  expect(control("list-numbering").read!(inList)).toEqual({kind:"uniform",values:{style:"lower-alpha",order:"ascending",start:"3"}});
  control("list-numbering").run(inList,undefined,{style:"lower-alpha",order:"reversed",start:"3"});
  expect(commands(owner)).toEqual([{kind:"set_list_numbering",data:{list:"list",style:"keep",reversed:true}}]);
  control("list-numbering").run(inList,undefined,{style:"lower-alpha",order:"ascending",start:"3"});expect((owner["dispatch"] as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  expect(control("list-numbering").enabled(context(core,caret("para",0)))).toBe(false);
  // Bookmark: a new name sets, an existing one renames (links follow), duplicates are refused before Rust.
  const inPara=context(core,caret("para",0)),inIntro=context(core,caret("intro",0));
  expect(sharedBookmarkTarget(inPara.model as never)?.type).toBe("breditor/paragraph");
  expect(control("bookmark").read!(inPara)).toEqual({kind:"unset",values:{name:""}});
  control("bookmark").run(inPara,undefined,{name:"here"});expect(commands(owner,1)).toEqual([{kind:"set_bookmark",data:{block:"para",name:"here"}}]);
  control("bookmark").run(inIntro,undefined,{name:"start"});expect(commands(owner,2)).toEqual([{kind:"rename_bookmark",data:{from:"intro",to:"start"}}]);
  expect(()=>control("bookmark").run(inPara,undefined,{name:"intro"})).toThrow("already uses");
  expect(()=>control("bookmark").run(inPara,undefined,{name:"1x"})).toThrow("starts with a letter");
  expect(control("remove-bookmark").enabled(inPara)).toBe(false);control("remove-bookmark").run(inIntro);
  expect(commands(owner,3)).toEqual([{kind:"set_bookmark",data:{block:"intro",name:null}}]);
  expect(control("bookmark").enabled(context(core,caret("sum",0)))).toBe(false);
  // Link to bookmark lists the document's bookmarks and links the selected text.
  const range=context(core,caret("para",0,3));
  expect(control("link-bookmark").read!(range)).toEqual({kind:"unset",values:{target:""},options:{target:[{value:"intro",label:"intro"}]}});
  control("link-bookmark").run(range,undefined,{target:"intro"});
  expect(commands(owner,4)).toEqual([{kind:"set_format",data:{block:"para",offset:0,length:3,format:{type:"breditor-inline/link",properties:{"breditor-inline/href":"#intro","breditor-inline/new-window":false}},enabled:true}}]);
  expect(()=>control("link-bookmark").run(range,undefined,{target:"nope"})).toThrow("existing bookmark");
  // Expand/Collapse section toggles the persisted state of the nearest section.
  const inBody=context(core,caret("body",1));
  expect(sharedSelectedDetails(inBody.model as never)?.type).toBe("breditor/details");
  expect(control("details-open").read!(inBody)).toEqual({kind:"uniform",pressed:true});
  control("details-open").run(inBody);expect((owner["set_details_open"] as ReturnType<typeof vi.fn>).mock.calls[0]!.slice(1)).toEqual(["sec",false]);
  expect(control("details-open").enabled(inPara)).toBe(false);
  const other=new SharedRichEditor(raw() as unknown as SharedRustOwner);
  expect(()=>control("details-open").run({...inBody,core:other})).toThrow("different Rust owner");
  other.dispose();core.dispose();
 });
});
