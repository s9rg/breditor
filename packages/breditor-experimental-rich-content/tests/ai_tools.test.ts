// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../src/controller.js";
import {richAiToolsHost,resolveAiTarget,readAiDocument,admitAiText} from "../src/ai_tools_host.js";
import {mountRichAiTools,type RichRewriteProviderRequest} from "../src/ai_rewrite.js";
import {mountRichLanguageCheck,type RichLanguageProviderRequest} from "../src/language_check.js";
import {diffAiText} from "../src/ai_diff.js";
import {resolveRichUi,richUiStringsEn} from "../src/ui_locale.js";
import {richAiUiStringsEn} from "../src/ui_locale_ai.js";
import type {RichCommand,RichCoreEditor,RichSelection,RichView} from "../src/core.js";
import {createRichInterchange} from "../../breditor-interchange/src/index.js";

/**
 * Deterministic stand-in for the native owner: paragraphs only, exact revision guard (every publication, including
 * selection-only ones, bumps the revision), one undo snapshot per content command. The real Wasm owner is exercised
 * by experiments/rich-browser/ai-tools.spec.mjs.
 */
function fakeCore(initial:Record<string,string>,options:{general?:boolean}={}){
 let blocks=Object.entries(initial).map(([id,text])=>({id,text})),revision=1,selection:RichSelection|null=null,readOnly=false;
 const undo:{id:string;text:string}[][]=[],redo:{id:string;text:string}[][]=[],commands:RichCommand[]=[];
 const paragraph=(id:string,text:string)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:text?[{kind:"text",text,formats:[]}]:[]});
 const documentJson=()=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/ai",version:1},schemaFingerprint:"fixture",root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children:blocks.map(b=>paragraph(b.id,b.text))}});
 const view=():RichView=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson:documentJson(),selection,pendingFormatsJson:null,undoDepth:undo.length,redoDepth:redo.length,historyCapacity:100,grid:null,tables:[],...(options.general?{rangeEditing:"general-v1" as const}:{}),...(readOnly?{readOnly:true as const}:{})} as RichView);
 const replace=(range:Extract<RichSelection,{kind:"text"}>,text:string)=>{
  const a=blocks.findIndex(b=>b.id===range.anchor.block),f=blocks.findIndex(b=>b.id===range.focus.block);if(a<0||f<0)throw Error("unknown block");
  const forward=a<f||a===f&&Number(range.anchor.offset)<=Number(range.focus.offset),[s,e]=forward?[range.anchor,range.focus]:[range.focus,range.anchor],[i,j]=forward?[a,f]:[f,a];
  undo.push(blocks.map(b=>({...b})));redo.length=0;
  const merged=blocks[i]!.text.slice(0,Number(s.offset))+text+blocks[j]!.text.slice(Number(e.offset));
  blocks=[...blocks.slice(0,i),{id:blocks[i]!.id,text:merged},...blocks.slice(j+1)];
  const caret={block:blocks[i]!.id,offset:String(Number(s.offset)+text.length),affinity:"after" as const};selection={kind:"text",anchor:caret,focus:caret};
 };
 const clipboardText=(json:string)=>{const out:string[]=[];const walk=(n:{kind:string;type?:string;text?:string;children?:unknown[]})=>{if(n.kind==="text")out.push(n.text!);for(const c of n.children??[])walk(c as never);if(n.type==="breditor/paragraph")out.push("\n");};walk(JSON.parse(json).document.root);return out.join("").replace(/\n$/,"");};
 const core={
  view,documentJson,supportsGeneralRanges:()=>options.general===true,supportsReadOnly:()=>true,
  setReadOnly:(value:boolean)=>{readOnly=value;revision++;return true;},
  supportsClipboardInterchange:()=>true,
  admitClipboardRoot:(kind:string,root:string)=>({format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""}),
  validateClipboard:(source:string)=>({format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:"flow",structuredJson:source,plainText:""}),
  execute:vi.fn((command:RichCommand,expected?:string)=>{
   if(expected!==undefined&&expected!==String(revision))throw Object.assign(Error("The command was prepared from an older rich view"),{code:"breditor_rich.stale_observation"});
   commands.push(command);
   switch(command.kind){
    case "setSelection":selection=command.selection;revision++;return "selection";
    case "replaceTextRange":if(readOnly)throw Error("read-only");replace(command.data.selection,command.data.text);revision++;return "content";
    case "replaceGeneralRangePlainText":if(readOnly)throw Error("read-only");replace(command.data.selection,command.data.text);revision++;return "content";
    case "pasteGeneralInlineClipboard":case "pasteGeneralFlowClipboard":replace(command.data.selection,clipboardText(command.data.clipboardJson));revision++;return "content";
    case "undo":{const previous=undo.pop();if(!previous)return "unchanged";redo.push(blocks);blocks=previous;revision++;return "undo";}
    default:throw Error(`unexpected command ${command.kind}`);
   }
  }),
  dispose:vi.fn(),
 };
 return {core:core as unknown as RichCoreEditor&{documentJson():string},commands,text:()=>Object.fromEntries(blocks.map(b=>[b.id,b.text])),undoDepth:()=>undo.length,raw:core};
}
const select=(dom:RichDomEditor,anchor:[string,number],focus:[string,number]=anchor)=>dom.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:anchor[0],offset:String(anchor[1]),affinity:"after"},focus:{block:focus[0],offset:String(focus[1]),affinity:"after"}}},false);
function setup(texts:Record<string,string>={a:"Hello wrold, this is fine.",b:"Second paragraph."},options:{general?:boolean}={}){
 const fake=fakeCore(texts,options),editorHost=document.createElement("div"),panelHost=document.createElement("aside");document.body.append(editorHost,panelHost);
 const dom=new RichDomEditor(editorHost,{core:fake.core,toolbar:[]});
 return {...fake,dom,host:richAiToolsHost(dom),panelHost,interchange:createRichInterchange(fake.raw as never)};
}
const flush=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
const contentCommands=(commands:RichCommand[])=>commands.filter(c=>c.kind!=="setSelection");
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();vi.useRealTimers();});

describe("scope resolution and untrusted text",()=>{
 it("reads only explicit scopes from the admitted document, never the DOM",()=>{
  const t=setup({a:"Alpha beta",b:"Gamma",c:"Delta"});select(t.dom,["a",6],["c",2]);
  const view=t.host.aiView(),target=resolveAiTarget(view,"selection");
  expect(target.segments).toEqual([{block:"a",start:6,end:10,text:"beta"},{block:"b",start:0,end:5,text:"Gamma"},{block:"c",start:0,end:2,text:"De"}]);
  expect(target.text).toBe("beta\nGamma\nDe");expect(target.selection).toMatchObject({anchor:{block:"a",offset:"6"},focus:{block:"c",offset:"2"}});
  expect(resolveAiTarget(view,"block").segments).toEqual([{block:"c",start:0,end:5,text:"Delta"}]);
  expect(resolveAiTarget(view,"document").segments.map(s=>s.block)).toEqual(["a","b","c"]);
  select(t.dom,["a",3]);expect(()=>resolveAiTarget(t.host.aiView(),"selection")).toThrow("Select text");
  expect(()=>resolveAiTarget(view,"everything" as never)).toThrow(TypeError);
  expect(readAiDocument(view.documentJson).order).toEqual(["a","b","c"]);
 });
 it("admits only well-formed plain text",()=>{
  expect(admitAiText("a\r\nb\rc",true)).toBe("a\nb\nc");expect(admitAiText("a\nb",false)).toBeNull();
  for(const bad of ["\ud800","x\udc00","a\u0000","\u0007","\u009b",1,null,{toString:()=>"x"}])expect(admitAiText(bad,true)).toBeNull();
  expect(admitAiText("tab\tand 😀",false)).toBe("tab\tand 😀");
 });
 it("diffs words for presentation without splitting surrogate pairs",()=>{
  expect(diffAiText("Hello wrold.","Hello world.")).toEqual([{kind:"same",text:"Hello "},{kind:"removed",text:"wrold"},{kind:"added",text:"world"},{kind:"same",text:"."}]);
  const parts=diffAiText("a😀b","a😃b");expect(parts.map(p=>p.text).join("")).toContain("😀");for(const p of parts)expect(admitAiText(p.text,true)).not.toBeNull();
 });
 it("keeps the original catalog byte-identical and adds AI keys in a separate validated block",()=>{
  for(const [key,value] of Object.entries(richAiUiStringsEn))expect((richUiStringsEn as Record<string,string>)[key]).toBe(value);
  expect(richUiStringsEn.richEditorLabel).toBe("Rich text editor");
  expect(resolveRichUi({strings:{aiAccept:"Übernehmen",langCount:"{count} Probleme"}}).text("langCount",{count:3})).toBe("3 Probleme");
  expect(()=>resolveRichUi({strings:{aiApplied:"{nope}"}})).toThrow("unknown placeholder");
 });
});

describe("rewrite review",()=>{
 it("sends only the scoped text, shows a reviewable diff and applies one guarded command undone in one step",async()=>{
  const t=setup();select(t.dom,["a",6],["a",11]);
  const seen:RichRewriteProviderRequest[]=[],gate=deferred<{text:string}>();
  const tools=mountRichAiTools(t.panelHost,t.host,{provider:request=>{seen.push(request);return gate.promise;}});
  const before=t.text(),pending=tools.requestRewrite({scope:"selection",instruction:"Fix spelling"});
  expect(tools.state().phase).toBe("pending");expect(t.panelHost.querySelector("[data-breditor-ai]")!.getAttribute("aria-busy")).toBe("true");
  expect(Object.keys(seen[0]!).sort()).toEqual(["instruction","kind","revision","scope","segments","signal","text"]);
  expect(seen[0]).toMatchObject({kind:"rewrite",scope:"selection",instruction:"Fix spelling",text:"wrold",segments:[{block:"a",start:6,end:11,text:"wrold"}]});
  expect(JSON.stringify({...seen[0],signal:undefined})).not.toContain("Second");
  gate.resolve({text:"world"});const review=await pending;
  expect(review).toMatchObject({original:"wrold",proposed:"world",format:"text",unchanged:false});
  expect(t.text()).toEqual(before);expect(contentCommands(t.commands)).toHaveLength(0);
  const panel=t.panelHost;expect(panel.querySelector("[data-ai-before] del")!.textContent).toBe("wrold");expect(panel.querySelector("[data-ai-after] ins")!.textContent).toBe("world");
  expect(panel.querySelector("[data-ai-review]")!.getAttribute("role")).toBe("region");
  const undoBefore=t.undoDepth();
  panel.querySelector<HTMLButtonElement>("[data-ai-action=accept]")!.click();
  expect(t.text()).toEqual({a:"Hello world, this is fine.",b:"Second paragraph."});
  expect(contentCommands(t.commands)).toEqual([{kind:"replaceTextRange",data:{selection:{kind:"text",anchor:{block:"a",offset:"6",affinity:"after"},focus:{block:"a",offset:"11",affinity:"after"}},text:"world"}}]);
  expect(t.undoDepth()).toBe(undoBefore+1);expect(tools.state().phase).toBe("applied");expect(panel.querySelector("[data-ai-status]")!.textContent).toMatch(/^Applied as one change · revision \d+$/);
  t.dom.execute({kind:"undo"});expect(t.text()).toEqual(before);
  tools.dispose();t.dom.dispose();
 });
 it("uses the general-v1 command family and rejects read-only owners before calling the provider",async()=>{
  const t=setup(undefined,{general:true});select(t.dom,["a",0],["b",6]);
  const provider=vi.fn(()=>({text:"Joined"}));const tools=mountRichAiTools(t.panelHost,t.host,{provider});
  await tools.requestRewrite({scope:"selection",instruction:""});expect(provider.mock.calls[0]![0]).toMatchObject({text:"Hello wrold, this is fine.\nSecond"});
  tools.accept();const command=contentCommands(t.commands)[0]!;expect(command.kind).toBe("replaceGeneralRangePlainText");expect(t.text()).toEqual({a:"Joined paragraph."});
  t.dom.setReadOnly(true);provider.mockClear();
  await expect(tools.requestRewrite({scope:"block",instruction:"x"})).rejects.toThrow("read-only");expect(provider).not.toHaveBeenCalled();
 });
 it("cancels through the AbortSignal, ignores late results and never changes the document",async()=>{
  const t=setup();select(t.dom,["a",0],["a",5]);const signals:AbortSignal[]=[],gates:ReturnType<typeof deferred<{text:string}>>[]=[];
  const tools=mountRichAiTools(t.panelHost,t.host,{provider:({signal})=>{signals.push(signal);const gate=deferred<{text:string}>();gates.push(gate);return gate.promise;}});
  const first=tools.requestRewrite({scope:"selection",instruction:"a"});
  t.panelHost.querySelector<HTMLButtonElement>("[data-ai-action=stop]")!.click();
  expect(signals[0]!.aborted).toBe(true);expect(await first).toBeNull();expect(tools.state().phase).toBe("cancelled");
  gates[0]!.resolve({text:"LATE"});await flush();expect(tools.state().review).toBeNull();
  // A new request supersedes (and aborts) an older one; the older answer is never shown.
  const second=tools.requestRewrite({scope:"selection",instruction:"b"}),third=tools.requestRewrite({scope:"selection",instruction:"c"});
  expect(signals[1]!.aborted).toBe(true);gates[1]!.resolve({text:"OLD"});gates[2]!.resolve({text:"NEW"});
  expect(await second).toBeNull();expect((await third)?.proposed).toBe("NEW");
  // Escape in the panel cancels a pending request, then disposal aborts any remaining one.
  const fourth=tools.requestRewrite({scope:"selection",instruction:"d"});t.panelHost.querySelector("[data-breditor-ai]")!.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  expect(signals[3]!.aborted).toBe(true);expect(await fourth).toBeNull();
  const fifth=tools.requestRewrite({scope:"selection",instruction:"e"});tools.dispose();expect(signals[4]!.aborted).toBe(true);expect(await fifth).toBeNull();
  expect(contentCommands(t.commands)).toHaveLength(0);
 });
 it("times out a silent provider",async()=>{
  const t=setup();select(t.dom,["a",0],["a",5]);let signal:AbortSignal|undefined;
  const tools=mountRichAiTools(t.panelHost,t.host,{timeoutMs:15,provider:request=>{signal=request.signal;return new Promise(()=>{});}});
  expect(await tools.requestRewrite({scope:"selection",instruction:"x"})).toBeNull();expect(signal!.aborted).toBe(true);
  expect(tools.state()).toMatchObject({phase:"failed",error:"The provider did not answer in time."});
 });
 it("refuses a stale review, keeps selection-only publications valid and offers to run again",async()=>{
  const t=setup();select(t.dom,["a",6],["a",11]);let answer="world";
  const onStale=vi.fn(),tools=mountRichAiTools(t.panelHost,t.host,{provider:()=>({text:answer}),onStale});
  await tools.requestRewrite({scope:"selection",instruction:"fix"});
  // Moving the caret bumps the revision but leaves the document content identical: still applicable.
  select(t.dom,["b",3]);await flush();expect(tools.state().phase).toBe("review");
  tools.accept();expect(t.text().a).toBe("Hello world, this is fine.");
  select(t.dom,["a",0],["a",5]);answer="Howdy";await tools.requestRewrite({scope:"selection",instruction:"fix"});
  t.dom.execute({kind:"replaceTextRange",data:{selection:{kind:"text",anchor:{block:"b",offset:"0",affinity:"after"},focus:{block:"b",offset:"6",affinity:"after"}},text:"Other"}});
  await flush();expect(tools.state()).toMatchObject({phase:"stale",error:richAiUiStringsEn.aiStale});expect(onStale).toHaveBeenCalledOnce();
  const before=t.text(),count=contentCommands(t.commands).length;
  expect(()=>tools.accept()).toThrow("document changed");expect(t.text()).toEqual(before);expect(contentCommands(t.commands)).toHaveLength(count);
  const rerun=t.panelHost.querySelector<HTMLButtonElement>("[data-ai-action=rerun]")!;expect(rerun.hidden).toBe(false);
  expect(t.panelHost.querySelector<HTMLButtonElement>("[data-ai-action=accept]")!.hidden).toBe(true);
  select(t.dom,["a",0],["a",5]);await tools.rerun();expect(tools.state().phase).toBe("review");tools.accept();expect(t.text().a).toBe("Howdy world, this is fine.");
 });
 it("marks a review stale when the document changed while the provider was running",async()=>{
  const t=setup();select(t.dom,["a",0],["a",5]);const gate=deferred<{text:string}>(),onStale=vi.fn();
  const tools=mountRichAiTools(t.panelHost,t.host,{provider:()=>gate.promise,onStale});const pending=tools.requestRewrite({scope:"block",instruction:"x"});
  t.dom.execute({kind:"replaceTextRange",data:{selection:{kind:"text",anchor:{block:"a",offset:"0",affinity:"after"},focus:{block:"a",offset:"1",affinity:"after"}},text:"J"}});
  gate.resolve({text:"Replaced"});await pending;expect(tools.state().phase).toBe("stale");expect(onStale).toHaveBeenCalledOnce();
  expect(()=>tools.accept()).toThrow();expect(t.text().a).toBe("Jello wrold, this is fine.");
 });
 it("treats provider output as untrusted: shapes, encodings and size are checked before review",async()=>{
  const t=setup();select(t.dom,["a",0],["a",5]);let output:unknown;
  const tools=mountRichAiTools(t.panelHost,t.host,{maxOutputBytes:32,provider:()=>output as never});
  class Answer {text="x";}
  const getter=Object.defineProperty({},"text",{enumerable:true,get:()=>"x"});
  for(const bad of [null,"text",["x"],{text:1},{text:"a",html:"b"},{markdown:2},{text:"\ud800"},{text:"a\u0000"},{other:"x"},new Answer(),getter]){
   output=bad;expect(await tools.requestRewrite({scope:"selection",instruction:"x"})).toBeNull();expect(tools.state()).toMatchObject({phase:"failed",error:richAiUiStringsEn.aiInvalidOutput});
  }
  output={text:"x".repeat(33)};expect(await tools.requestRewrite({scope:"selection",instruction:"x"})).toBeNull();expect(tools.state().error).toBe("The provider result exceeds the 32-byte limit; nothing was applied.");
  output={text:"same"};select(t.dom,["a",0],["a",4]);output={text:"Hell"};const same=await tools.requestRewrite({scope:"selection",instruction:"x"});expect(same?.unchanged).toBe(true);
  expect(tools.accept()).toBe("unchanged");expect(contentCommands(t.commands)).toHaveLength(0);
  // Formatted output needs the explicit interchange adapter.
  output={html:"<b>x</b>"};expect(await tools.requestRewrite({scope:"selection",instruction:"x"})).toBeNull();expect(tools.state().error).toBe(richAiUiStringsEn.aiFormattedUnavailable);
 });
 it("bounds the input before anything is sent",async()=>{
  const t=setup({a:"é".repeat(20)});select(t.dom,["a",0],["a",20]);const provider=vi.fn(()=>({text:"x"}));
  const tools=mountRichAiTools(t.panelHost,t.host,{provider,maxInputBytes:39});
  await expect(tools.requestRewrite({scope:"selection",instruction:"x"})).rejects.toThrow("39-byte limit");expect(provider).not.toHaveBeenCalled();
  expect(()=>mountRichAiTools(document.createElement("div"),t.host,{maxInputBytes:2*1024*1024})).toThrow(RangeError);
  await expect(tools.requestRewrite({scope:"selection",instruction:"x".repeat(2049)})).rejects.toThrow(TypeError);
  await expect(tools.requestRewrite({scope:"document",instruction:"x"} as never)).rejects.toThrow(TypeError);
 });
 it("imports formatted output only through the bounded interchange: scripts and handlers removed and reported",async()=>{
  const t=setup(undefined,{general:true});select(t.dom,["a",6],["a",11]);(window as unknown as {pwned?:number}).pwned=undefined;
  const html=`<p>new <b onclick="window.pwned=1">bold</b> text<script>window.pwned=2</script><img src=x onerror="window.pwned=3"><a href="javascript:window.pwned=4">link</a></p>`;
  const tools=mountRichAiTools(t.panelHost,t.host,{interchange:t.interchange,provider:()=>({html})});
  const review=await tools.requestRewrite({scope:"selection",instruction:"x"});
  expect(review?.format).toBe("html");const codes=review!.losses.map(n=>n.code);expect(codes).toEqual(expect.arrayContaining(["removed-content","unsupported-attribute","unsafe-link"]));
  expect(review!.proposed).not.toMatch(/pwned|script/);
  const panel=t.panelHost;expect(panel.querySelector("script,img,[onclick],[onerror],b")).toBeNull();expect(panel.querySelector("[data-ai-loss-summary]")!.textContent).toContain("removed-content");
  tools.accept();const command=contentCommands(t.commands)[0]!;expect(command.kind).toMatch(/^pasteGeneral(Inline|Flow)Clipboard$/);
  expect(JSON.stringify(command)).not.toMatch(/pwned|onclick|onerror|javascript:|<script/);
  expect((window as unknown as {pwned?:number}).pwned).toBeUndefined();expect(t.text().a).toContain("new bold text");
  // Markdown with embedded HTML follows the same path; a refused import shows its notices and applies nothing.
  select(t.dom,["b",0],["b",6]);const md=mountRichAiTools(document.body.appendChild(document.createElement("div")),t.host,{interchange:t.interchange,provider:()=>({markdown:"**Bold** <script>x</script>"})});
  expect((await md.requestRewrite({scope:"selection",instruction:"x"}))?.losses.some(n=>n.code==="removed-content")).toBe(true);
 });
 it("is keyboard reviewable: generate with Ctrl+Enter, focus moves to the review, Escape rejects",async()=>{
  const t=setup();select(t.dom,["a",6],["a",11]);
  const tools=mountRichAiTools(t.panelHost,t.host,{provider:async({instruction})=>({text:instruction==="fix"?"world":"?"})});
  const field=t.panelHost.querySelector<HTMLTextAreaElement>("[data-ai-field=instruction]")!;field.focus();field.value="fix";
  expect(t.panelHost.querySelector("label")!.textContent).toContain("Instruction");
  field.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",ctrlKey:true,bubbles:true}));await flush();
  const review=t.panelHost.querySelector<HTMLElement>("[data-ai-review]")!;expect(tools.state().phase).toBe("review");expect(document.activeElement).toBe(review);
  expect(review.getAttribute("aria-labelledby")).toBe(review.querySelector("h3")!.id);
  const focus=vi.spyOn(t.dom,"focus");review.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  // Focus returns to the editor (jsdom cannot focus a contenteditable surface, so the request itself is checked).
  expect(tools.state().phase).toBe("rejected");expect(focus).toHaveBeenCalledOnce();expect(contentCommands(t.commands)).toHaveLength(0);
 });
 it("localizes its chrome through the editor catalog",async()=>{
  const fake=fakeCore({a:"x"}),editorHost=document.createElement("div"),panelHost=document.createElement("div");document.body.append(editorHost,panelHost);
  const dom=new RichDomEditor(editorHost,{core:fake.core,toolbar:[],ui:{lang:"de",direction:"ltr",strings:{aiPanelLabel:"Schreibassistent",aiAccept:"Übernehmen"}}});
  mountRichAiTools(panelHost,richAiToolsHost(dom),{provider:()=>({text:"y"})});
  const section=panelHost.querySelector<HTMLElement>("[data-breditor-ai]")!;expect(section.getAttribute("aria-label")).toBe("Schreibassistent");expect(section.lang).toBe("de");
  expect(panelHost.querySelector("[data-ai-action=accept]")!.textContent).toBe("Übernehmen");expect(editorHost.querySelector("[role=textbox]")!.hasAttribute("lang")).toBe(false);
 });
});

describe("language check",()=>{
 const issues=[
  {range:{block:"a",start:6,end:11},message:"Possible spelling mistake",suggestions:["world","wold"],kind:"spelling"},
  {range:{block:"a",start:13,end:17},message:"Weak word",suggestions:["it"]},
  {range:{block:"b",start:0,end:6},message:"Consider",suggestions:["Next"],kind:"style"},
  {range:{block:"zzz",start:0,end:1},message:"unknown block",suggestions:[]},
  {range:{block:"a",start:5,end:999},message:"out of range",suggestions:[]},
  {range:{block:"a",start:0,end:1},message:"",suggestions:[]},
  {range:{block:"a",start:0,end:1},message:"x",suggestions:["a\nb"]},
  {range:{block:"a",start:0,end:1,extra:1},message:"x",suggestions:[]},
  "not an issue",
 ];
 function stubLayout(){
  const rect={left:10,top:10,right:60,bottom:30,width:50,height:20,x:10,y:10,toJSON(){return this;}} as DOMRect;
  (Range.prototype as unknown as {getClientRects:()=>DOMRect[]}).getClientRects=()=>[rect];
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockReturnValue({left:0,top:0,right:800,bottom:600,width:800,height:600,x:0,y:0,toJSON(){return this;}} as DOMRect);
 }
 const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
 it("admits only valid issues, paints them outside the editable DOM and never mutates document text",async()=>{
  stubLayout();const t=setup();const seen:RichLanguageProviderRequest[]=[];
  const check=mountRichLanguageCheck(t.panelHost,t.host,{provider:async request=>{seen.push(request);return issues as never;}});
  const surfaceBefore=t.dom.surface.innerHTML;
  const admitted=await check.check({scope:"document"});
  expect(Object.keys(seen[0]!).sort()).toEqual(["kind","revision","scope","segments","signal"]);expect(seen[0]!.segments.map(s=>s.block)).toEqual(["a","b"]);
  expect(admitted!.map(i=>[i.block,i.start,i.end,i.text])).toEqual([["a",6,11,"wrold"],["a",13,17,"this"],["b",0,6,"Second"]]);
  expect(check.state().ignoredMalformed).toBe(6);expect(t.panelHost.querySelector("[data-language-status]")!.textContent).toContain("Malformed provider issues ignored: 6.");
  await frame();
  const overlay=document.querySelector<HTMLElement>("[data-language-overlay]")!;expect(overlay.getAttribute("aria-hidden")).toBe("true");expect(t.dom.surface.contains(overlay)).toBe(false);
  expect(overlay.querySelectorAll("[data-language-highlight]")).toHaveLength(3);expect(overlay.querySelector("[data-language-active=true]")!.getAttribute("data-language-highlight")).toBe(admitted![0]!.key);
  expect(t.dom.surface.innerHTML).toBe(surfaceBefore);expect(contentCommands(t.commands)).toHaveLength(0);
  check.dispose();expect(document.querySelector("[data-language-overlay]")).toBeNull();
 });
 it("navigates by keyboard and applies one suggestion as one guarded command, remapping only exact shifts",async()=>{
  stubLayout();const t=setup();const check=mountRichLanguageCheck(t.panelHost,t.host,{provider:()=>issues.slice(0,3) as never});
  await check.check({scope:"document"});const list=t.panelHost.querySelector<HTMLElement>("[data-language-issues]")!;
  const issueButtons=()=>[...list.querySelectorAll<HTMLButtonElement>("[data-language-issue]")];
  expect(issueButtons().map(b=>b.tabIndex)).toEqual([0,-1,-1]);expect(issueButtons()[0]!.textContent).toBe("“wrold”: Possible spelling mistake");
  issueButtons()[0]!.focus();issueButtons()[0]!.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}));
  expect(document.activeElement).toBe(issueButtons()[1]);expect(issueButtons()[1]!.getAttribute("aria-current")).toBe("true");
  // Revealing an issue is a selection-only publication; issues survive it.
  expect(t.commands.at(-1)).toMatchObject({kind:"setSelection",selection:{anchor:{block:"a",offset:"13"},focus:{block:"a",offset:"17"}}});await flush();expect(check.issues()).toHaveLength(3);
  issueButtons()[1]!.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true}));
  issueButtons()[0]!.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
  const suggestion=document.activeElement as HTMLButtonElement;expect(suggestion.dataset["languageSuggestion"]).toBe("0");expect(suggestion.textContent).toBe("Replace with “world”");
  suggestion.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));expect(document.activeElement).toBe(issueButtons()[0]);
  issueButtons()[0]!.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));const undoBefore=t.undoDepth();
  (document.activeElement as HTMLButtonElement).click();
  expect(t.text().a).toBe("Hello world, this is fine.");expect(t.undoDepth()).toBe(undoBefore+1);
  expect(contentCommands(t.commands)).toEqual([{kind:"replaceTextRange",data:{selection:{kind:"text",anchor:{block:"a",offset:"6",affinity:"after"},focus:{block:"a",offset:"11",affinity:"after"}},text:"world"}}]);
  await flush();
  // The later issue in the same block was shifted by the exact length change; the other block's issue is untouched.
  expect(check.issues().map(i=>[i.block,i.start,i.end,i.text])).toEqual([["a",13,17,"this"],["b",0,6,"Second"]]);
  expect(document.activeElement).toBe(issueButtons()[0]);
  check.applySuggestion(check.issues()[0]!.key,0);expect(t.text().a).toBe("Hello world, it is fine.");
  t.dom.execute({kind:"undo"});t.dom.execute({kind:"undo"});expect(t.text().a).toBe("Hello wrold, this is fine.");
 });
 it("drops issues whose block text changed and keeps those in untouched blocks",async()=>{
  const t=setup();const check=mountRichLanguageCheck(t.panelHost,t.host,{decorations:false,provider:()=>issues.slice(0,3) as never});
  await check.check({scope:"document"});const stale=check.issues()[0]!;
  t.dom.execute({kind:"replaceTextRange",data:{selection:{kind:"text",anchor:{block:"a",offset:"0",affinity:"after"},focus:{block:"a",offset:"0",affinity:"after"}},text:"Oh, "}});
  await flush();expect(check.issues().map(i=>i.block)).toEqual(["b"]);expect(t.panelHost.querySelector("[data-language-status]")!.textContent).toContain("outdated issues removed: 2");
  expect(()=>check.applySuggestion(stale.key,0)).toThrow("no longer current");
  t.dom.setReadOnly(true);await flush();expect(()=>check.applySuggestion(check.issues()[0]!.key,0)).toThrow("Read-only");
 });
 it("cancels a pending check and refuses non-array output",async()=>{
  const t=setup();let signal:AbortSignal|undefined;let output:unknown=new Promise(()=>{});
  const check=mountRichLanguageCheck(t.panelHost,t.host,{decorations:false,provider:request=>{signal=request.signal;return output as never;}});
  const pending=check.check({scope:"block",block:"b"});check.cancel();expect(signal!.aborted).toBe(true);expect(await pending).toBeNull();expect(check.state().phase).toBe("cancelled");
  output={issues:[]};expect(await check.check({scope:"document"})).toBeNull();expect(check.state().error).toBe(richAiUiStringsEn.aiInvalidOutput);
  await expect(check.check({scope:"selection"})).rejects.toThrow("Select text");
 });
});
