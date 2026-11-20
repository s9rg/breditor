import {act,createRef} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {sharedAiToolsHost,mountSharedAiTools,mountSharedLanguageCheck} from "../../breditor-collaboration/src/ai_tools.js";
import type {SharedRustOwner,RichSelection} from "../../breditor-collaboration/src/types.js";
import {aiTargetKey} from "../../breditor-experimental-rich-content/src/ai_tools_host.js";
import {BreditorSharedAiTools,BreditorSharedLanguageCheck,type BreditorSharedAiToolsHandle,type BreditorSharedLanguageCheckHandle} from "../src/shared_ai_tools_react.js";
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;

type Range=Extract<RichSelection,{kind:"text"}>;
const point=(block:string,offset:number)=>({block,offset:String(offset),affinity:"after" as const});
const range=(a:string,s:number,b:string,e:number):Range=>({kind:"text",anchor:point(a,s),focus:point(b,e)});
/** A peer's publication, admitted through the real `receiveFrame` path (the fake owner interprets it). */
type Remote={kind:"text";block:string;text:string}|{kind:"insert";after:string;block:string;text:string}|{kind:"bold";block:string};
/**
 * Fake exclusive native owner: real `SharedRichEditor` + `SharedDomEditor` above it. It keeps one history group per
 * local native call (as Rust's `apply_with_state` does), never undoes peers' edits, and records every local call.
 */
function owner(options:{general?:boolean;readOnly?:boolean}={}){
 let revision=1,selection:RichSelection|null=range("a",0,"a",0),readOnly=options.readOnly===true;
 type Block={text:string;bold:boolean};
 let blocks=new Map<string,Block>([["a",{text:"Hello wrold",bold:false}],["b",{text:"Second blok",bold:false}],["c",{text:"Third",bold:false}]]);
 const undo:Map<string,Block>[]=[],calls:{method:string;selection:Range;text:string;revision:string}[]=[];
 const documentJson=()=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/shared-ai",version:1},schemaFingerprint:"fixture",root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[...blocks].map(([id,b])=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:b.text?[{kind:"text",text:b.text,formats:b.bold?[{type:"breditor/strong",properties:{}}]:[]}]:[]}))}});
 const view=()=>({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),documentJson:documentJson(),selection,pendingFormatsJson:null,undoDepth:undo.length,redoDepth:0,historyCapacity:100,grid:null,tables:[],selectionOutcome:{kind:"kept"},...(options.general?{rangeEditing:"general-v1"}:{}),...(readOnly?{readOnly:true,readOnlyRevision:String(revision)}:{})});
 const clone=()=>new Map([...blocks].map(([id,b])=>[id,{...b}]));
 const replace=(method:string,s:Range,text:string)=>{
  calls.push({method,selection:s,text,revision:String(revision)});
  const order=[...blocks.keys()],a=order.indexOf(s.anchor.block),f=order.indexOf(s.focus.block);if(a<0||f<0)throw Error("missing block");
  const [first,start,last,end]=a<f||a===f&&Number(s.anchor.offset)<=Number(s.focus.offset)?[a,Number(s.anchor.offset),f,Number(s.focus.offset)]:[f,Number(s.focus.offset),a,Number(s.anchor.offset)];
  undo.push(clone());const head=blocks.get(order[first]!)!,tail=blocks.get(order[last]!)!;
  head.text=head.text.slice(0,start)+text+tail.text.slice(end);for(let i=first+1;i<=last;i++)blocks.delete(order[i]!);
  selection=range(order[first]!,start+text.length,order[first]!,start+text.length);revision++;return true;
 };
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),
  observe:()=>({view_json:()=>JSON.stringify(view()),free:()=>{}}),free:vi.fn(),
  read_only_version:()=>"1",set_read_only:(_o:unknown,value:boolean)=>{readOnly=value;revision++;return true;},
  set_selection:(_o:unknown,json:string)=>{selection=JSON.parse(json) as RichSelection;revision++;return true;},
  dispatch:vi.fn(()=>{throw Error("unexpected dispatch");}),
  replace_plain_text:(_o:unknown,json:string,text:string)=>replace("replace_plain_text",JSON.parse(json) as Range,text),
  undo_observed:()=>{const previous=undo.pop();if(!previous)return false;blocks=previous;revision++;return true;},
  receive_frame:(frame:string)=>{const edit=JSON.parse(frame) as Remote;
   if(edit.kind==="text")blocks.get(edit.block)!.text=edit.text;else if(edit.kind==="bold")blocks.get(edit.block)!.bold=true;
   else{const next=new Map<string,Block>();for(const [id,b] of blocks){next.set(id,b);if(id===edit.after)next.set(edit.block,{text:edit.text,bold:false});}blocks=next;}
   revision++;},
  ...(options.general?{general_range_version:()=>"1",enable_general_ranges:()=>true,replace_general_range_text:()=>true,replace_general_range_typing_text:()=>true,general_checkpoint:()=>"{}",general_typing_checkpoint:()=>"{}",
   replace_general_range_plain_text:(_o:unknown,input:string)=>{const r=JSON.parse(input) as {selection:Range;text:string;prefix:string};if(!r.prefix)throw Error("prefix");return replace("replace_general_range_plain_text",r.selection,r.text);}}:{}),
 };
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner),errors:unknown[]=[];
 const host=document.createElement("div");document.body.append(host);
 const dom=new SharedDomEditor(host,{core,toolbar:[],onError:e=>errors.push(e)});
 const panel=document.createElement("aside");document.body.append(panel);
 const peer=async(edit:Remote)=>{await core.receiveFrame(JSON.stringify(edit));await settle();};
 return {core,dom,panel,calls,errors,peer,undo:()=>core.undo(core.view().revision),text:(id:string)=>blocks.get(id)?.text,has:(id:string)=>blocks.has(id),
  select:(s:RichSelection)=>dom.select(s,false),setReadOnly:(value:boolean)=>core.setReadOnly(value,core.view().revision)};
}
const settle=async()=>{for(let i=0;i<4;i++)await Promise.resolve();};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});

describe("shared AI rewrite",()=>{
 it("Accept is one guarded native replacement, one history group, with the current revision",async()=>{
  const f=owner(),requests:unknown[]=[];
  const host=sharedAiToolsHost(f.dom);expect(host.aiStaleScope).toBe("target");expect(host.aiState()).toMatchObject({revision:"1",readOnly:false,busy:false});
  const tools=mountSharedAiTools(f.panel,f.dom,{provider:request=>{requests.push({text:request.text,segments:request.segments,scope:request.scope});return {text:"Hello world"};}});
  const review=await tools.requestRewrite({scope:"block",instruction:"fix spelling",block:"a"});
  expect(review).toMatchObject({original:"Hello wrold",proposed:"Hello world",format:"text"});
  // Only the scoped block left the page: no other participant's text, ids beyond the block, or identity.
  expect(requests).toEqual([{text:"Hello wrold",segments:[{block:"a",start:0,end:11,text:"Hello wrold"}],scope:"block"}]);
  const depth=f.core.view().undoDepth,revision=f.core.view().revision;
  expect(tools.accept()).toBe("content");
  expect(f.calls).toEqual([{method:"replace_plain_text",selection:range("a",0,"a",11),text:"Hello world",revision}]);
  expect(f.core.view().undoDepth).toBe(depth+1);expect(f.text("a")).toBe("Hello world");expect(tools.state().phase).toBe("applied");
  f.undo();expect(f.text("a")).toBe("Hello wrold");expect(f.errors).toEqual([]);tools.dispose();
 });
 it("a peer's edit elsewhere (while pending and during review) does not stale an untouched target",async()=>{
  const f=owner(),answer=deferred<{text:string}>(),stale=vi.fn();
  const tools=mountSharedAiTools(f.panel,f.dom,{provider:()=>answer.promise,onStale:stale});
  f.select(range("a",6,"a",11));
  const pending=tools.requestRewrite({scope:"selection",instruction:"spelling"});
  await f.peer({kind:"text",block:"b",text:"Second block, edited by a peer"});
  answer.resolve({text:"world"});expect(await pending).toMatchObject({original:"wrold",proposed:"world"});
  expect(tools.state().phase).toBe("review");
  await f.peer({kind:"insert",after:"b",block:"d",text:"Peer paragraph"});await f.peer({kind:"bold",block:"c"});
  expect(tools.state().phase).toBe("review");expect(stale).not.toHaveBeenCalled();
  const revision=f.core.view().revision;tools.accept();
  expect(f.calls).toEqual([{method:"replace_plain_text",selection:range("a",6,"a",11),text:"world",revision}]);
  expect(f.text("a")).toBe("Hello world");expect(f.text("b")).toBe("Second block, edited by a peer");expect(f.text("d")).toBe("Peer paragraph");
  // Undo reverts only this writer's replacement; the peers' edits stay.
  f.undo();expect(f.text("a")).toBe("Hello wrold");expect(f.text("b")).toBe("Second block, edited by a peer");expect(f.errors).toEqual([]);
 });
 it("a peer's edit inside the target stales the review (during review or while pending); nothing is applied",async()=>{
  const f=owner(),stale=vi.fn();
  const tools=mountSharedAiTools(f.panel,f.dom,{provider:()=>({text:"Hello world"}),onStale:stale});
  await tools.requestRewrite({scope:"block",instruction:"x",block:"a"});
  f.select(range("c",1,"c",1));await settle();expect(tools.state().phase).toBe("review");// selection-only: still valid
  await f.peer({kind:"text",block:"a",text:"Hello wrold!"});
  expect(tools.state().phase).toBe("stale");expect(stale).toHaveBeenCalledTimes(1);
  expect(()=>tools.accept()).toThrow();expect(f.calls).toEqual([]);
  expect(f.panel.querySelector<HTMLButtonElement>('[data-ai-action="accept"]')!.hidden).toBe(true);
  // A peer formatting the target also counts (content and structure, not just text).
  await tools.rerun();expect(tools.state().phase).toBe("review");
  await f.peer({kind:"bold",block:"a"});expect(tools.state().phase).toBe("stale");
  // While pending: the answer arrives into an already-changed target.
  const answer=deferred<{text:string}>(),again=mountSharedAiTools(document.body.appendChild(document.createElement("aside")),f.dom,{provider:()=>answer.promise});
  const pending=again.requestRewrite({scope:"block",instruction:"x",block:"a"});
  await f.peer({kind:"text",block:"a",text:"Changed"});answer.resolve({text:"Hello world"});await pending;
  expect(again.state().phase).toBe("stale");expect(f.calls).toEqual([]);
 });
 it("a multi-block target stales when a peer inserts a block between its endpoints",async()=>{
  const f=owner(),tools=mountSharedAiTools(f.panel,f.dom,{provider:()=>({text:"Joined"})});
  f.select(range("a",6,"b",6));
  expect(await tools.requestRewrite({scope:"selection",instruction:"x"})).toMatchObject({original:"wrold\nSecond"});
  await f.peer({kind:"text",block:"c",text:"Elsewhere"});expect(tools.state().phase).toBe("review");
  await f.peer({kind:"insert",after:"a",block:"between",text:"Peer"});expect(tools.state().phase).toBe("stale");expect(f.calls).toEqual([]);
 });
 it("general-v1 owners use native general range plain input; formatted output is refused",async()=>{
  const f=owner({general:true}),tools=mountSharedAiTools(f.panel,f.dom,{provider:()=>({text:"Hi"})});
  await tools.requestRewrite({scope:"block",instruction:"x",block:"c"});tools.accept();
  expect(f.calls.map(c=>[c.method,c.text])).toEqual([["replace_general_range_plain_text","Hi"]]);expect(f.text("c")).toBe("Hi");tools.dispose();
  expect(()=>mountSharedAiTools(f.panel,f.dom,{interchange:{} as never})).toThrow("not offered for shared editors");
  const markdown=mountSharedAiTools(f.panel,f.dom,{provider:()=>({markdown:"**Hi**"})});
  expect(await markdown.requestRewrite({scope:"block",instruction:"x",block:"c"})).toBeNull();expect(markdown.state().phase).toBe("failed");
  expect(f.calls).toHaveLength(1);
 });
 it("read-only shared owners never send or apply a rewrite",async()=>{
  const f=owner({readOnly:true}),provider=vi.fn(()=>({text:"x"})),tools=mountSharedAiTools(f.panel,f.dom,{provider});
  await expect(tools.requestRewrite({scope:"block",instruction:"x",block:"a"})).rejects.toThrow();
  expect(provider).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
 });
 it("cancel, supersede and dispose abort the provider; late answers never apply",async()=>{
  const f=owner(),signals:AbortSignal[]=[],answers:((value:{text:string})=>void)[]=[];
  const tools=mountSharedAiTools(f.panel,f.dom,{provider:({signal})=>{signals.push(signal);return new Promise(resolve=>{answers.push(resolve);});}});
  const first=tools.requestRewrite({scope:"block",instruction:"x",block:"a"});tools.cancel();
  expect(await first).toBeNull();expect(signals[0]!.aborted).toBe(true);expect(tools.state().phase).toBe("cancelled");
  answers[0]!({text:"late"});await settle();expect(tools.state().review).toBeNull();
  const second=tools.requestRewrite({scope:"block",instruction:"x",block:"a"}),third=tools.requestRewrite({scope:"block",instruction:"y",block:"b"});
  expect(signals[1]!.aborted).toBe(true);expect(await second).toBeNull();
  tools.dispose();expect(signals[2]!.aborted).toBe(true);expect(await third).toBeNull();
  expect(f.calls).toEqual([]);expect(f.text("a")).toBe("Hello wrold");
 });
});

describe("shared language check",()=>{
 it("drops issues only in blocks a peer changed and applies a suggestion as one guarded replacement",async()=>{
  const f=owner(),check=mountSharedLanguageCheck(f.panel,f.dom,{decorations:false,reveal:false,provider:({segments})=>{
   expect(segments.map(s=>s.block)).toEqual(["a","b","c"]);
   return [{range:{block:"a",start:6,end:11},message:"Spelling",suggestions:["world"],kind:"spelling"},{range:{block:"b",start:7,end:11},message:"Spelling",suggestions:["block"],kind:"spelling"}];}});
  const issues=(await check.check({scope:"document"}))!;expect(issues.map(i=>i.block)).toEqual(["a","b"]);
  await f.peer({kind:"text",block:"a",text:"Hello wrold, says a peer"});
  expect(check.issues().map(i=>i.block)).toEqual(["b"]);
  await f.peer({kind:"text",block:"c",text:"Third, edited"});expect(check.issues().map(i=>i.block)).toEqual(["b"]);
  const revision=f.core.view().revision;check.applySuggestion(check.issues()[0]!.key,0);
  expect(f.calls).toEqual([{method:"replace_plain_text",selection:range("b",7,"b",11),text:"block",revision}]);
  expect(f.text("b")).toBe("Second block");f.undo();expect(f.text("b")).toBe("Second blok");expect(f.text("a")).toBe("Hello wrold, says a peer");
  check.dispose();
 });
 it("read-only owners can check and review but never apply",async()=>{
  // Default decorations: the overlay is a separate layer; the shared editing surface is never wrapped.
  const f=owner({readOnly:true}),check=mountSharedLanguageCheck(f.panel,f.dom,{provider:()=>[{range:{block:"a",start:6,end:11},message:"Spelling",suggestions:["world"]}]});
  const before=f.dom.surface.innerHTML;
  const [issue]=(await check.check({scope:"document"}))!;expect(issue).toBeDefined();
  expect(document.querySelector("[data-language-overlay]")).not.toBeNull();expect(f.dom.surface.innerHTML).toBe(before);
  expect(()=>check.applySuggestion(issue!.key,0)).toThrow();expect(f.calls).toEqual([]);
  check.dispose();expect(document.querySelector("[data-language-overlay]")).toBeNull();expect(f.errors).toEqual([]);
 });
 it("cancellation aborts the provider and leaves no issues",async()=>{
  const f=owner(),signals:AbortSignal[]=[],check=mountSharedLanguageCheck(f.panel,f.dom,{decorations:false,provider:({signal})=>{signals.push(signal);return new Promise(()=>{});}});
  const pending=check.check({scope:"document"});check.cancel();expect(await pending).toBeNull();expect(signals[0]!.aborted).toBe(true);expect(check.state().phase).toBe("cancelled");
 });
});

describe("target binding",()=>{
 it("covers the target region and its ancestor chain, not the rest of the document",()=>{
  const doc=(a:string,b:string,extra?:object)=>JSON.stringify({root:{kind:"element",type:"breditor/document",properties:{},children:[
   {kind:"element",type:"breditor/blockquote",properties:{"breditor/block-id":"q"},children:[{kind:"element",type:"breditor/paragraph",properties:{"breditor/block-id":"a"},children:[{kind:"text",text:a,formats:[]}]}]},
   ...(extra?[extra]:[]),{kind:"element",type:"breditor/paragraph",properties:{"breditor/block-id":"b"},children:[{kind:"text",text:b,formats:[]}]}]}});
  const key=aiTargetKey(doc("x","y"),[{block:"a"}]);expect(key).not.toBeNull();
  expect(aiTargetKey(doc("x","changed"),[{block:"a"}])).toBe(key);
  expect(aiTargetKey(doc("x!","y"),[{block:"a"}])).not.toBe(key);
  expect(aiTargetKey(doc("x","y"),[{block:"missing"}])).toBeNull();
  const span=aiTargetKey(doc("x","y"),[{block:"a"},{block:"b"}]);
  expect(aiTargetKey(doc("x","y",{kind:"element",type:"breditor/horizontal-rule",properties:{"breditor/block-id":"hr"},children:[]}),[{block:"a"},{block:"b"}])).not.toBe(span);
 });
});

describe("SDK shared session wiring and React",()=>{
 let root:Root,container:HTMLDivElement;
 beforeEach(()=>{container=document.createElement("div");document.body.append(container);root=createRoot(container);});
 afterEach(async()=>{await act(async()=>root.unmount());});
 it("mounts from a session's aiTools() port, routes callbacks and aborts on retirement",async()=>{
  const f=owner(),session={aiTools:()=>sharedAiToolsHost(f.dom)},ref=createRef<BreditorSharedAiToolsHandle>(),signals:AbortSignal[]=[],applied=vi.fn();
  expect(()=>mountSharedAiTools(f.panel,{aiTools:()=>({...sharedAiToolsHost(f.dom),aiStaleScope:"document"})})).toThrow("shared AI tools port");
  await act(async()=>root.render(<BreditorSharedAiTools ref={ref} editor={session} onApply={applied} initialOptions={{provider:({signal})=>{signals.push(signal);return {text:"Hello world"};}}}/>));
  expect(container.querySelectorAll("[data-breditor-ai]")).toHaveLength(1);
  await act(async()=>{await ref.current!.requestRewrite({scope:"block",instruction:"x",block:"a"});});
  act(()=>{ref.current!.accept();});expect(applied).toHaveBeenCalledWith("content");expect(f.text("a")).toBe("Hello world");
  const hang={aiTools:()=>sharedAiToolsHost(f.dom)};
  await act(async()=>root.render(<BreditorSharedAiTools ref={ref} editor={hang} initialOptions={{provider:({signal})=>{signals.push(signal);return new Promise(()=>{});}}}/>));
  void ref.current!.requestRewrite({scope:"block",instruction:"x",block:"b"});
  await act(async()=>root.render(<BreditorSharedAiTools ref={ref} editor={null}/>));expect(signals.at(-1)!.aborted).toBe(true);expect(ref.current!.getTools()).toBeNull();
  const lang=createRef<BreditorSharedLanguageCheckHandle>();
  await act(async()=>root.render(<BreditorSharedLanguageCheck ref={lang} editor={session} initialOptions={{decorations:false,provider:()=>[]}}/>));
  expect(await lang.current!.check({scope:"document"})).toEqual([]);expect(f.calls).toHaveLength(1);expect(f.errors).toEqual([]);
 });
});
