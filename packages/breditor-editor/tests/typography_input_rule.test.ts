import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {RichCoreEditor,RichView,RichSelection} from "../../breditor-experimental-rich-content/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
import type {RichInputRulesOption} from "../../breditor-experimental-rich-content/src/input_rule_intent.js";

// typography-v1 routing (synthetic events, not browser acceptance): one typed scalar takes the exclusive
// rule-set call with the canonical ids and, when configured, the validated typography request.
const paragraph={kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:[{kind:"text",text:"say ",formats:[]}]};
const source=JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/dom",version:1},schemaFingerprint:"native fixture",root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/block-id":"root"},children:[paragraph]}});
const caret:RichSelection={kind:"text",anchor:{block:"p",offset:"4",affinity:"after"},focus:{block:"p",offset:"4",affinity:"after"}};
function fixture(mode:"local"|"shared",inputRules:RichInputRulesOption,typographyRuntime=true){
 let revision=1;const calls:unknown[][]=[];
 const view=()=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson:source,selection:caret,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[],richLanguageVersion:2} as RichView);
 const host=document.createElement("div");document.body.append(host);
 const options={toolbar:[],inputRules};
 if(mode==="local"){
  const core={view,supportsMarkdownInputRules:()=>true,supportsMarkdownInputRouting:()=>true,supportsInputRuleSets:()=>true,supportsTypographyInputRules:()=>typographyRuntime,richLanguageVersion:()=>2,
   insertPlainTextWithMarkdownRules:vi.fn(),insertTypingTextWithMarkdownRules:vi.fn(),insertTypingTextWithInputRules:vi.fn(),
   insertPlainTextWithInputRules:vi.fn((...args:unknown[])=>{calls.push(args);revision++;return "applied";}),
   execute:vi.fn(()=>{revision++;return "content";}),dispose:vi.fn()} as unknown as RichCoreEditor;
  return {make:()=>new RichDomEditor(host,{core,...options}),calls,host};
 }
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:12,journalVersion:13,richLanguageVersion:2}),observe:()=>({view_json:()=>JSON.stringify({...view(),format:"breditor/shared-rich-view"}),free:()=>{}}),free:vi.fn(),
  markdown_input_rules_version:()=>"1",markdown_input_routing_version:()=>"1",input_rule_sets_version:()=>"1",...(typographyRuntime?{typography_input_rules_version:()=>"1"}:{}),
  insert_plain_text_with_markdown_rules:()=>"inserted",insert_typing_text_with_markdown_rules:()=>"inserted",insert_typing_text_with_input_rules:()=>"inserted",split_with_autolink:()=>"inserted",
  insert_plain_text_with_input_rules:(_o:unknown,json:string)=>{calls.push([JSON.parse(json)]);revision++;return "applied";},
  set_selection:()=>{revision++;return true;}};
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner);
 return {make:()=>new SharedDomEditor(host,{core,...options}),calls,host};
}
function type(dom:RichDomEditor|SharedDomEditor,data:string){const event=new InputEvent("beforeinput",{inputType:"insertText",data,bubbles:true,cancelable:true});dom.surface.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);}
afterEach(()=>{document.getSelection()?.removeAllRanges();document.body.replaceChildren();vi.restoreAllMocks();});
describe("typography-v1 DOM routing",()=>{
 for(const mode of ["local","shared"] as const){
  it(`${mode}: the default selection sends only the rule ids`,async()=>{
   const f=fixture(mode,["markdown-v1","typography-v1"]),dom=f.make();type(dom,"\"");await Promise.resolve();
   expect(f.calls).toHaveLength(1);
   if(mode==="local")expect(f.calls[0]!.slice(0,2)).toEqual(["\"",["markdown-v1","typography-v1"]]),expect(f.calls[0]).toHaveLength(4);
   else expect(f.calls[0]![0]).toMatchObject({text:"\"",rules:["markdown-v1","typography-v1"]}),expect(f.calls[0]![0]).not.toHaveProperty("typography");
   dom.dispose();
  });
  it(`${mode}: a configured entry forwards the frozen validated request`,async()=>{
   const f=fixture(mode,{rule:"typography-v1",include:["quotes","symbols"],quotes:"german"}),dom=f.make();type(dom,")");await Promise.resolve();
   const typography={include:["quotes","symbols"],quotes:"german"};
   if(mode==="local")expect(f.calls[0]![4]).toEqual(typography);else expect(f.calls[0]![0]).toMatchObject({text:")",rules:["typography-v1"],typography});
   dom.dispose();
  });
  it(`${mode}: invalid configuration or an older runtime rejects before mounting`,()=>{
   const bad=fixture(mode,{rule:"typography-v1",quotes:{double:["\"","\""],single:["‘","’"]}} as unknown as RichInputRulesOption);
   expect(()=>bad.make()).toThrow(TypeError);expect(bad.host.childElementCount).toBe(0);
   const old=fixture(mode,"typography-v1",false);
   expect(()=>old.make()).toThrow("typography-v1");expect(old.host.childElementCount).toBe(0);
  });
 }
});
