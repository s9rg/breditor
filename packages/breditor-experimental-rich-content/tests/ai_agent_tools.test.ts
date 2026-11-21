// @vitest-environment jsdom
import {describe,expect,it,vi} from "vitest";
import {createRichAgentTools,richAgentCommands,richAgentToolsHost,richAgentToolDefinitions,type RichAgentPlan,type RichAgentStep,type RichAgentToolsHost,type RichAgentToolResult,type RichAgentTools,type RichAgentEditorPort} from "../src/ai_agent_tools.js";
import {mountRichAgentReview,richAgentMcpAdapter} from "../src/ai_agent_review.js";
import type {RichCommand,RichSelection} from "../src/core.js";

/**
 * Deterministic stand-in for a native owner behind the agent port: root-level paragraphs/headings with per-character
 * formats, an exact revision guard (every publication bumps the revision), one undo snapshot per applied plan and
 * all-or-nothing plan application. The real Wasm owner is exercised by experiments/rich-browser/ai-agent-tools.spec.mjs.
 */
type Char={ch:string;formats:readonly string[]};
interface Block {id:string;type:"breditor/paragraph"|"breditor/heading";level?:number;chars:Char[]}
function fakeHost(initial:readonly (readonly [string,string])[],options:{proposals?:boolean}={}){
 let blocks:Block[]=initial.map(([id,text])=>({id,type:"breditor/paragraph",chars:[...text].flatMap(ch=>ch.length===2?[{ch,formats:[]}]:[{ch,formats:[]}])}));
 let revision=1,selection:RichSelection|null=null,readOnly=false,busy=false,counter=0;
 const listeners=new Set<()=>void>(),plans:RichAgentPlan[]=[],undo:Block[][]=[],proposals:{plan:RichAgentPlan;title:string;revision:string}[]=[];
 const clone=(value:Block[])=>value.map(b=>({...b,chars:b.chars.map(c=>({...c}))}));
 const text=(b:Block)=>b.chars.map(c=>c.ch).join("");
 const runs=(b:Block)=>{const out:{kind:"text";text:string;formats:{type:string;properties:{}}[]}[]=[];for(const c of b.chars){const last=out[out.length-1],key=c.formats.join(",");if(last&&last.formats.map(f=>f.type).join(",")===key)last.text+=c.ch;else out.push({kind:"text",text:c.ch,formats:c.formats.map(type=>({type,properties:{}}))});}return out;};
 const documentJson=()=>JSON.stringify({format:"breditor/document",formatVersion:2,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children:blocks.map(b=>({kind:"element",type:b.type,entityId:null,properties:{"breditor/block-id":b.id,...(b.type==="breditor/heading"?{"breditor/level":b.level}:{})},children:runs(b)}))}});
 const notify=()=>{for(const l of [...listeners])l();};
 const find=(id:string)=>{const b=blocks.find(b=>b.id===id);if(!b)throw Error(`unknown block ${id}`);return b;};
 // Character offsets: the fixture uses BMP text only for edits, so UTF-16 units equal array indices.
 const apply=(step:RichAgentStep)=>{
  switch(step.kind){
   case "replaceText":{const b=find(step.block),formats=(step.start===step.end?b.chars[step.start-1]??b.chars[step.start]:b.chars[step.start])?.formats??[];b.chars.splice(step.start,step.end-step.start,...[...step.text].map(ch=>({ch,formats})));break;}
   case "setFormat":{const b=find(step.block);for(let i=step.start;i<step.end;i++){const c=b.chars[i]!;const without=c.formats.filter(f=>f!==step.format);c.formats=step.enabled?[...without,step.format].sort():without;}break;}
   case "setHeading":{const b=find(step.block);if(step.level===null&&b.type==="breditor/paragraph")throw Error("unchanged");b.type=step.level===null?"breditor/paragraph":"breditor/heading";if(step.level===null)delete b.level;else b.level=step.level;break;}
   case "insertBlocks":{const at=step.before===null?blocks.length:blocks.findIndex(b=>b.id===step.before);if(at<0)throw Error("unknown before");blocks.splice(at,0,...step.blocks.map(n=>({id:n.block,type:n.level===null?"breditor/paragraph" as const:"breditor/heading" as const,...(n.level===null?{}:{level:n.level}),chars:[...n.text].map(ch=>({ch,formats:[] as string[]}))})));break;}
   case "deleteBlock":{find(step.block);blocks=blocks.filter(b=>b.id!==step.block);if(!blocks.length)throw Error("empty document");break;}
  }
 };
 const host:RichAgentToolsHost={
  agentKind:"local",
  agentState:()=>({revision:String(revision),closed:false,busy,composing:false,readOnly}),
  subscribeAgent:l=>{listeners.add(l);return()=>listeners.delete(l);},
  agentView:()=>({revision:String(revision),documentJson:documentJson(),selection,readOnly}),
  applyAgentPlan:vi.fn((plan:RichAgentPlan,expected:string)=>{
   if(expected!==String(revision))throw Object.assign(Error("The command was prepared from an older rich view"),{code:"breditor_rich.stale_observation"});
   const before=clone(blocks);
   try{for(const step of plan.steps)apply(step);}catch(error){blocks=before;throw error;}
   plans.push(plan);undo.push(before);revision++;notify();return "content" as const;
  }),
  allocateAgentBlock:()=>`agent-${counter++}`,
  ...(options.proposals?{proposeAgentPlan:(plan:RichAgentPlan,title:string,rev:string)=>{proposals.push({plan,title,revision:rev});return `s${proposals.length}`;}}:{}),
 };
 return {host,plans,proposals,text:(id:string)=>text(find(id)),ids:()=>blocks.map(b=>b.id),block:find,
  revision:()=>String(revision),
  undo(){const prev=undo.pop();if(!prev)return;blocks=prev;revision++;notify();},
  peerEdit(id:string,value:string){const b=find(id);b.chars=[...value].map(ch=>({ch,formats:[]}));revision++;notify();},
  moveCaret(id:string,offset:number){selection={kind:"text",anchor:{block:id,offset:String(offset),affinity:"after"},focus:{block:id,offset:String(offset),affinity:"after"}};revision++;notify();},
  select(id:string,start:number,end:number){selection={kind:"text",anchor:{block:id,offset:String(start),affinity:"after"},focus:{block:id,offset:String(end),affinity:"after"}};revision++;notify();},
  setReadOnly(value:boolean){readOnly=value;revision++;notify();},
  setBusy(value:boolean){busy=value;}};
}
const ok=(result:RichAgentToolResult)=>{if(!result.ok)throw Error(`${result.error.code}: ${result.error.message}`);return result.result as Record<string,any>;};
const fail=(result:RichAgentToolResult)=>{if(result.ok)throw Error(`expected failure, got ${JSON.stringify(result.result)}`);return result.error;};
const doc=[["a","Hello world"],["b","Second paragraph"],["c","Third"]] as const;

describe("agent tool definitions",()=>{
 it("are closed, bounded JSON Schemas suitable for function calling",()=>{
  expect(richAgentToolDefinitions.map(d=>d.name)).toEqual(["get_document","get_selection","find_text","replace_range","set_format","insert_blocks","delete_blocks","set_block_type","propose_changes"]);
  const check=(schema:any,path:string):void=>{
   if(schema.oneOf){schema.oneOf.forEach((s:any,i:number)=>check(s,`${path}/${i}`));return;}
   if(schema.type==="object"){expect(schema.additionalProperties,path).toBe(false);for(const [k,v] of Object.entries(schema.properties??{}))check(v,`${path}.${k}`);}
   if(schema.type==="array"){expect(schema.maxItems,path).toBeGreaterThan(0);check(schema.items,`${path}[]`);}
   if(schema.type==="string"&&!schema.enum&&!schema.const)expect(schema.maxLength,path).toBeGreaterThan(0);
  };
  for(const d of richAgentToolDefinitions){check(d.inputSchema,d.name);expect(JSON.parse(JSON.stringify(d.inputSchema))).toEqual(d.inputSchema);expect(Object.isFrozen(d.inputSchema)).toBe(true);}
  expect(richAgentToolDefinitions.filter(d=>d.mutates).map(d=>d.name)).toEqual(["replace_range","set_format","insert_blocks","delete_blocks","set_block_type","propose_changes"]);
 });
});

describe("reads",()=>{
 it("returns bounded chunks with block ids, types, formats and the revision",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host);
  f.block("a").chars.slice(0,5).forEach(c=>{c.formats=["breditor/strong"];});
  const first=ok(await tools.call("get_document",{maxBlocks:2}));
  expect(first.revision).toBe("1");expect(first.totalBlocks).toBe(3);expect(first.nextCursor).toBe("2");
  expect(first.blocks[0]).toEqual({id:"a",type:"paragraph",text:"Hello world",formats:[{start:0,end:5,formats:["bold"]}]});
  const rest=ok(await tools.call("get_document",JSON.stringify({cursor:first.nextCursor})));
  expect(rest.blocks.map((b:any)=>b.id)).toEqual(["c"]);expect(rest.nextCursor).toBeNull();
  const small=createRichAgentTools(f.host,{maxReadBytes:64});
  const chunk=ok(await small.call("get_document",{}));expect(chunk.blocks).toHaveLength(1);expect(chunk.nextCursor).toBe("1");
  expect(fail(await tools.call("get_document",{cursor:"99"})).code).toBe("invalid_arguments");
 });
 it("finds text and reads the selection",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host);
  const found=ok(await tools.call("find_text",{query:"PARAGRAPH"}));
  expect(found.matches).toEqual([{block:"b",start:7,end:16,context:"Second paragraph"}]);
  expect(ok(await tools.call("find_text",{query:"PARAGRAPH",caseSensitive:true})).matches).toEqual([]);
  expect(ok(await tools.call("get_selection")).selection).toBeNull();
  f.select("a",6,11);
  expect(ok(await tools.call("get_selection",{}))).toEqual({revision:"2",selection:{kind:"text",anchor:{block:"a",offset:6},focus:{block:"a",offset:11},text:"world"}});
 });
});

describe("untrusted arguments",()=>{
 it("are refused by the schema and the document before anything is staged or applied",async()=>{
  const f=fakeHost([...doc,["e","a😀b"]]);const tools=createRichAgentTools(f.host,{formats:["bold"]});
  const r="1";
  const bad:[string,unknown,string][]=[
   ["delete_everything",{},"unknown_tool"],
   ["replace_range",{revision:r,block:"a",start:0,end:1,text:"x",extra:1},"invalid_arguments"],
   ["replace_range",{revision:r,block:"a",start:"0",end:1,text:"x"},"invalid_arguments"],
   ["replace_range",{revision:r,block:"a",start:0.5,end:1,text:"x"},"invalid_arguments"],
   ["replace_range",{revision:r,block:"a",start:0,end:1},"invalid_arguments"],
   ["replace_range","{not json","invalid_arguments"],
   ["replace_range",Object.defineProperty({revision:r,block:"a",start:0,end:1},"text",{get:()=>"x",enumerable:true}),"invalid_arguments"],
   ["replace_range",new (class{revision=r;block="a";start=0;end=1;text="x";})(),"invalid_arguments"],
   ["replace_range",{revision:r,block:"a",start:0,end:1,text:"two\nlines"},"invalid_text"],
   ["replace_range",{revision:r,block:"a",start:0,end:1,text:"bad\ud800"},"invalid_text"],
   ["replace_range",{revision:r,block:"a",start:0,end:1,text:"\u0007"},"invalid_text"],
   ["replace_range",{revision:r,block:"a",start:5,end:99,text:"x"},"invalid_range"],
   ["replace_range",{revision:r,block:"a",start:6,end:5,text:"x"},"invalid_range"],
   ["replace_range",{revision:r,block:"e",start:2,end:3,text:"x"},"invalid_range"],
   ["replace_range",{revision:r,block:"zz",start:0,end:0,text:"x"},"unknown_block"],
   ["replace_range",{revision:r,block:"a",start:0,end:5,text:"Hi",expectedText:"Howdy"},"expected_text_mismatch"],
   ["set_format",{revision:r,block:"a",start:0,end:5,format:"italic",enabled:true},"unsupported"],
   ["set_format",{revision:r,block:"a",start:0,end:5,format:"blink",enabled:true},"invalid_arguments"],
   ["set_format",{revision:r,block:"a",start:2,end:2,format:"bold",enabled:true},"invalid_range"],
   ["insert_blocks",{revision:r,after:"a",blocks:[]},"invalid_arguments"],
   ["insert_blocks",{revision:r,after:"a",blocks:[{type:"heading",text:"x"}]},"invalid_arguments"],
   ["insert_blocks",{revision:r,after:"a",blocks:Array.from({length:33},()=>({type:"paragraph",text:"x"}))},"invalid_arguments"],
   ["delete_blocks",{revision:r,blocks:["a","a"]},"invalid_arguments"],
   ["set_block_type",{revision:r,block:"a",type:"heading"},"invalid_arguments"],
   ["set_block_type",{revision:r,block:"a",type:"heading",level:7},"invalid_arguments"],
   ["propose_changes",{revision:r,title:"t",edits:[{tool:"replace_range",block:"a",start:0,end:1}]},"invalid_arguments"],
   ["propose_changes",{revision:r,title:"t",edits:[{tool:"get_document"}]},"invalid_arguments"],
   ["get_document",{nested:{a:{b:{c:{d:{e:{f:{g:{h:{}}}}}}}}}},"invalid_arguments"],
  ];
  for(const [name,args,code] of bad)expect(fail(await tools.call(name,args)).code,`${name} ${String(code)}`).toBe(code);
  expect(f.host.applyAgentPlan).not.toHaveBeenCalled();expect(tools.review()).toBeNull();
  // A JSON-string argument (as LLM APIs deliver it) is admitted like an object.
  expect(ok(await tools.call("replace_range",JSON.stringify({revision:r,block:"a",start:0,end:5,text:"Howdy",expectedText:"Hello"}))).status).toBe("staged");
 });
});

describe("review mode (default)",()=>{
 it("stages edits as one change set that Accept applies as one publication and one Undo restores",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host);const listener=vi.fn();tools.subscribe(listener);
  const {revision}=ok(await tools.call("get_document",{}));
  // Several edits in one block are all expressed against the text as read.
  expect(ok(await tools.call("replace_range",{revision,block:"a",start:0,end:5,text:"Howdy"})).status).toBe("staged");
  ok(await tools.call("replace_range",{revision,block:"a",start:6,end:11,text:"there"}));
  ok(await tools.call("set_format",{revision,block:"b",start:0,end:6,format:"bold",enabled:true}));
  ok(await tools.call("set_block_type",{revision,block:"b",type:"heading",level:2}));
  ok(await tools.call("insert_blocks",{revision,after:"b",blocks:[{type:"paragraph",text:"Inserted"},{type:"heading",level:3,text:"Title"}]}));
  expect(ok(await tools.call("delete_blocks",{revision,blocks:["c"]})).pendingEdits).toBe(6);
  expect(f.host.applyAgentPlan).not.toHaveBeenCalled();expect(f.text("a")).toBe("Hello world");
  const review=tools.review()!;
  expect(review.stale).toBe(false);expect(review.items.map(i=>i.tool)).toEqual(["replace_range","replace_range","set_format","set_block_type","insert_blocks","delete_blocks"]);
  expect(review.items[0]).toMatchObject({block:"a",before:"Hello world",after:"Howdy there"});
  expect(review.items[0]!.diff!.filter(p=>p.kind!=="same").map(p=>`${p.kind}:${p.text}`)).toEqual(["removed:Hello","added:Howdy","removed:world","added:there"]);
  expect(review.items[5]!.summary).toBe("Delete 1 block");
  expect(tools.state().phase).toBe("staged");expect(listener).toHaveBeenCalled();
  expect(tools.accept()).toBe("content");
  expect(f.host.applyAgentPlan).toHaveBeenCalledTimes(1);
  expect(f.plans[0]!.steps.map(s=>s.kind)).toEqual(["replaceText","replaceText","setFormat","setHeading","insertBlocks","deleteBlock"]);
  expect((f.plans[0]!.steps[0] as {start:number}).start).toBe(6);// later offsets first
  expect(f.ids()).toEqual(["a","b",expect.stringMatching(/^agent-/),expect.stringMatching(/^agent-/)]);
  expect(f.text("a")).toBe("Howdy there");expect(f.block("b")).toMatchObject({type:"breditor/heading",level:2});
  expect(f.block("b").chars.slice(0,6).every(c=>c.formats.includes("breditor/strong"))).toBe(true);
  expect(tools.review()).toBeNull();expect(tools.state()).toMatchObject({phase:"applied",appliedRevision:"2"});
  f.undo();expect(f.ids()).toEqual(["a","b","c"]);expect(f.text("a")).toBe("Hello world");
 });
 it("orders a format and an insertion at one offset so the format covers only the original text",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host);
  ok(await tools.call("replace_range",{revision:"1",block:"a",start:6,end:6,text:"big "}));
  ok(await tools.call("set_format",{revision:"1",block:"a",start:6,end:11,format:"bold",enabled:true}));
  tools.accept();
  expect(f.text("a")).toBe("Hello big world");
  expect(f.block("a").chars.map(c=>c.formats.length?"B":".").join("")).toBe("..........BBBBB");
 });
 it("refuses overlapping or contradictory edits within one change set",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host);
  ok(await tools.call("replace_range",{revision:"1",block:"a",start:0,end:5,text:"Hi"}));
  expect(fail(await tools.call("replace_range",{revision:"1",block:"a",start:4,end:7,text:"x"})).code).toBe("conflict");
  expect(fail(await tools.call("set_format",{revision:"1",block:"a",start:2,end:3,format:"bold",enabled:true})).code).toBe("conflict");
  expect(fail(await tools.call("replace_range",{revision:"1",block:"a",start:2,end:2,text:"x"})).code).toBe("conflict");
  ok(await tools.call("replace_range",{revision:"1",block:"a",start:5,end:5,text:"!"}));
  expect(fail(await tools.call("replace_range",{revision:"1",block:"a",start:5,end:5,text:"?"})).code).toBe("conflict");
  ok(await tools.call("delete_blocks",{revision:"1",blocks:["c"]}));
  expect(fail(await tools.call("replace_range",{revision:"1",block:"c",start:0,end:0,text:"x"})).code).toBe("conflict");
  expect(fail(await tools.call("delete_blocks",{revision:"1",blocks:["a"]})).code).toBe("conflict");
  expect(fail(await tools.call("insert_blocks",{revision:"1",after:"c",blocks:[{type:"paragraph",text:"x"}]})).code).toBe("conflict");
  expect(tools.review()!.items).toHaveLength(3);
  tools.reject();expect(tools.review()).toBeNull();expect(tools.state().phase).toBe("rejected");expect(f.host.applyAgentPlan).not.toHaveBeenCalled();
 });
 it("Accept is all or nothing: a native refusal publishes nothing and keeps the review",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host);
  ok(await tools.call("replace_range",{revision:"1",block:"a",start:0,end:5,text:"Hi"}));
  ok(await tools.call("delete_blocks",{revision:"1",blocks:["b","c"]}));
  ok(await tools.call("insert_blocks",{revision:"1",after:"a",blocks:[{type:"paragraph",text:"x"}]}));
  // The fake owner refuses the (otherwise valid) group: nothing is published.
  f.block("a").chars.length;(f.host.applyAgentPlan as any).mockImplementationOnce(()=>{throw Error("native refusal");});
  expect(()=>tools.accept()).toThrow("native refusal");
  expect(f.ids()).toEqual(["a","b","c"]);expect(f.text("a")).toBe("Hello world");expect(tools.review()!.items).toHaveLength(3);
  expect(tools.accept()).toBe("content");expect(f.ids()).toEqual(["a",expect.stringMatching(/^agent-/)]);
 });
});

describe("stale protection",()=>{
 it("re-bases edits from an older read only when every target region is unchanged",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host,{mode:"direct"});
  ok(await tools.call("get_document",{}));// revision 1 retained
  f.moveCaret("a",2);// revision 2: selection only
  f.peerEdit("c","Changed by someone else");// revision 3
  expect(ok(await tools.call("replace_range",{revision:"1",block:"a",start:0,end:5,text:"Howdy"}))).toEqual({status:"applied",revision:"4"});
  expect(f.text("a")).toBe("Howdy world");
  expect(fail(await tools.call("replace_range",{revision:"1",block:"c",start:0,end:5,text:"x"})).code).toBe("stale_target");
  // The agent's own earlier edit changed `a`, so further offsets from revision 1 are stale too.
  expect(fail(await tools.call("replace_range",{revision:"1",block:"a",start:6,end:11,text:"x"})).code).toBe("stale_target");
  expect(fail(await tools.call("replace_range",{revision:"77",block:"a",start:0,end:1,text:"x"})).code).toBe("stale_revision");
  expect(ok(await tools.call("replace_range",{revision:"4",block:"a",start:6,end:11,text:"there"})).status).toBe("applied");
  expect(f.text("a")).toBe("Howdy there");
 });
 it("only retains a bounded number of reads",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host,{readRetention:2});
  ok(await tools.call("get_document",{}));f.moveCaret("a",1);ok(await tools.call("get_selection"));f.moveCaret("a",2);ok(await tools.call("get_selection"));
  expect(fail(await tools.call("replace_range",{revision:"1",block:"a",start:0,end:1,text:"x"})).code).toBe("stale_revision");
  expect(ok(await tools.call("replace_range",{revision:"2",block:"a",start:0,end:1,text:"x"})).status).toBe("staged");
 });
 it("a staged review goes stale when its target changes, but not for edits elsewhere or caret moves",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host);
  ok(await tools.call("replace_range",{revision:"1",block:"a",start:0,end:5,text:"Hi"}));
  f.moveCaret("b",1);f.peerEdit("c","Peer text");
  expect(tools.review()!.stale).toBe(false);
  f.peerEdit("a","Peer changed the target");
  expect(tools.review()!.stale).toBe(true);expect(tools.state().phase).toBe("stale");
  expect(()=>tools.accept()).toThrow(/changed/);expect(f.host.applyAgentPlan).not.toHaveBeenCalled();
  expect(fail(await tools.call("replace_range",{revision:"4",block:"b",start:0,end:1,text:"x"})).code).toBe("conflict");
  tools.reject();
  expect(ok(await tools.call("replace_range",{revision:"4",block:"b",start:0,end:1,text:"x"})).status).toBe("staged");
 });
});

describe("modes, proposals and read-only owners",()=>{
 it("direct mode applies each call as one publication; propose_changes stays reviewable",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host,{mode:"direct"});
  expect(ok(await tools.call("insert_blocks",{revision:"1",after:null,blocks:[{type:"heading",level:1,text:"Top"}]})).status).toBe("applied");
  expect(f.ids()).toEqual([expect.stringMatching(/^agent-/),"a","b","c"]);
  expect(ok(await tools.call("propose_changes",{revision:"2",title:"Tidy",edits:[{tool:"delete_blocks",blocks:["c"]},{tool:"replace_range",block:"b",start:0,end:6,text:"2nd"}]})).status).toBe("staged");
  expect(tools.review()!.title).toBe("Tidy");expect(f.host.applyAgentPlan).toHaveBeenCalledTimes(1);
  tools.accept();expect(f.ids().slice(1)).toEqual(["a","b"]);expect(f.text("b")).toBe("2nd paragraph");
  f.setBusy(true);
  expect(fail(await tools.call("replace_range",{revision:"3",block:"a",start:0,end:1,text:"x"})).code).toBe("busy");
 });
 it("files edits as proposals when the host offers the review system",async()=>{
  const f=fakeHost(doc,{proposals:true});const tools=createRichAgentTools(f.host,{proposalTitle:"Assistant"});
  expect(ok(await tools.call("replace_range",{revision:"1",block:"a",start:0,end:5,text:"Howdy"}))).toMatchObject({status:"proposed",proposal:"s1"});
  expect(ok(await tools.call("propose_changes",{revision:"1",title:"Batch",edits:[{tool:"set_block_type",block:"b",type:"heading",level:2},{tool:"insert_blocks",after:"c",blocks:[{type:"paragraph",text:"End"}]}]})).proposal).toBe("s2");
  expect(f.proposals.map(p=>[p.title,p.revision,p.plan.steps.map(s=>s.kind)])).toEqual([["Assistant","1",["replaceText"]],["Batch","1",["setHeading","insertBlocks"]]]);
  expect(f.host.applyAgentPlan).not.toHaveBeenCalled();expect(tools.state().proposals).toEqual(["s1","s2"]);
  // Opting out of proposals stages instead.
  expect(ok(await createRichAgentTools(f.host,{useProposals:false}).call("replace_range",{revision:"1",block:"a",start:0,end:1,text:"x"})).status).toBe("staged");
 });
 it("read-only owners allow reads but refuse every edit",async()=>{
  const f=fakeHost(doc);f.setReadOnly(true);const tools=createRichAgentTools(f.host,{mode:"direct"});
  expect(ok(await tools.call("get_document",{})).blocks).toHaveLength(3);
  expect(fail(await tools.call("replace_range",{revision:"2",block:"a",start:0,end:1,text:"x"})).code).toBe("read_only");
  expect(fail(await tools.call("propose_changes",{revision:"2",title:"t",edits:[{tool:"delete_blocks",blocks:["a"]}]})).code).toBe("read_only");
 });
 it("dispose refuses further calls",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host);tools.dispose();
  expect(fail(await tools.call("get_document",{})).code).toBe("disposed");
 });
});

/**
 * Example host wiring (docs/AI_AGENT_TOOLS.md): a chat loop that offers the tool definitions to a model, executes its
 * tool calls and feeds results back until the model answers. The "model" here is a deterministic fake.
 */
interface ToolCall {id:string;name:string;arguments:string}
type Message={role:"user"|"assistant";content:string;toolCalls?:ToolCall[]}|{role:"tool";toolCallId:string;content:string};
type FakeModel=(request:{messages:readonly Message[];tools:readonly {name:string;description:string;parameters:unknown}[]})=>Promise<Extract<Message,{role:"assistant"}>>;
async function runChat(model:FakeModel,tools:RichAgentTools,prompt:string,maxTurns=8):Promise<string>{
 const messages:Message[]=[{role:"user",content:prompt}];
 const offered=tools.definitions.map(d=>({name:d.name,description:d.description,parameters:d.inputSchema}));
 for(let turn=0;turn<maxTurns;turn++){
  const reply=await model({messages,tools:offered});messages.push(reply);
  if(!reply.toolCalls?.length)return reply.content;
  for(const call of reply.toolCalls){const result=await tools.call(call.name,call.arguments);messages.push({role:"tool",toolCallId:call.id,content:JSON.stringify(result)});}
 }
 throw Error("The model did not finish");
}
describe("example chat loop with a fake model",()=>{
 it("reads, edits against the read revision, and leaves one reviewable change",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host);
  const model:FakeModel=async({messages})=>{
   const last=messages[messages.length-1]!;
   if(last.role==="user")return {role:"assistant",content:"",toolCalls:[{id:"1",name:"find_text",arguments:JSON.stringify({query:"world"})}]};
   const result=JSON.parse((last as {content:string}).content);
   if(result.ok&&result.result.matches){const m=result.result.matches[0];return {role:"assistant",content:"",toolCalls:[
    {id:"2",name:"replace_range",arguments:JSON.stringify({revision:result.result.revision,block:m.block,start:m.start,end:m.end,text:"everyone",expectedText:"world"})},
    {id:"3",name:"set_format",arguments:JSON.stringify({revision:result.result.revision,block:m.block,start:0,end:5,format:"bold",enabled:true})},
    // A hallucinated block id is refused and reported back to the model.
    {id:"4",name:"delete_blocks",arguments:JSON.stringify({revision:result.result.revision,blocks:["imaginary"]})}]};}
   return {role:"assistant",content:"I staged the change for your review."};
  };
  expect(await runChat(model,tools,"Greet everyone")).toBe("I staged the change for your review.");
  expect(tools.review()!.items.map(i=>i.summary)).toEqual(["Replace “world” with “everyone”","Apply bold on “Hello”"]);
  expect(tools.state().lastError).toMatch(/imaginary/);
  expect(tools.accept()).toBe("content");expect(f.text("a")).toBe("Hello everyone");expect(f.plans).toHaveLength(1);
 });
});

describe("MCP-shaped adapter",()=>{
 it("answers tools/list and tools/call in MCP JSON shapes",async()=>{
  const f=fakeHost(doc);const mcp=richAgentMcpAdapter(createRichAgentTools(f.host));
  const list=await mcp.handle({jsonrpc:"2.0",id:1,method:"tools/list"});
  expect((list["result"] as any).tools.map((t:any)=>t.name)).toEqual(richAgentToolDefinitions.map(d=>d.name));
  const call=await mcp.handle({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"find_text",arguments:{query:"Third"}}}) as any;
  expect(call.id).toBe(2);expect(call.result.isError).toBe(false);expect(JSON.parse(call.result.content[0].text).matches[0].block).toBe("c");
  const bad=await mcp.callTool({name:"replace_range",arguments:{}});expect(bad.isError).toBe(true);expect(bad.structuredContent["error"]).toMatchObject({code:"invalid_arguments"});
  expect((await mcp.handle({jsonrpc:"2.0",id:3,method:"resources/list"}) as any).error.code).toBe(-32601);
  expect((await mcp.handle({id:4}) as any).error.code).toBe(-32600);
 });
});

describe("local lowering and port",()=>{
 const sel=(block:string,start:number,end:number)=>({kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}});
 const plan:RichAgentPlan={steps:[
  {kind:"replaceText",block:"a",start:1,end:2,text:"x"},
  {kind:"setFormat",block:"a",start:0,end:1,format:"breditor/strong",enabled:false},
  {kind:"setHeading",block:"b",level:2},
  {kind:"insertBlocks",parent:{block:"li",kind:"listItem"},before:null,blocks:[{block:"n",level:null,text:"N"}]},
  {kind:"deleteBlock",block:"c"}]};
 it("maps steps to native commands",()=>{
  expect(richAgentCommands(plan,false,()=>"pfx")).toEqual([
   {kind:"replaceTextRange",data:{selection:sel("a",1,2),text:"x"}},
   {kind:"setInlineFormat",data:{change:{kind:"remove",format:"breditor/strong"},targets:[{block:"a",start:"0",end:"1"}]}},
   {kind:"setHeading",block:"b",level:2},
   {kind:"insertBlocks",data:{position:{parent:{kind:"listItem",block:"li"},before:null},blocks:[{kind:"paragraph",block:"n",text:"N",formatsJson:"[]"}]}},
   {kind:"replaceBlocks",data:{first:"c",last:"c",blocks:[]}}]);
  expect(richAgentCommands({steps:[plan.steps[0]!]},true,()=>"pfx")).toEqual([{kind:"replaceGeneralRangePlainText",data:{selection:sel("a",1,2),text:"x",prefix:"pfx"}}]);
 });
 it("submits one command, or one native commandGroup, with the verified revision",()=>{
  const executed:{command:RichCommand;focus?:boolean;revision?:string}[]=[];let group=true;
  const editor:RichAgentEditorPort={surface:document.createElement("div"),searchState:()=>({revision:"7",closed:false,busy:false,composing:false,readOnly:false}),subscribeSearch:()=>()=>{},
   view:()=>({revision:"7",documentJson:"{}",selection:null}),execute:(command,focus,revision)=>{executed.push({command,focus,revision});return "content";},focus:()=>{},supportsCommandGroup:()=>group};
  const host=richAgentToolsHost(editor);
  expect(host.allocateAgentBlock()).toMatch(/^br:agent:[0-9a-f-]{36}:p:0$/);
  host.applyAgentPlan({steps:[plan.steps[2]!]},"7");
  host.applyAgentPlan(plan,"7");
  expect(executed[0]).toEqual({command:{kind:"setHeading",block:"b",level:2},focus:false,revision:"7"});
  expect(executed[1]!.command.kind).toBe("commandGroup");expect((executed[1]!.command as any).data.commands).toHaveLength(5);
  group=false;expect(()=>host.applyAgentPlan(plan,"7")).toThrow(/one edit at a time/);
 });
});

describe("review panel",()=>{
 it("lists staged edits with a word diff and applies them as one change",async()=>{
  const f=fakeHost(doc);const tools=createRichAgentTools(f.host);const root=document.createElement("div");document.body.append(root);
  const panel=mountRichAgentReview(root,tools);
  const status=()=>root.querySelector("[data-agent-status]")!.textContent;
  const accept=root.querySelector<HTMLButtonElement>('[data-agent-action="accept"]')!;
  expect(status()).toBe("No staged changes.");expect(accept.disabled).toBe(true);
  ok(await tools.call("replace_range",{revision:"1",block:"a",start:6,end:11,text:"<b>there</b>"}));
  expect(root.querySelectorAll("li")).toHaveLength(1);expect(root.querySelector("ins")!.textContent).toBe("<b>there</b>");expect(root.querySelector("b")).toBeNull();
  expect(status()).toMatch(/^1 staged edit/);expect(accept.disabled).toBe(false);
  accept.click();
  expect(f.text("a")).toBe("Hello <b>there</b>");expect(status()).toBe("Applied as one change · revision 2");expect(root.querySelectorAll("li")).toHaveLength(0);
  ok(await tools.call("replace_range",{revision:"2",block:"b",start:0,end:6,text:"2nd"}));f.peerEdit("b","changed");
  expect(accept.disabled).toBe(true);expect(status()).toMatch(/changed where these edits apply/);
  root.querySelector<HTMLButtonElement>('[data-agent-action="reject"]')!.click();expect(status()).toBe("Suggestion discarded. The document was not changed.");
  panel.dispose();expect(root.children).toHaveLength(0);
 });
});
