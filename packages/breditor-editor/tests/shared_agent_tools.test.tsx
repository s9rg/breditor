import {afterEach,describe,expect,it,vi} from "vitest";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {createSharedAgentTools,sharedAgentCommands,sharedAgentToolsHost} from "../../breditor-collaboration/src/ai_agent_tools.js";
import type {SharedRustOwner,RichSelection,SharedDispatch,SharedCommand} from "../../breditor-collaboration/src/types.js";
import type {SharedDocumentSuggestionDraft} from "../../breditor-collaboration/src/suggestion_types.js";
import type {RichAgentToolResult} from "../../breditor-experimental-rich-content/src/ai_agent_tools.js";
import {agentToolsHost,createAgentTools} from "../src/ai_tools.js";

/**
 * Fake exclusive native shared owner under the real `SharedRichEditor` + `SharedDomEditor`: it interprets the shared
 * semantic commands the agent port emits, keeps one history group per dispatch (as Rust's `apply_with_state` does),
 * never undoes peers' edits and records every dispatch. Real Rust/Wasm convergence is covered by
 * experiments/shared-browser/ai-agent-shared.spec.mjs.
 */
interface Block {id:string;text:string;bold:boolean;level:number|null}
function owner(){
 let revision=1,selection:RichSelection|null=null,blocks:Block[]=[{id:"a",text:"Hello world",bold:false,level:null},{id:"b",text:"Second",bold:false,level:null},{id:"c",text:"Third",bold:false,level:null}];
 const undo:Block[][]=[],dispatches:SharedDispatch[]=[];
 const node=(b:Block)=>({kind:"element",type:b.level===null?"breditor/paragraph":"breditor/heading",entityId:null,properties:{"breditor/block-id":b.id,...(b.level===null?{}:{"breditor/level":b.level})},children:b.text?[{kind:"text",text:b.text,formats:b.bold?[{type:"breditor/strong",properties:{}}]:[]}]:[]});
 const documentJson=()=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/shared-agent",version:1},schemaFingerprint:"fixture",root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:blocks.map(node)}});
 const view=()=>({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),documentJson:documentJson(),selection,pendingFormatsJson:null,undoDepth:undo.length,redoDepth:0,historyCapacity:100,grid:null,tables:[],selectionOutcome:{kind:"kept"},causalVersion:"{}"});
 const find=(id:string)=>{const b=blocks.find(b=>b.id===id);if(!b)throw Error(`missing ${id}`);return b;};
 const apply=(command:SharedCommand)=>{
  const d=command.data as Record<string,any>;
  switch(command.kind){
   case "delete_text":{const b=find(d.block);b.text=b.text.slice(0,d.offset)+b.text.slice(d.offset+d.length);break;}
   case "insert_text":{const b=find(d.block);if(d.offset>b.text.length)throw Error("offset");b.text=b.text.slice(0,d.offset)+d.text+b.text.slice(d.offset);break;}
   case "set_format":find(d.block).bold=d.enabled;break;
   case "set_heading":find(d.block).level=d.level;break;
   case "insert_blocks":{const at=d.before===null?blocks.length:blocks.findIndex(b=>b.id===d.before);blocks.splice(at,0,...d.nodes.map((n:any)=>({id:n.properties["breditor/block-id"],text:n.children[0]?.text??"",bold:false,level:n.properties["breditor/level"]??null})));break;}
   case "delete_block":find(d.block);blocks=blocks.filter(b=>b.id!==d.block);break;
   default:throw Error(`unexpected ${command.kind}`);
  }
 };
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),
  observe:()=>({view_json:()=>JSON.stringify(view()),free:()=>{}}),free:vi.fn(),
  read_only_version:()=>"1",set_read_only:()=>{revision++;return true;},
  set_selection:(_o:unknown,json:string)=>{selection=JSON.parse(json) as RichSelection;revision++;return true;},
  dispatch:vi.fn((_o:unknown,json:string)=>{
   const request=JSON.parse(json) as SharedDispatch,before=blocks.map(b=>({...b}));
   try{for(const command of request.commands)apply(command);}catch(error){blocks=before;throw error;}
   dispatches.push(request);undo.push(before);revision++;return true;
  }),
  undo_observed:()=>{const previous=undo.pop();if(!previous)return false;blocks=previous;revision++;return true;},
  receive_frame:(frame:string)=>{const edit=JSON.parse(frame) as {block:string;text:string};find(edit.block).text=edit.text;revision++;},
 };
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner),errors:unknown[]=[];
 const host=document.createElement("div");document.body.append(host);
 const dom=new SharedDomEditor(host,{core,toolbar:[],onError:e=>errors.push(e)});
 return {core,dom,dispatches,errors,raw,undo:()=>core.undo(core.view().revision),text:(id:string)=>find(id).text,block:find,ids:()=>blocks.map(b=>b.id),
  peer:async(block:string,text:string)=>{await core.receiveFrame(JSON.stringify({block,text}));for(let i=0;i<4;i++)await Promise.resolve();}};
}
const ok=(result:RichAgentToolResult)=>{if(!result.ok)throw Error(`${result.error.code}: ${result.error.message}`);return result.result as Record<string,any>;};
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});

describe("shared agent tools",()=>{
 it("lowers plans to shared semantic commands",()=>{
  expect(sharedAgentCommands({steps:[
   {kind:"replaceText",block:"a",start:6,end:11,text:"there"},{kind:"replaceText",block:"a",start:0,end:0,text:"Oh, "},{kind:"replaceText",block:"b",start:0,end:2,text:""},
   {kind:"setFormat",block:"a",start:0,end:5,format:"breditor/strong",enabled:true},{kind:"setHeading",block:"b",level:2},
   {kind:"insertBlocks",parent:{block:"li",kind:"listItem"},before:"x",blocks:[{block:"n",level:3,text:"T"},{block:"m",level:null,text:""}]},{kind:"deleteBlock",block:"c"}]})).toEqual([
   {kind:"delete_text",data:{block:"a",offset:6,length:5}},{kind:"insert_text",data:{block:"a",offset:6,text:"there"}},
   {kind:"insert_text",data:{block:"a",offset:0,text:"Oh, "}},{kind:"delete_text",data:{block:"b",offset:0,length:2}},
   {kind:"set_format",data:{block:"a",offset:0,length:5,format:{type:"breditor/strong",properties:{}},enabled:true}},
   {kind:"set_heading",data:{block:"b",level:2}},
   {kind:"insert_blocks",data:{parent:"li",before:"x",nodes:[
    {kind:"element",type:"breditor/heading",entityId:null,properties:{"breditor/block-id":"n","breditor/level":3},children:[{kind:"text",text:"T",formats:[]}]},
    {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"m"},children:[]}]}},
   {kind:"delete_block",data:{block:"c"}}]);
 });
 it("an accepted staged change is ONE guarded dispatch (one history group) with the verified revision",async()=>{
  const f=owner();const tools=createSharedAgentTools(f.dom);
  const {revision}=ok(await tools.call("get_document",{}));
  ok(await tools.call("replace_range",{revision,block:"a",start:6,end:11,text:"there"}));
  ok(await tools.call("set_format",{revision,block:"a",start:0,end:5,format:"bold",enabled:true}));
  ok(await tools.call("insert_blocks",{revision,after:"a",blocks:[{type:"heading",level:2,text:"New"}]}));
  ok(await tools.call("delete_blocks",{revision,blocks:["c"]}));
  expect(f.raw.dispatch).not.toHaveBeenCalled();
  const depth=f.core.view().undoDepth;
  expect(tools.accept()).toBe("content");
  expect(f.raw.dispatch).toHaveBeenCalledTimes(1);expect(f.core.view().undoDepth).toBe(depth+1);
  expect(f.dispatches[0]!.commands.map(c=>c.kind)).toEqual(["delete_text","insert_text","set_format","insert_blocks","delete_block"]);
  expect(f.text("a")).toBe("Hello there");expect(f.block("a").bold).toBe(true);expect(f.ids()).toEqual(["a",expect.stringMatching(/^br:agent:/),"b"]);
  f.undo();expect(f.ids()).toEqual(["a","b","c"]);expect(f.text("a")).toBe("Hello world");expect(f.errors).toEqual([]);
 });
 it("a peer's edit elsewhere keeps the review valid; a peer edit in the target stales it",async()=>{
  const f=owner();const tools=createSharedAgentTools(f.dom);
  ok(await tools.call("replace_range",{revision:"1",block:"a",start:0,end:5,text:"Howdy"}));
  await f.peer("c","Peer edited");
  expect(tools.review()!.stale).toBe(false);
  // An edit from the old revision is re-based: its target is unchanged.
  expect(ok(await tools.call("set_block_type",{revision:"1",block:"b",type:"heading",level:1})).status).toBe("staged");
  expect(tools.accept()).toBe("content");expect(f.text("a")).toBe("Howdy world");expect(f.text("c")).toBe("Peer edited");
  ok(await tools.call("replace_range",{revision:f.core.view().revision,block:"a",start:0,end:5,text:"Hi"}));
  await f.peer("a","Peer rewrote this");
  expect(tools.review()!.stale).toBe(true);expect(()=>tools.accept()).toThrow(/changed/);expect(f.raw.dispatch).toHaveBeenCalledTimes(1);
  expect((await tools.call("replace_range",{revision:"1",block:"a",start:0,end:1,text:"x"})).ok).toBe(false);
 });
 it("direct mode dispatches each call; a native refusal publishes nothing",async()=>{
  const f=owner();const tools=createSharedAgentTools(f.dom,{mode:"direct"});
  expect(ok(await tools.call("delete_blocks",{revision:"1",blocks:["b"]})).status).toBe("applied");
  expect(f.ids()).toEqual(["a","c"]);
  f.raw.dispatch.mockImplementationOnce(()=>{throw Error("native refusal");});
  const refused=await tools.call("replace_range",{revision:f.core.view().revision,block:"a",start:0,end:1,text:"J"});
  expect(refused).toMatchObject({ok:false,error:{code:"native_refused"}});expect(f.text("a")).toBe("Hello world");
 });
 it("files reviewable changes as native suggestion proposals when a queue is given",async()=>{
  const f=owner(),proposed:{title:string;createdAtMs:string;draft:SharedDocumentSuggestionDraft}[]=[];
  const queue={propose:(title:string,createdAtMs:string,draft:SharedDocumentSuggestionDraft)=>{proposed.push({title,createdAtMs,draft});return {id:`s${proposed.length}`};}};
  const tools=createSharedAgentTools(f.dom,{proposals:queue,now:()=>1700000000000,proposalTitle:"Assistant"});
  expect(ok(await tools.call("propose_changes",{revision:"1",title:"Fix greeting",edits:[{tool:"replace_range",block:"a",start:6,end:11,text:"there"},{tool:"set_block_type",block:"c",type:"heading",level:3}]}))).toMatchObject({status:"proposed",proposal:"s1"});
  expect(proposed).toEqual([{title:"Fix greeting",createdAtMs:"1700000000000",draft:{scope:"commands",edit:{kind:"commands",data:[
   {kind:"delete_text",data:{block:"a",offset:6,length:5}},{kind:"insert_text",data:{block:"a",offset:6,text:"there"}},{kind:"set_heading",data:{block:"c",level:3}}]}}}]);
  expect(f.raw.dispatch).not.toHaveBeenCalled();expect(f.text("a")).toBe("Hello world");
  // The SDK session port is the same adapter.
  expect(sharedAgentToolsHost(f.dom,{proposals:queue}).proposeAgentPlan).toBeTypeOf("function");
 });
});

describe("local SDK agent port",()=>{
 it("borrows a local editor and probes the native command group",()=>{
  const executed:unknown[]=[];let revision="3";
  const editor={surface:document.createElement("div"),search:()=>({searchState:()=>({revision,closed:false,busy:false,composing:false,readOnly:false}),subscribeSearch:()=>()=>{}}) as never,
   view:()=>({revision,documentJson:JSON.stringify({root:{kind:"element",type:"breditor/document",properties:{},children:[{kind:"element",type:"breditor/paragraph",properties:{"breditor/block-id":"a"},children:[{kind:"text",text:"Hi",formats:[]}]}]}}),selection:null}) as never,
   execute:(command:unknown,_focus?:boolean,rev?:string)=>{executed.push({command,rev});revision="4";return "content" as const;},focus:()=>{},supportsCommandGroup:()=>true};
  const host=agentToolsHost(editor);
  host.applyAgentPlan({steps:[{kind:"setHeading",block:"a",level:1},{kind:"deleteBlock",block:"a"}]},"3");
  expect(executed).toEqual([{command:{kind:"commandGroup",data:{commands:[{kind:"setHeading",block:"a",level:1},{kind:"replaceBlocks",data:{first:"a",last:"a",blocks:[]}}]}},rev:"3"}]);
  expect(createAgentTools(editor).definitions.length).toBe(9);
 });
});
