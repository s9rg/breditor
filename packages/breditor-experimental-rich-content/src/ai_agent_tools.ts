/**
 * Provider-agnostic agent tool contract (docs/AI_AGENT_TOOLS.md). Typed tools with JSON Schemas that a host's
 * LLM agent calls to read and edit the document. Breditor bundles no model and performs no I/O: the host runs the
 * chat loop and forwards tool calls to `call()`.
 *
 * Every edit call is untrusted input: admitted against its schema, checked against the current admitted document
 * (block ids, text blocks, UTF-16 scalar boundaries, sizes), bound to the revision the agent read (refused unless
 * every target region is unchanged since that read) and executed only through the host port's native commands.
 * By default edits are reviewable: staged as one change set the user accepts (ONE native publication, one Undo
 * step) or rejects, or filed as a proposal in the host's review system. Direct application is opt-in.
 */
import type {RichCommand,RichCommandOutcome} from "./core.js";
import {aiTargetKey,admitAiText,scalarBoundary,utf8Bytes,type RichAiHostState,type RichAiViewRead,type RichAiEditorPort} from "./ai_tools_host.js";
import {diffAiText,type RichAiDiffPart} from "./ai_diff.js";
import {admitAgentArguments,RichAgentArgumentError,richAgentToolDefinitions,RICH_AGENT_MAX_EDITS,RICH_AGENT_MAX_TEXT,type RichAgentEditTool,type RichAgentFormat,type RichAgentToolDefinition,type RichAgentToolName} from "./ai_agent_schema.js";
export {richAgentToolDefinitions,richAgentFormats,admitAgentArguments,RichAgentArgumentError,RICH_AGENT_MAX_TEXT,RICH_AGENT_MAX_BLOCKS,RICH_AGENT_MAX_EDITS,type RichAgentToolDefinition,type RichAgentToolName,type RichAgentJsonSchema,type RichAgentFormat,type RichAgentEditTool} from "./ai_agent_schema.js";

/** Format names the tools accept, mapped to the native inline format types. The owner's schema still decides. */
export const richAgentFormatTypes:Readonly<Record<RichAgentFormat,string>>=Object.freeze({bold:"breditor/strong",italic:"breditor-inline/italic",underline:"breditor-inline/underline",strikethrough:"breditor-inline/strike",code:"breditor-inline/code"});
const formatNames:ReadonlyMap<string,string>=new Map(Object.entries(richAgentFormatTypes).map(([name,type])=>[type,name]));

/** One validated, ordered native step. Hosts lower steps to their own commands; positions and fresh ids are resolved. */
export type RichAgentStep=
 |{readonly kind:"replaceText";readonly block:string;readonly start:number;readonly end:number;readonly text:string}
 |{readonly kind:"setFormat";readonly block:string;readonly start:number;readonly end:number;readonly format:string;readonly enabled:boolean}
 |{readonly kind:"setHeading";readonly block:string;readonly level:number|null}
 |{readonly kind:"insertBlocks";readonly parent:{readonly block:string;readonly kind:"listItem"|"blockquote"|"taskItem"|"details"}|null;readonly before:string|null;readonly blocks:readonly {readonly block:string;readonly level:number|null;readonly text:string}[]}
 |{readonly kind:"deleteBlock";readonly block:string};
/** A complete ordered plan: applied as ONE publication (one Undo step) or filed as one proposal. */
export interface RichAgentPlan {readonly steps:readonly RichAgentStep[]}
/** Borrowed editor port. `applyAgentPlan` submits exactly one guarded publication with the given revision. */
export interface RichAgentToolsHost {
 agentState():RichAiHostState;
 subscribeAgent(listener:()=>void):()=>void;
 agentView():RichAiViewRead;
 /** Apply the whole plan as ONE guarded native publication (one Undo step); throws when the owner refuses. */
 applyAgentPlan(plan:RichAgentPlan,revision:string):RichCommandOutcome|"queued";
 /** Optional review-system port: file the plan as one proposal (it does not change accepted content). Returns its id. */
 proposeAgentPlan?(plan:RichAgentPlan,title:string,revision:string):string|Promise<string>;
 /** Fresh block id allocator for inserted blocks (unique for the owner's lifetime). */
 allocateAgentBlock():string;
 /** `"shared"` ports apply through guarded shared dispatches; informational. */
 readonly agentKind?:"local"|"shared";
}
export type RichAgentMode="review"|"direct";
export interface RichAgentToolsOptions {
 /** `"review"` (default): edits are staged for the user (or filed as proposals). `"direct"`: each edit call applies at once. */
 mode?:RichAgentMode;
 /** In review mode, file edits as proposals when the host port offers `proposeAgentPlan` (default true). */
 useProposals?:boolean;
 /** Restrict the accepted inline formats (default all of `richAgentFormats`). */
 formats?:readonly RichAgentFormat[];
 /** Byte budget of one read result (default 64 KiB, at most 1 MiB). */
 maxReadBytes?:number;
 /** How many earlier read snapshots edits may be re-based from (default 16, at most 64). */
 readRetention?:number;
 /** Default proposal title for single edit calls. */
 proposalTitle?:string;
 /** Clock for proposals (milliseconds). */
 now?:()=>number;
}
export type RichAgentErrorCode="invalid_arguments"|"unknown_tool"|"unknown_block"|"not_text_block"|"invalid_range"|"invalid_text"|"too_large"|"unsupported"|"stale_revision"|"stale_target"|"conflict"|"read_only"|"busy"|"expected_text_mismatch"|"native_refused"|"disposed"|"nothing_staged";
export class RichAgentError extends Error {readonly code:RichAgentErrorCode;constructor(code:RichAgentErrorCode,message:string){super(message);this.name="RichAgentError";this.code=code;}}
/** Tool results are JSON data for the model; errors are reported, never thrown, so a chat loop can continue. */
export type RichAgentToolResult=
 |{readonly ok:true;readonly result:Readonly<Record<string,unknown>>}
 |{readonly ok:false;readonly error:{readonly code:RichAgentErrorCode;readonly message:string}};
/** One reviewable edit as the user sees it. Display data only; it grants no mutation authority. */
export interface RichAgentReviewItem {
 readonly tool:RichAgentEditTool;readonly summary:string;
 /** Text block previews (before/after plain text and a word diff) for edits that change text. */
 readonly block?:string;readonly before?:string;readonly after?:string;readonly diff?:readonly RichAgentDiffPart[];
}
export type RichAgentDiffPart=RichAiDiffPart;
export interface RichAgentReview {
 readonly id:number;readonly title:string|null;readonly items:readonly RichAgentReviewItem[];
 /** True when a target region changed after staging: Accept is refused; reject and ask the agent again. */
 readonly stale:boolean;
}
export type RichAgentPhase="idle"|"staged"|"applied"|"rejected"|"stale";
export interface RichAgentToolsState {
 readonly mode:RichAgentMode;readonly phase:RichAgentPhase;readonly disposed:boolean;readonly review:RichAgentReview|null;
 readonly lastError:string|null;readonly proposals:readonly string[];
 /** Revision published by the last applied change (direct edit or accepted review), or null. */
 readonly appliedRevision:string|null;
}
export interface RichAgentTools {
 readonly definitions:readonly RichAgentToolDefinition[];
 /** Run one tool call. `args` may be an object or a JSON string; it is untrusted. */
 call(name:string,args?:unknown):Promise<RichAgentToolResult>;
 /** The staged change set, or null. */
 review():RichAgentReview|null;
 /** Apply the staged change set as ONE guarded native publication (one Undo step). */
 accept():RichCommandOutcome|"queued";
 /** Discard the staged change set; the document is not changed. */
 reject():void;
 state():RichAgentToolsState;
 subscribe(listener:()=>void):()=>void;
 dispose():void;
}

// ---- Admitted document reads (from native document JSON, never the DOM). ----
interface JsonText {kind:"text";text:string;formats?:readonly {type:string;properties?:Record<string,unknown>}[]}
interface JsonElement {kind:"element";type:string;properties:Record<string,unknown>;children:readonly (JsonElement|JsonText)[]}
const textTypes=new Set(["breditor/paragraph","breditor/heading","breditor/code-block","breditor/details-summary"]);
const atomTypes=new Set(["breditor/horizontal-rule","breditor/page-break","breditor/image","breditor/table"]);
const containerKinds:Readonly<Record<string,"listItem"|"blockquote"|"taskItem"|"details">>={"breditor/list-item":"listItem","breditor/blockquote":"blockquote","breditor/task-item":"taskItem","breditor/details":"details"};
const shortType=(type:string):string=>type.startsWith("breditor/")?type.slice(9).replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase()):type;
interface BlockInfo {readonly id:string;readonly type:string;readonly node:JsonElement;readonly parent:JsonElement;readonly index:number;readonly text:string|null}
class DocRead {
 readonly revision:string;readonly json:string;readonly root:JsonElement;readonly order:BlockInfo[]=[];readonly blocks=new Map<string,BlockInfo>();
 constructor(view:RichAiViewRead){
  this.revision=view.revision;this.json=view.documentJson;
  const parsed=JSON.parse(view.documentJson) as {root?:JsonElement};if(!parsed||typeof parsed!=="object"||parsed.root?.kind!=="element")throw Error("Unexpected native document shape");
  this.root=parsed.root;
  const walk=(node:JsonElement):void=>{node.children.forEach((child,index)=>{
   if(child.kind!=="element")return;const id=child.properties?.["breditor/block-id"];
   if(typeof id==="string"&&(textTypes.has(child.type)||atomTypes.has(child.type))&&!this.blocks.has(id)){
    const info:BlockInfo={id,type:child.type,node:child,parent:node,index,text:textTypes.has(child.type)?child.children.map(c=>c.kind==="text"?c.text:"").join(""):null};
    this.order.push(info);this.blocks.set(id,info);
   }
   if(child.type!=="breditor/image")walk(child);
  });};
  walk(this.root);
 }
 key(block:string):string|null{return aiTargetKey(this.json,[{block}]);}
}
function describe(read:DocRead,info:BlockInfo):Record<string,unknown>{
 const out:Record<string,unknown>={id:info.id,type:shortType(info.type)};
 const parentId=info.parent.properties?.["breditor/block-id"];
 if(info.parent!==read.root&&typeof parentId==="string")out["parent"]={id:parentId,type:shortType(info.parent.type)};
 if(info.type==="breditor/heading")out["level"]=info.node.properties["breditor/level"];
 if(info.type==="breditor/image"){const alt=info.node.properties["breditor/alt-text"];if(typeof alt==="string"&&alt)out["alt"]=alt;}
 if(info.text!==null){
  out["text"]=info.text;const formats:{start:number;end:number;formats:string[]}[]=[];let offset=0;
  for(const child of info.node.children){if(child.kind!=="text")continue;const start=offset;offset+=child.text.length;const names=(child.formats??[]).map(f=>formatNames.get(f.type)??f.type);if(names.length)formats.push({start,end:offset,formats:names});}
  if(formats.length)out["formats"]=formats;
 }
 return out;
}

// ---- Validated staged edits. ----
type Edit=
 |{tool:"replace_range";block:string;start:number;end:number;text:string;expected?:string}
 |{tool:"set_format";block:string;start:number;end:number;format:RichAgentFormat;enabled:boolean}
 |{tool:"insert_blocks";after:string|null;blocks:{type:"paragraph"|"heading";level:number|null;text:string}[]}
 |{tool:"delete_blocks";blocks:string[]}
 |{tool:"set_block_type";block:string;level:number|null};
interface Staged {readonly edit:Edit;readonly keys:ReadonlyMap<string,string|null>;readonly preview:{block:string;before:string}|null}
const targets=(edit:Edit):string[]=>edit.tool==="insert_blocks"?(edit.after===null?[]:[edit.after]):edit.tool==="delete_blocks"?edit.blocks:[edit.block];
const toolOf:ReadonlyMap<string,RichAgentToolDefinition>=new Map(richAgentToolDefinitions.map(d=>[d.name,d]));

class AgentTools implements RichAgentTools {
 readonly definitions=richAgentToolDefinitions;
 readonly #host:RichAgentToolsHost;readonly #mode:RichAgentMode;readonly #proposals:boolean;readonly #formats:ReadonlySet<string>;
 readonly #maxRead:number;readonly #retention:number;readonly #title:string;readonly #now:()=>number;
 readonly #reads=new Map<string,DocRead>();readonly #listeners=new Set<()=>void>();readonly #unsubscribe:()=>void;
 #staged:Staged[]=[];#title_:string|null=null;#reviewId=0;#phase:RichAgentPhase="idle";#disposed=false;#lastError:string|null=null;readonly #filed:string[]=[];#stale=false;#applied:string|null=null;
 constructor(host:RichAgentToolsHost,options:RichAgentToolsOptions){
  for(const name of ["agentState","subscribeAgent","agentView","applyAgentPlan","allocateAgentBlock"] as const)if(typeof host?.[name]!=="function")throw new TypeError("Expected an agent tools host port");
  const mode=options.mode??"review";if(mode!=="review"&&mode!=="direct")throw new TypeError("Expected mode review or direct");
  this.#host=host;this.#mode=mode;this.#proposals=options.useProposals!==false&&typeof host.proposeAgentPlan==="function";
  const formats=options.formats??Object.keys(richAgentFormatTypes) as RichAgentFormat[];
  for(const format of formats)if(!(format in richAgentFormatTypes))throw new TypeError(`Unknown agent format ${String(format)}`);
  this.#formats=new Set(formats);
  this.#maxRead=bounded(options.maxReadBytes,65536,1024*1024,"maxReadBytes");this.#retention=bounded(options.readRetention,16,64,"readRetention");
  this.#title=options.proposalTitle??"AI agent edit";this.#now=options.now??(()=>Date.now());
  this.#unsubscribe=host.subscribeAgent(()=>this.#observe());
 }
 #emit():void{for(const listener of [...this.#listeners])try{listener();}catch{/* listeners cannot affect tool state */}}
 subscribe(listener:()=>void):()=>void{this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};}
 /** Staged reviews go stale as soon as a target region changes (any publication, local or remote). */
 #observe():void{
  if(this.#disposed||!this.#staged.length||this.#stale)return;
  let current:DocRead;try{current=this.#current();}catch{return;}
  if(this.#staged.some(s=>[...s.keys].some(([block,key])=>current.key(block)!==key))){this.#stale=true;this.#phase="stale";this.#emit();}
 }
 #current():DocRead{
  const view=this.#host.agentView(),known=this.#reads.get(view.revision);
  if(known&&known.json===view.documentJson)return known;
  return new DocRead(view);
 }
 #remember(read:DocRead):void{this.#reads.delete(read.revision);this.#reads.set(read.revision,read);while(this.#reads.size>this.#retention)this.#reads.delete(this.#reads.keys().next().value!);}
 state():RichAgentToolsState{return Object.freeze({mode:this.#mode,phase:this.#phase,disposed:this.#disposed,review:this.review(),lastError:this.#lastError,proposals:Object.freeze([...this.#filed]),appliedRevision:this.#applied});}
 review():RichAgentReview|null{
  if(!this.#staged.length)return null;
  const current=(()=>{try{return this.#current();}catch{return null;}})();
  const items=this.#staged.map(s=>this.#item(s,current));
  return Object.freeze({id:this.#reviewId,title:this.#title_,items:Object.freeze(items),stale:this.#stale});
 }
 #item(staged:Staged,current:DocRead|null):RichAgentReviewItem{
  const e=staged.edit;
  if(e.tool==="replace_range"||e.tool==="set_format"){
   const before=staged.preview?.before??"",after=this.#previewText(e.block,before);
   const summary=e.tool==="replace_range"?(e.start===e.end?`Insert “${clip(e.text)}”`:e.text?`Replace “${clip(before.slice(e.start,e.end))}” with “${clip(e.text)}”`:`Delete “${clip(before.slice(e.start,e.end))}”`):`${e.enabled?"Apply":"Remove"} ${e.format} on “${clip(before.slice(e.start,e.end))}”`;
   return Object.freeze({tool:e.tool,summary,block:e.block,before,after,diff:diffAiText(before,after)});
  }
  if(e.tool==="insert_blocks"){const text=e.blocks.map(b=>b.text).join("\n");return Object.freeze({tool:e.tool,summary:`Insert ${e.blocks.length} block${e.blocks.length===1?"":"s"}${e.after?"":" at the start"}`,before:"",after:text,diff:diffAiText("",text)});}
  if(e.tool==="delete_blocks"){const text=e.blocks.map(b=>current?.blocks.get(b)?.text??"").join("\n");return Object.freeze({tool:e.tool,summary:`Delete ${e.blocks.length} block${e.blocks.length===1?"":"s"}`,before:text,after:"",diff:diffAiText(text,"")});}
  return Object.freeze({tool:e.tool,block:e.block,summary:e.level===null?"Turn into a paragraph":`Turn into a level ${e.level} heading`});
 }
 /** Presentation-only text of a block after all staged text replacements (formats do not change text). */
 #previewText(block:string,before:string):string{
  const edits=this.#staged.map(s=>s.edit).filter((e):e is Extract<Edit,{tool:"replace_range"}>=>e.tool==="replace_range"&&e.block===block).sort((a,b)=>b.start-a.start);
  let text=before;for(const e of edits)text=text.slice(0,e.start)+e.text+text.slice(e.end);return text;
 }

 async call(name:string,args?:unknown):Promise<RichAgentToolResult>{
  try{
   if(this.#disposed)throw new RichAgentError("disposed","The agent tools were disposed");
   const definition=typeof name==="string"?toolOf.get(name):undefined;
   if(!definition)throw new RichAgentError("unknown_tool",`Unknown tool ${String(name).slice(0,64)}`);
   let admitted:Record<string,unknown>;
   try{admitted=admitAgentArguments(definition.inputSchema,args);}catch(error){if(error instanceof RichAgentArgumentError)throw new RichAgentError("invalid_arguments",error.message);throw error;}
   const result=await this.#run(definition.name,admitted);
   return Object.freeze({ok:true as const,result:Object.freeze(result)});
  }catch(error){
   const failure=error instanceof RichAgentError?error:new RichAgentError("native_refused",error instanceof Error?error.message:"The editor refused the edit");
   this.#lastError=failure.message;this.#emit();
   return Object.freeze({ok:false as const,error:Object.freeze({code:failure.code,message:failure.message})});
  }
 }
 async #run(name:RichAgentToolName,args:Record<string,unknown>):Promise<Record<string,unknown>>{
  const current=this.#current();this.#remember(current);
  switch(name){
   case "get_document":return this.#getDocument(current,args);
   case "get_selection":return this.#getSelection(current);
   case "find_text":return this.#find(current,args);
   case "propose_changes":{
    const revision=args["revision"] as string,base=this.#base(revision,current);
    const edits=(args["edits"] as Record<string,unknown>[]).map(raw=>{const {tool,...rest}=raw;return this.#edit(tool as RichAgentEditTool,rest);});
    return this.#submit(edits,current,base,String(args["title"]),true);
   }
   default:{
    const revision=args["revision"] as string,base=this.#base(revision,current);
    const {revision:_,...rest}=args;
    return this.#submit([this.#edit(name,rest)],current,base,null,false);
   }
  }
 }
 #getDocument(current:DocRead,args:Record<string,unknown>):Record<string,unknown>{
  const cursor=args["cursor"]===undefined?0:Number(args["cursor"]);
  if(!Number.isSafeInteger(cursor)||cursor<0||cursor>current.order.length)throw new RichAgentError("invalid_arguments","$.cursor: unknown cursor");
  const max=(args["maxBlocks"] as number|undefined)??100,blocks:Record<string,unknown>[]=[];let bytes=0,index=cursor;
  for(;index<current.order.length&&blocks.length<max;index++){
   const block=describe(current,current.order[index]!),size=utf8Bytes(JSON.stringify(block));
   if(blocks.length&&bytes+size>this.#maxRead)break;
   if(size>this.#maxRead&&typeof block["text"]==="string"){block["text"]=truncate(block["text"],this.#maxRead/2);block["truncated"]=true;delete block["formats"];}
   bytes+=size;blocks.push(block);
  }
  return {revision:current.revision,totalBlocks:current.order.length,blocks,nextCursor:index<current.order.length?String(index):null};
 }
 #getSelection(current:DocRead):Record<string,unknown>{
  const selection=this.#host.agentView().selection;
  if(!selection)return {revision:current.revision,selection:null};
  if(selection.kind==="document")return {revision:current.revision,selection:{kind:"document"}};
  if(selection.kind==="node")return {revision:current.revision,selection:{kind:"block",block:selection.block}};
  if(selection.kind!=="text")return {revision:current.revision,selection:{kind:"cells"}};
  const a=current.order.findIndex(b=>b.id===selection.anchor.block),f=current.order.findIndex(b=>b.id===selection.focus.block);
  const ao=Number(selection.anchor.offset),fo=Number(selection.focus.offset),forward=a<f||a===f&&ao<=fo;
  const [first,start,last,end]=forward?[a,ao,f,fo]:[f,fo,a,ao],parts:string[]=[];
  for(let i=first;i>=0&&i<=last;i++){const t=current.order[i]!.text;if(t!==null)parts.push(t.slice(i===first?start:0,i===last?end:t.length));}
  return {revision:current.revision,selection:{kind:"text",anchor:{block:selection.anchor.block,offset:ao},focus:{block:selection.focus.block,offset:fo},text:truncate(parts.join("\n"),this.#maxRead/2)}};
 }
 #find(current:DocRead,args:Record<string,unknown>):Record<string,unknown>{
  const query=args["query"] as string,sensitive=args["caseSensitive"]===true,max=(args["maxResults"] as number|undefined)??50;
  const needle=sensitive?query:query.toLowerCase(),matches:Record<string,unknown>[]=[];let truncated=false;
  outer:for(const info of current.order){
   if(info.text===null)continue;const hay=sensitive?info.text:info.text.toLowerCase();
   for(let at=hay.indexOf(needle);at>=0;at=hay.indexOf(needle,at+Math.max(needle.length,1))){
    if(hay.length!==info.text.length)break;// case folding changed lengths: refuse inexact offsets
    if(matches.length>=max){truncated=true;break outer;}
    matches.push({block:info.id,start:at,end:at+needle.length,context:info.text.slice(Math.max(0,at-30),at+needle.length+30)});
   }
  }
  return {revision:current.revision,matches,truncated};
 }
 /** The read an edit is based on. Unknown revisions are refused; known older ones are re-based per target. */
 #base(revision:string,current:DocRead):DocRead{
  if(revision===current.revision)return current;
  const read=this.#reads.get(revision);
  if(!read)throw new RichAgentError("stale_revision",`Revision ${revision.slice(0,64)} is unknown or too old; read the document again`);
  return read;
 }
 /** Shape-level conversion of admitted arguments; semantic checks happen against the document in #check. */
 #edit(tool:RichAgentEditTool,a:Record<string,unknown>):Edit{
  switch(tool){
   case "replace_range":{
    const text=admitAiText(a["text"],false);if(text===null)throw new RichAgentError("invalid_text","$.text: text must be well-formed and contain no line breaks or control characters; use insert_blocks for new paragraphs");
    return {tool,block:a["block"] as string,start:a["start"] as number,end:a["end"] as number,text,...(a["expectedText"]!==undefined?{expected:a["expectedText"] as string}:{})};
   }
   case "set_format":{const format=a["format"] as RichAgentFormat;if(!this.#formats.has(format))throw new RichAgentError("unsupported",`The format ${format} is not enabled`);return {tool,block:a["block"] as string,start:a["start"] as number,end:a["end"] as number,format,enabled:a["enabled"] as boolean};}
   case "insert_blocks":return {tool,after:a["after"] as string|null,blocks:(a["blocks"] as Record<string,unknown>[]).map((b,i)=>{
    const text=admitAiText(b["text"],false);if(text===null)throw new RichAgentError("invalid_text",`$.blocks[${i}].text: text must be well-formed and contain no line breaks or control characters`);
    if(b["type"]==="heading"&&b["level"]===undefined)throw new RichAgentError("invalid_arguments",`$.blocks[${i}].level: a heading needs a level`);
    return {type:b["type"] as "paragraph"|"heading",level:b["type"]==="heading"?b["level"] as number:null,text};})};
   case "delete_blocks":{const blocks=a["blocks"] as string[];if(new Set(blocks).size!==blocks.length)throw new RichAgentError("invalid_arguments","$.blocks: duplicate block ids");return {tool,blocks:[...blocks]};}
   case "set_block_type":{if(a["type"]==="heading"&&a["level"]===undefined)throw new RichAgentError("invalid_arguments","$.level: a heading needs a level");return {tool,block:a["block"] as string,level:a["type"]==="heading"?a["level"] as number:null};}
  }
 }
 /** Semantic validation against the current document; staleness against the base read. */
 #check(edit:Edit,current:DocRead,base:DocRead):Staged{
  const keys=new Map<string,string|null>();
  for(const block of targets(edit)){
   const info=current.blocks.get(block);
   if(!info)throw new RichAgentError(base.blocks.has(block)?"stale_target":"unknown_block",`Block ${block.slice(0,128)} is not in the current document`);
   const key=current.key(block);
   if(base!==current&&base.key(block)!==key)throw new RichAgentError("stale_target",`Block ${block.slice(0,128)} changed after revision ${base.revision}; read it again`);
   keys.set(block,key);
  }
  let preview:Staged["preview"]=null;
  if(edit.tool==="replace_range"||edit.tool==="set_format"){
   const info=current.blocks.get(edit.block)!;
   if(info.text===null)throw new RichAgentError("not_text_block",`Block ${edit.block} holds no text`);
   if(edit.start>edit.end||edit.end>info.text.length||!scalarBoundary(info.text,edit.start)||!scalarBoundary(info.text,edit.end))throw new RichAgentError("invalid_range",`Range ${edit.start}–${edit.end} is outside the block's ${info.text.length} UTF-16 units or splits a character`);
   if(edit.tool==="set_format"){
    if(edit.start===edit.end)throw new RichAgentError("invalid_range","A format range must not be empty");
    if(info.type==="breditor/code-block")throw new RichAgentError("unsupported","Code blocks hold no inline formats");
   }else{
    if(edit.expected!==undefined&&info.text.slice(edit.start,edit.end)!==edit.expected)throw new RichAgentError("expected_text_mismatch",`The range holds “${clip(info.text.slice(edit.start,edit.end))}”, not the expected text`);
    if(utf8Bytes(edit.text)>RICH_AGENT_MAX_TEXT)throw new RichAgentError("too_large","The replacement text is too large");
    if(edit.start===edit.end&&!edit.text)throw new RichAgentError("invalid_range","An empty range needs replacement text");
   }
   preview={block:edit.block,before:info.text};
  }else if(edit.tool==="insert_blocks"){
   if(edit.after!==null){const parent=current.blocks.get(edit.after)!.parent;if(parent!==current.root&&!containerKinds[parent.type])throw new RichAgentError("unsupported",`Blocks cannot be inserted inside ${shortType(parent.type)}`);}
   if(edit.blocks.reduce((n,b)=>n+utf8Bytes(b.text),0)>RICH_AGENT_MAX_TEXT)throw new RichAgentError("too_large","The inserted text is too large");
  }else if(edit.tool==="set_block_type"){
   const info=current.blocks.get(edit.block)!;
   if(info.type!=="breditor/paragraph"&&info.type!=="breditor/heading")throw new RichAgentError("unsupported","Only paragraphs and headings can change type");
  }
  return {edit,keys,preview};
 }
 /** Refuse edits that overlap staged ones, so the ordered plan has one unambiguous meaning. */
 #conflicts(next:Staged,staged:readonly Staged[]):void{
  const e=next.edit,deleted=new Set(staged.flatMap(s=>s.edit.tool==="delete_blocks"?s.edit.blocks:[]));
  for(const block of targets(e))if(deleted.has(block))throw new RichAgentError("conflict",`Block ${block} is already staged for deletion`);
  if(e.tool==="delete_blocks"){
   const touched=new Set(staged.flatMap(s=>s.edit.tool==="delete_blocks"?[]:targets(s.edit)));
   for(const block of e.blocks)if(touched.has(block))throw new RichAgentError("conflict",`Block ${block} has other staged edits`);
  }
  for(const s of staged){
   const o=s.edit;
   if(e.tool==="set_block_type"&&o.tool==="set_block_type"&&o.block===e.block)throw new RichAgentError("conflict",`Block ${e.block} already has a staged type change`);
   if((e.tool==="replace_range"||e.tool==="set_format")&&(o.tool==="replace_range"||o.tool==="set_format")&&o.block===e.block&&(e.tool==="replace_range"||o.tool==="replace_range")){
    // Two replacements must be disjoint (and two insertions not at one point); a replacement may not remove text
    // that a format change targets. A pure insertion next to or inside a format range is well defined.
    const overlap=e.start<o.end&&o.start<e.end,inside=(p:number,r:{start:number;end:number})=>r.start<p&&p<r.end;
    if(e.tool==="replace_range"&&o.tool==="replace_range"?overlap||e.start===e.end&&(o.start===e.start||inside(e.start,o))||o.start===o.end&&(e.start===o.start||inside(o.start,e)):overlap)
     throw new RichAgentError("conflict",`The range overlaps a staged edit in block ${e.block}`);
   }
  }
 }
 /** Ordered native steps: per block, text edits from the end (formats before replacements at one offset), then types, insertions, deletions. */
 #plan(edits:readonly Edit[],current:DocRead):RichAgentPlan{
  const steps:RichAgentStep[]=[];
  const text=edits.filter((e):e is Extract<Edit,{tool:"replace_range"|"set_format"}>=>e.tool==="replace_range"||e.tool==="set_format");
  const blocks=[...new Set(text.map(e=>e.block))];
  for(const block of blocks)for(const e of text.filter(e=>e.block===block).sort((a,b)=>b.start-a.start||(a.tool===b.tool?0:a.tool==="set_format"?-1:1)))
   steps.push(e.tool==="replace_range"?{kind:"replaceText",block,start:e.start,end:e.end,text:e.text}:{kind:"setFormat",block,start:e.start,end:e.end,format:richAgentFormatTypes[e.format],enabled:e.enabled});
  for(const e of edits)if(e.tool==="set_block_type")steps.push({kind:"setHeading",block:e.block,level:e.level});
  for(const e of edits){
   if(e.tool!=="insert_blocks")continue;
   let parent:JsonElement,before:string|null;
   if(e.after===null){parent=current.root;const first=current.root.children[0];before=first?.kind==="element"?String(first.properties["breditor/block-id"]):null;}
   else{const info=current.blocks.get(e.after)!;parent=info.parent;const next=parent.children[info.index+1];before=next?.kind==="element"?String(next.properties["breditor/block-id"]):null;}
   const kind=containerKinds[parent.type];
   steps.push({kind:"insertBlocks",parent:parent===current.root||!kind?null:{block:String(parent.properties["breditor/block-id"]),kind},before,blocks:e.blocks.map(b=>({block:this.#host.allocateAgentBlock(),level:b.level,text:b.text}))});
  }
  for(const e of edits)if(e.tool==="delete_blocks")for(const block of e.blocks)steps.push({kind:"deleteBlock",block});
  if(steps.length>RICH_AGENT_MAX_EDITS)throw new RichAgentError("too_large",`A change may hold at most ${RICH_AGENT_MAX_EDITS} native steps`);
  return Object.freeze({steps:Object.freeze(steps.map(s=>Object.freeze(s)))});
 }
 async #submit(edits:readonly Edit[],current:DocRead,base:DocRead,title:string|null,batch:boolean):Promise<Record<string,unknown>>{
  const state=this.#host.agentState();
  if(state.closed)throw new RichAgentError("disposed","The editor is closed");
  if(state.readOnly)throw new RichAgentError("read_only","The document is read-only; nothing can be changed");
  const checked:Staged[]=[];
  for(const edit of edits){const next=this.#check(edit,current,base);this.#conflicts(next,checked);checked.push(next);}
  const direct=this.#mode==="direct"&&!batch;
  if(!direct&&this.#proposals){
   const plan=this.#plan(edits,current);
   const id=await this.#host.proposeAgentPlan!(plan,title??this.#title,current.revision);
   this.#filed.push(String(id));this.#emit();
   return {status:"proposed",proposal:String(id),note:"Filed as a suggestion for the user's review. The document is unchanged until it is accepted."};
  }
  if(direct){
   if(state.busy||state.composing)throw new RichAgentError("busy","The editor is busy; try again");
   const outcome=this.#host.applyAgentPlan(this.#plan(edits,current),current.revision);
   if(outcome==="queued")throw new RichAgentError("busy","The editor is busy; try again");
   const after=this.#current();this.#remember(after);this.#phase="applied";this.#applied=after.revision;this.#emit();
   return {status:outcome==="unchanged"?"unchanged":"applied",revision:after.revision};
  }
  // Review: join the staged change set (refreshing stale detection against the current document).
  if(this.#stale)throw new RichAgentError("conflict","The staged change is outdated; ask the user to reject it first");
  const staged=[...this.#staged];for(const next of checked)this.#conflicts(next,staged),staged.push(next);
  if(staged.length>RICH_AGENT_MAX_EDITS)throw new RichAgentError("too_large",`At most ${RICH_AGENT_MAX_EDITS} edits can be staged`);
  this.#plan(staged.map(s=>s.edit),current);
  if(!this.#staged.length){this.#reviewId++;this.#title_=title;}else if(title!==null&&this.#title_===null)this.#title_=title;
  this.#staged=staged;this.#phase="staged";this.#emit();
  return {status:"staged",pendingEdits:staged.length,note:"Staged for the user's review. Nothing changes until the user accepts; continue with the same revision for further edits."};
 }
 accept():RichCommandOutcome|"queued"{
  if(this.#disposed)throw new RichAgentError("disposed","The agent tools were disposed");
  if(!this.#staged.length)throw new RichAgentError("nothing_staged","There is no staged change");
  const state=this.#host.agentState();
  if(state.readOnly)throw new RichAgentError("read_only","The document is read-only");
  if(state.busy||state.composing)return "queued";
  const current=this.#current();
  if(this.#stale||this.#staged.some(s=>[...s.keys].some(([block,key])=>current.key(block)!==key))){this.#stale=true;this.#phase="stale";this.#emit();throw new RichAgentError("stale_target","The document changed where the staged edits apply; nothing was applied");}
  const outcome=this.#host.applyAgentPlan(this.#plan(this.#staged.map(s=>s.edit),current),current.revision);
  if(outcome!=="queued"){this.#staged=[];this.#title_=null;this.#stale=false;this.#phase="applied";const after=this.#current();this.#remember(after);this.#applied=after.revision;this.#emit();}
  return outcome;
 }
 reject():void{if(!this.#staged.length)return;this.#staged=[];this.#title_=null;this.#stale=false;this.#phase="rejected";this.#emit();}
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#staged=[];this.#reads.clear();this.#unsubscribe();this.#emit();this.#listeners.clear();}
}
function bounded(value:number|undefined,fallback:number,max:number,name:string):number{if(value===undefined)return fallback;if(!Number.isSafeInteger(value)||value<1||value>max)throw new RangeError(`Expected ${name} between 1 and ${max}`);return value;}
function clip(text:string):string{return text.length>40?`${text.slice(0,39)}…`:text;}
function truncate(text:string,bytes:number):string{let out=text;while(utf8Bytes(out)>bytes)out=out.slice(0,Math.floor(out.length*0.9));if(out.length&&!scalarBoundary(text,out.length))out=out.slice(0,-1);return out;}

/** Create the agent tool contract over a host port. Nothing is enabled by mounting an editor. */
export function createRichAgentTools(host:RichAgentToolsHost,options:RichAgentToolsOptions={}):RichAgentTools{return new AgentTools(host,options);}

/** Structural local editor port: the AI tools port plus the native command-group probe. */
export interface RichAgentEditorPort extends RichAiEditorPort {supportsCommandGroup?():boolean}
/** Lower a plan to local native commands (one command, or one `commandGroup`). */
export function richAgentCommands(plan:RichAgentPlan,general:boolean,prefix:()=>string):RichCommand[]{
 const point=(block:string,offset:number)=>({block,offset:String(offset),affinity:"after" as const});
 return plan.steps.map((step):RichCommand=>{
  switch(step.kind){
   case "replaceText":{const selection={kind:"text" as const,anchor:point(step.block,step.start),focus:point(step.block,step.end)};return general?{kind:"replaceGeneralRangePlainText",data:{selection,text:step.text,prefix:prefix()}}:{kind:"replaceTextRange",data:{selection,text:step.text}};}
   case "setFormat":return {kind:"setInlineFormat",data:{change:step.enabled?{kind:"set",formatsJson:JSON.stringify([{type:step.format,properties:{}}])}:{kind:"remove",format:step.format},targets:[{block:step.block,start:String(step.start),end:String(step.end)}]}};
   case "setHeading":return {kind:"setHeading",block:step.block,level:step.level};
   case "insertBlocks":return {kind:"insertBlocks",data:{position:{parent:step.parent?{kind:step.parent.kind,block:step.parent.block}:{kind:"document"},before:step.before},blocks:step.blocks.map(b=>b.level===null?{kind:"paragraph" as const,block:b.block,text:b.text,formatsJson:"[]"}:{kind:"heading" as const,level:b.level,block:b.block,text:b.text,formatsJson:"[]"})}};
   case "deleteBlock":return {kind:"replaceBlocks",data:{first:step.block,last:step.block,blocks:[]}};
  }
 });
}
/** Adapt a local DOM editor (or the SDK local editor's borrowed host) to the agent port. */
export function richAgentToolsHost(editor:RichAgentEditorPort):RichAgentToolsHost{
 for(const name of ["searchState","subscribeSearch","view","execute"] as const)if(typeof editor?.[name]!=="function")throw new TypeError("Expected a rich DOM editor");
 const namespace=`br:agent:${globalThis.crypto.randomUUID()}`;let counter=0n;
 const allocate=(kind:string):string=>`${namespace}:${kind}:${counter++}`;
 return Object.freeze({
  agentKind:"local" as const,
  agentState:()=>{const s=editor.searchState();return Object.freeze({revision:s.revision,closed:s.closed,busy:s.busy,composing:s.composing,readOnly:s.readOnly});},
  subscribeAgent:(listener:()=>void)=>editor.subscribeSearch(listener),
  agentView:()=>{const v=editor.view();return Object.freeze({revision:v.revision,documentJson:v.documentJson,selection:v.selection,rangeEditing:v.rangeEditing,readOnly:v.readOnly});},
  applyAgentPlan:(plan:RichAgentPlan,revision:string)=>{
   const commands=richAgentCommands(plan,editor.view().rangeEditing==="general-v1",()=>allocate("range"));
   if(commands.length===1)return editor.execute(commands[0]!,false,revision);
   if(editor.supportsCommandGroup?.()!==true)throw new RichAgentError("unsupported","This editor cannot apply several edits as one step; stage one edit at a time");
   return editor.execute({kind:"commandGroup",data:{commands:commands as Extract<RichCommand,{kind:"commandGroup"}>["data"]["commands"]}},false,revision);
  },
  allocateAgentBlock:()=>allocate("p"),
 });
}
