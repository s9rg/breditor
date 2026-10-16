import {afterEach,describe,expect,it,vi} from "vitest";
import {mountDocumentRichEditor,mountRichEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {documentModel,model} from "../../breditor-experimental-rich-content/src/model.js";
import type {RichDocumentCoreEditor,RichDocumentView,RichDocumentSelection,RichCommand} from "../../breditor-experimental-rich-content/src/core.js";
const paragraph={kind:"element",type:"breditor/paragraph",properties:{"breditor/block-id":"a"},children:[{kind:"text",text:"Seed 🙂",formats:[]}]};
const source=JSON.stringify({schema:{name:"test/document-dom",version:1},schemaFingerprint:"native fixture",root:{kind:"element",type:"breditor/document",properties:{"breditor/document-id":"room"},children:[{kind:"element",type:"breditor/horizontal-rule",properties:{"breditor/block-id":"lead"},children:[]},paragraph]}});
// Native state is stubbed here. A separate release-Wasm probe proves actual content/history.
function fixture({natural=false,plain="native selected text",readOnly=false,selected=true,onChange=()=>{}}={}){
 let revision=1,selection:RichDocumentSelection|null=selected?{kind:"document"}:null,policy=readOnly;
 const calls:{kind:string;data:Record<string,unknown>}[]=[],errors:unknown[]=[];
 const check=(expected?:string)=>{if(expected!==undefined&&expected!==String(revision))throw Error("stale native guard");};
 const publish=(kind:string,data:Record<string,unknown>,expected?:string)=>{check(expected);if(policy)throw Error("native read-only");calls.push({kind,data});selection={kind:"text",anchor:{block:"a",offset:"0",affinity:"after"},focus:{block:"a",offset:"0",affinity:"after"}};revision++;return "content" as const;};
 const view=():RichDocumentView=>({format:"breditor/rich-document-view",formatVersion:1,revision:String(revision),documentJson:source,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:1,historyCapacity:100,tables:[],grid:null,...(natural?{historyGrouping:"typing-v1"}:{}),...(policy?{readOnly:true}:{})});
 const core={selectionPolicy:()=>"document-v1",view,documentJson:()=>source,checkpointJson:()=>JSON.stringify(view()),supportsDocumentSelection:()=>true,supportsDocumentClipboard:()=>true,supportsDocumentNavigation:()=>true,supportsGeneralRanges:()=>true,supportsGeneralCopy:()=>true,supportsGeneralInlinePaste:()=>true,supportsGeneralFlowPaste:()=>true,supportsGeneralParagraph:()=>true,supportsTypingHistory:()=>true,supportsReadOnly:()=>true,closeTypingGroup:()=>false,
  setReadOnly:(value:boolean,expected?:string)=>{check(expected);policy=value;revision++;return true;},
  selectDocument:(expected?:string)=>{check(expected);selection={kind:"document"};revision++;return "selection" as const;},
  collapseDocumentSelection:(side:string,expected?:string)=>{check(expected);calls.push({kind:"collapse",data:{side}});selection=null;revision++;return "selection" as const;},
  copyDocument:()=>({format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:"flow",structuredJson:"opaque complete native tree",plainText:plain}),
  generalClipboard:()=>null,clipboard:()=>null,inlineFormatState:()=>{throw Error("Wrong read family");},
  replaceDocumentPlainText:(paragraph:string,text:string,expected?:string)=>publish("plain",{paragraph,text},expected),
  replaceDocumentTypingText:(paragraph:string,text:string,clockMs:string,expected?:string)=>publish("typing",{paragraph,text,clockMs},expected),
  pasteDocumentClipboard:(clipboardJson:string,prefix:string,expected?:string)=>{if(clipboardJson==="malformed")throw Error("native rich admission");return publish("paste",{clipboardJson,prefix},expected);},
  execute:vi.fn((command:RichCommand,expected?:string)=>{check(expected);if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}return publish(command.kind,{},expected);}),dispose:vi.fn() } satisfies RichDocumentCoreEditor;
 const host=document.createElement("div");document.body.append(host);
 const dom=mountDocumentRichEditor(host,{core,selectionEditing:"document-v1",toolbar:[],onError:e=>errors.push(e),onChange});return{core,dom,host,calls,errors};
}
const key=(surface:HTMLElement,key:string,extra:KeyboardEventInit={})=>{const event=new KeyboardEvent("keydown",{key,bubbles:true,cancelable:true,...extra});surface.dispatchEvent(event);return event;};
function clipboard(surface:HTMLElement,kind:"copy"|"cut"|"paste",values=new Map<string,string>(),retainRich=true,retainPlain=true){const event=new Event(kind,{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{files:[],get types(){return [...values.keys()];},getData:(type:string)=>values.get(type)??"",setData:(type:string,value:string)=>{if(type==="text/plain"?retainPlain:retainRich)values.set(type,value);}}});surface.dispatchEvent(event);return{event,values};}
afterEach(()=>{document.getSelection()?.removeAllRanges();document.body.replaceChildren();vi.restoreAllMocks();});
describe("explicit document DOM contracts (synthetic, not native-browser acceptance)",()=>{
 it("requires explicit policy and complete capabilities before changing host DOM",()=>{
  const t=fixture(),host=document.createElement("div");host.textContent="keep";
  try{expect(()=>mountRichEditor(host,{core:t.core as never})).toThrow("policy must match");expect(host.textContent).toBe("keep");
   expect(()=>new SharedDomEditor(host,{core:t.core as never})).toThrow("does not admit document-selection facades");expect(host.textContent).toBe("keep");
   for(const capability of ["supportsDocumentClipboard","supportsDocumentNavigation","supportsGeneralParagraph"] as const){const original=t.core[capability];t.core[capability]=()=>false;expect(()=>mountDocumentRichEditor(host,{core:t.core,selectionEditing:"document-v1"})).toThrow("complete explicitly selected");expect(host.textContent).toBe("keep");t.core[capability]=original;}
   expect(()=>model(t.core.view() as never)).toThrow("explicitly selected native rich view");expect(documentModel(t.core.view()).view.format).toBe("breditor/rich-document-view");
   expect(()=>model({...t.core.view(),format:"breditor/rich-view"} as never)).toThrow("does not admit document scope");
  }finally{t.dom.dispose();}
 });
 it("Select All presents the whole root, not two synthetic text endpoints",()=>{
  const t=fixture({selected:false});try{expect(key(t.dom.surface,"a",{metaKey:true}).defaultPrevented).toBe(true);expect(t.dom.view().selection).toEqual({kind:"document"});expect(t.dom.surface.hasAttribute("data-document-selected")).toBe(true);
   const selection=document.getSelection()!,range=selection.getRangeAt(0);expect(range.startContainer).toBe(t.dom.surface);expect(range.startOffset).toBe(0);expect(range.endContainer).toBe(t.dom.surface);expect(range.endOffset).toBe(t.dom.surface.childNodes.length);expect(t.core.execute).not.toHaveBeenCalled();
   expect(()=>t.dom.execute({kind:"selectDocument"} as never)).toThrow("named document-selection");
  }finally{t.dom.dispose();}
 });
 it("owns a first printable key and Enter/Delete once, with native natural-typing routing",()=>{
  for(const natural of [false,true])for(const input of ["Q","Enter","Backspace"]){const t=fixture({natural});try{expect(key(t.dom.surface,input).defaultPrevented).toBe(true);expect(t.calls).toHaveLength(1);expect(t.calls[0]).toMatchObject({kind:input==="Q"&&natural?"typing":"plain",data:{paragraph:expect.any(String),text:input==="Q"?"Q":""}});expect(t.core.execute).not.toHaveBeenCalled();}finally{t.dom.dispose();}}
 });
 it("recognizes a native root Select All without guessing from text endpoints",()=>{
  const t=fixture({selected:false});try{t.dom.surface.tabIndex=0;t.dom.focus();expect(document.activeElement).toBe(t.dom.surface);document.getSelection()!.selectAllChildren(t.dom.surface);clipboard(t.dom.surface,"copy");expect(t.dom.view().selection).toEqual({kind:"document"});expect(t.calls).toEqual([]);expect(t.core.execute).not.toHaveBeenCalled();}finally{t.dom.dispose();}
 });
 it("routes beforeinput and logical collapse without a temporary selection",()=>{
  for(const inputType of ["insertText","insertReplacementText","insertParagraph","insertLineBreak","deleteContentForward"]){const t=fixture({natural:true});try{const event=new InputEvent("beforeinput",{inputType,data:"Q",bubbles:true,cancelable:true});t.dom.surface.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);expect(t.calls).toHaveLength(1);expect(t.calls[0]).toMatchObject({kind:inputType==="insertText"?"typing":"plain",data:{text:inputType.startsWith("delete")||inputType==="insertParagraph"?"":inputType==="insertLineBreak"?"\n":"Q"}});}finally{t.dom.dispose();}}
  const t=fixture();try{key(t.dom.surface,"ArrowRight");expect(t.calls).toEqual([{kind:"collapse",data:{side:"after"}}]);expect(t.dom.surface.hasAttribute("data-document-selected")).toBe(false);}finally{t.dom.dispose();}
 });
 it("requires complete rich retention before Cut, including an empty plain-text document",()=>{
  for(const plain of ["native selected text",""])for(const retainRich of [false,true]){const t=fixture({plain});try{const exact=t.dom.checkpointJson();const copied=clipboard(t.dom.surface,"copy",new Map(),retainRich);expect(copied.event.defaultPrevented).toBe(true);expect(t.dom.checkpointJson()).toBe(exact);clipboard(t.dom.surface,"cut",new Map(),retainRich);if(retainRich)expect(t.calls).toEqual([{kind:"plain",data:{paragraph:expect.any(String),text:""}}]);else{expect(t.calls).toEqual([]);expect(t.dom.checkpointJson()).toBe(exact);expect(t.dom.status.textContent).toContain("complete rich document");}}finally{t.dom.dispose();}}
 });
 it("keeps read-only Copy and selection but refuses deletion and Cut",()=>{
  const t=fixture({readOnly:true});try{const exact=t.dom.checkpointJson();clipboard(t.dom.surface,"cut");key(t.dom.surface,"Q");key(t.dom.surface,"Delete");expect(t.calls).toEqual([]);expect(t.dom.checkpointJson()).toBe(exact);key(t.dom.surface,"a",{ctrlKey:true});expect(t.dom.view().selection).toEqual({kind:"document"});}finally{t.dom.dispose();}
 });
 it("passes rich paste opaquely and never flattens a refused fragment",()=>{
  for(const rich of ["opaque native flow","malformed"]){const t=fixture();try{const exact=t.dom.checkpointJson();clipboard(t.dom.surface,"paste",new Map([["application/x-breditor-rich+json",rich],["text/plain","must not fallback"]]));if(rich==="malformed"){expect(t.calls).toEqual([]);expect(t.dom.checkpointJson()).toBe(exact);expect(t.dom.status.textContent).toContain("native rich admission");}else expect(t.calls).toEqual([{kind:"paste",data:{clipboardJson:rich,prefix:expect.any(String)}}]);}finally{t.dom.dispose();}}
 });
 it("commits only final composition text once or cancels without deleting the document",()=>{
  const frames:FrameRequestCallback[]=[];vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback=>{frames.push(callback);return frames.length;});
  for(const data of ["日本🙂",""]){const t=fixture({plain:""});try{const exact=t.dom.checkpointJson();t.dom.surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));t.dom.surface.textContent="untrusted provisional DOM";t.dom.surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true,data}));expect(t.calls).toEqual([]);frames.shift()!(0);if(data)expect(t.calls).toEqual([{kind:"plain",data:{paragraph:expect.any(String),text:data}}]);else expect(t.dom.checkpointJson()).toBe(exact);expect(t.dom.surface.querySelector('[data-rich-text="a"]')?.textContent).toBe("Seed 🙂");}finally{t.dom.dispose();}}
 });
 it("cancels provisional composition on policy changes and fences queued pre-commit commands",()=>{
  const frames:FrameRequestCallback[]=[];vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback=>{frames.push(callback);return frames.length;});
  for(const cancel of [false,true]){const t=fixture();try{t.dom.surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));if(cancel)t.dom.setReadOnly(true);else expect(t.dom.execute({kind:"insertPlainText",text:"stale queued"})).toBe("queued");t.dom.surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true,data:"commit"}));frames.shift()?.(0);expect(t.calls).toHaveLength(cancel?0:1);if(!cancel){expect(t.calls[0]?.data["text"]).toBe("commit");expect(t.errors.some(e=>String(e).includes("stale native guard"))).toBe(true);}}finally{t.dom.dispose();}}
 });
});
