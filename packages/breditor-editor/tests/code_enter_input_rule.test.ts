import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {RichCoreEditor,RichView,RichSelection} from "../../breditor-experimental-rich-content/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";

// markdown-v1 code Enter routing (synthetic events, not browser acceptance): a collapsed code
// caret sends "\n" through the exclusive plain call; everything else keeps the hard break.
const element=(type:string,block:string,text:string)=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block},children:[{kind:"text",text,formats:[]}]});
const source=JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/dom",version:1},schemaFingerprint:"native fixture",root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/block-id":"root"},children:[element("code-block","c","x\n\n"),element("paragraph","p","text")]}});
const caret=(block:string,offset:string,end=offset):RichSelection=>({kind:"text",anchor:{block,offset,affinity:"after"},focus:{block,offset:end,affinity:"after"}});
function fixture(mode:"local"|"shared",selection:RichSelection,rules:boolean,outcome:"applied"|"refused"="applied"){
 let revision=1;const calls:unknown[][]=[],refusals:unknown[]=[];
 const view=()=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson:source,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[],richLanguageVersion:2} as RichView);
 const host=document.createElement("div");document.body.append(host);
 const options={toolbar:[],...(rules?{inputRules:"markdown-v1" as const}:{}),onInputRuleRefused:()=>refusals.push(true)};
 if(mode==="local"){
  const core={view,supportsMarkdownInputRules:()=>true,supportsMarkdownInputRouting:()=>true,richLanguageVersion:()=>2,
   insertPlainTextWithMarkdownRules:vi.fn((...args:unknown[])=>{calls.push(["plain",...args]);revision++;return outcome;}),insertTypingTextWithMarkdownRules:vi.fn(()=>"inserted"),
   execute:vi.fn((command:{kind:string})=>{calls.push([command.kind]);revision++;return "content";}),dispose:vi.fn()} as unknown as RichCoreEditor;
  return {dom:new RichDomEditor(host,{core,...options}),calls,refusals};
 }
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:12,journalVersion:13,richLanguageVersion:2}),observe:()=>({view_json:()=>JSON.stringify({...view(),format:"breditor/shared-rich-view"}),free:()=>{}}),free:vi.fn(),
  markdown_input_rules_version:()=>"1",markdown_input_routing_version:()=>"1",
  insert_plain_text_with_markdown_rules:(_o:unknown,json:string)=>{calls.push(["plain",JSON.parse(json)]);revision++;return outcome;},insert_typing_text_with_markdown_rules:()=>"inserted",
  set_selection:(_o:unknown,json:string)=>{selection=JSON.parse(json);revision++;return true;},insert_hard_break:()=>{calls.push(["insertHardBreak"]);revision++;return true;}};
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner);
 return {dom:new SharedDomEditor(host,{core,...options}),calls,refusals};
}
function enter(dom:RichDomEditor|SharedDomEditor){const event=new InputEvent("beforeinput",{inputType:"insertParagraph",bubbles:true,cancelable:true});dom.surface.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);}
afterEach(()=>{document.getSelection()?.removeAllRanges();document.body.replaceChildren();vi.restoreAllMocks();});
describe("markdown-v1 code Enter routing",()=>{
 for(const mode of ["local","shared"] as const){
  it(`${mode}: a collapsed code caret takes the exclusive plain call with one line feed`,async()=>{
   const f=fixture(mode,caret("c","3"),true);enter(f.dom);await Promise.resolve();
   expect(f.calls).toHaveLength(1);const call=f.calls[0]!;expect(call[0]).toBe("plain");
   if(mode==="local")expect(call[1]).toBe("\n");else expect((call[1] as {text:string}).text).toBe("\n");
   f.dom.dispose();
  });
  it(`${mode}: without the rule set, in prose or on a range Enter keeps its ordinary command`,async()=>{
   for(const [selection,rules] of [[caret("c","3"),false],[caret("c","1","3"),true]] as const){
    const f=fixture(mode,selection,rules);enter(f.dom);await Promise.resolve();
    expect(f.calls.some(c=>c[0]==="plain")).toBe(false);expect(f.calls.map(c=>c[0])).toContain("insertHardBreak");f.dom.dispose();
   }
   const prose=fixture(mode,caret("p","4"),true);enter(prose.dom);await Promise.resolve();
   expect(prose.calls.some(c=>c[0]==="plain")).toBe(false);prose.dom.dispose();
  });
  it(`${mode}: a refused conversion reports once and keeps the line feed`,async()=>{
   const f=fixture(mode,caret("c","3"),true,"refused");enter(f.dom);await Promise.resolve();await Promise.resolve();
   expect(f.calls).toHaveLength(1);expect(f.refusals).toEqual([true]);f.dom.dispose();
  });
 }
});
