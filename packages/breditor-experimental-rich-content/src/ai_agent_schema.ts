/**
 * Agent tool definitions (JSON Schema, draft 2020-12 subset) and the strict validator that admits untrusted tool
 * arguments against them (docs/AI_AGENT_TOOLS.md). The schemas are the only argument grammar: every property is
 * declared, `additionalProperties` is always false and every string, number and array is bounded.
 */

/** The JSON Schema subset used by the tool definitions and enforced by `validateAgentArguments`. */
export interface RichAgentJsonSchema {
 readonly type?:"object"|"array"|"string"|"integer"|"boolean"|readonly ("string"|"null"|"integer")[];
 readonly description?:string;
 readonly properties?:Readonly<Record<string,RichAgentJsonSchema>>;
 readonly required?:readonly string[];
 readonly additionalProperties?:false;
 readonly items?:RichAgentJsonSchema;
 readonly oneOf?:readonly RichAgentJsonSchema[];
 readonly enum?:readonly (string|number|null)[];
 readonly const?:string;
 readonly minLength?:number;readonly maxLength?:number;
 readonly minimum?:number;readonly maximum?:number;
 readonly minItems?:number;readonly maxItems?:number;
}
export type RichAgentToolName="get_document"|"get_selection"|"find_text"|"replace_range"|"set_format"|"insert_blocks"|"delete_blocks"|"set_block_type"|"propose_changes";
/** One tool, shaped for LLM function calling (`name`, `description`, `inputSchema`; MCP uses the same names). */
export interface RichAgentToolDefinition {
 readonly name:RichAgentToolName;
 readonly description:string;
 readonly inputSchema:RichAgentJsonSchema;
 /** Whether the tool can change the document (it is still reviewable unless the host opted into direct mode). */
 readonly mutates:boolean;
}
export const RICH_AGENT_MAX_TEXT=65536;
export const RICH_AGENT_MAX_BLOCKS=32;
export const RICH_AGENT_MAX_EDITS=64;
export const richAgentFormats=Object.freeze(["bold","italic","underline","strikethrough","code"] as const);
export type RichAgentFormat=typeof richAgentFormats[number];

const id:RichAgentJsonSchema={type:"string",minLength:1,maxLength:128,description:"A block id returned by get_document, get_selection or find_text."};
const offset=(what:string):RichAgentJsonSchema=>({type:"integer",minimum:0,maximum:16_777_216,description:`${what} offset in UTF-16 code units within the block's text.`});
const revision:RichAgentJsonSchema={type:"string",minLength:1,maxLength:64,description:"The revision returned by the read this edit is based on. Edits against an older revision are applied only if every target block is unchanged since that read."};
const text=(description:string):RichAgentJsonSchema=>({type:"string",maxLength:RICH_AGENT_MAX_TEXT,description});
const level:RichAgentJsonSchema={type:"integer",minimum:1,maximum:6,description:"Heading level 1–6."};
const newBlock:RichAgentJsonSchema={type:"object",additionalProperties:false,required:["type","text"],properties:{
 type:{type:"string",enum:["paragraph","heading"]},level,text:text("Plain text of the new block (no line breaks).")}};
const editShapes={
 replace_range:{block:id,start:offset("Start"),end:offset("End (exclusive)"),text:text("Replacement plain text (no line breaks). Empty deletes the range."),expectedText:text("Optional: the text currently in the range; the edit is refused if it differs.")},
 set_format:{block:id,start:offset("Start"),end:offset("End (exclusive)"),format:{type:"string",enum:richAgentFormats},enabled:{type:"boolean",description:"true adds the format, false removes it."}},
 insert_blocks:{after:{type:["string","null"],minLength:1,maxLength:128,description:"Insert after this block id; null inserts at the start of the document."},blocks:{type:"array",minItems:1,maxItems:RICH_AGENT_MAX_BLOCKS,items:newBlock}},
 delete_blocks:{blocks:{type:"array",minItems:1,maxItems:RICH_AGENT_MAX_BLOCKS,items:id}},
 set_block_type:{block:id,type:{type:"string",enum:["paragraph","heading"]},level},
} as const satisfies Record<string,Record<string,RichAgentJsonSchema>>;
export type RichAgentEditTool=keyof typeof editShapes;
const editRequired:Readonly<Record<RichAgentEditTool,readonly string[]>>={replace_range:["block","start","end","text"],set_format:["block","start","end","format","enabled"],insert_blocks:["after","blocks"],delete_blocks:["blocks"],set_block_type:["block","type"]};
const editTool=(name:RichAgentEditTool):RichAgentJsonSchema=>({type:"object",additionalProperties:false,required:["revision",...editRequired[name]],properties:{revision,...editShapes[name]}});
const proposedEdit:RichAgentJsonSchema={oneOf:(Object.keys(editShapes) as RichAgentEditTool[]).map(name=>({type:"object",additionalProperties:false,required:["tool",...editRequired[name]],properties:{tool:{type:"string",const:name},...editShapes[name]}}))};
const reviewed=" Unless the host enabled direct mode, the edit is staged for the user's review (or filed as a suggestion) and nothing changes until the user accepts it.";

/** The complete, frozen tool catalog. */
export const richAgentToolDefinitions:readonly RichAgentToolDefinition[]=Object.freeze([
 {name:"get_document",mutates:false,description:"Read the document as an ordered list of blocks (id, type, parent, heading level, plain text and inline format ranges) plus its revision. Large documents are returned in chunks: pass nextCursor back as cursor.",
  inputSchema:{type:"object",additionalProperties:false,properties:{cursor:{type:"string",maxLength:16,description:"nextCursor from the previous chunk."},maxBlocks:{type:"integer",minimum:1,maximum:200,description:"Most blocks in this chunk (default 100)."}}}},
 {name:"get_selection",mutates:false,description:"Read the user's current selection (block ids, offsets and selected text) and the document revision.",inputSchema:{type:"object",additionalProperties:false,properties:{}}},
 {name:"find_text",mutates:false,description:"Find plain-text occurrences in text blocks. Returns block id, start/end offsets and surrounding context for each match, plus the revision.",
  inputSchema:{type:"object",additionalProperties:false,required:["query"],properties:{query:{type:"string",minLength:1,maxLength:256},caseSensitive:{type:"boolean"},maxResults:{type:"integer",minimum:1,maximum:200}}}},
 {name:"replace_range",mutates:true,description:`Replace a range of one text block with plain text (insert when start equals end, delete with empty text).${reviewed}`,inputSchema:editTool("replace_range")},
 {name:"set_format",mutates:true,description:`Add or remove an inline format on a range of one text block.${reviewed}`,inputSchema:editTool("set_format")},
 {name:"insert_blocks",mutates:true,description:`Insert new paragraphs or headings after a block (or at the start of the document).${reviewed}`,inputSchema:editTool("insert_blocks")},
 {name:"delete_blocks",mutates:true,description:`Delete whole blocks by id.${reviewed}`,inputSchema:editTool("delete_blocks")},
 {name:"set_block_type",mutates:true,description:`Turn a paragraph into a heading (with a level) or a heading into a paragraph.${reviewed}`,inputSchema:editTool("set_block_type")},
 {name:"propose_changes",mutates:true,description:"Propose several edits as one titled change for the user to review and accept or reject as a whole. Always reviewable, even in direct mode. Every edit uses the revision given here.",
  inputSchema:{type:"object",additionalProperties:false,required:["revision","title","edits"],properties:{revision,title:{type:"string",minLength:1,maxLength:200},edits:{type:"array",minItems:1,maxItems:RICH_AGENT_MAX_EDITS,items:proposedEdit}}}},
].map(definition=>deepFreeze(definition)) as RichAgentToolDefinition[]);
function deepFreeze<T>(value:T):T{if(value&&typeof value==="object"){for(const child of Object.values(value as object))deepFreeze(child);Object.freeze(value);}return value;}

/** Argument JSON bounds applied before schema validation. */
const MAX_JSON_BYTES=1024*1024,MAX_DEPTH=8,MAX_NODES=20_000;
export class RichAgentArgumentError extends Error {readonly path:string;constructor(path:string,message:string){super(`${path}: ${message}`);this.name="RichAgentArgumentError";this.path=path;}}
/**
 * Admit untrusted tool arguments: a JSON string (as many LLM APIs deliver them) or a value made only of plain
 * objects (own data properties), arrays, strings, finite numbers, booleans and null, bounded in size and depth,
 * then validated exactly against the schema. Returns a detached copy.
 */
export function admitAgentArguments(schema:RichAgentJsonSchema,input:unknown):Record<string,unknown>{
 let value=input;
 if(value===undefined||value===null)value={};
 if(typeof value==="string"){if(value.length>MAX_JSON_BYTES)throw new RichAgentArgumentError("$","arguments too large");try{value=JSON.parse(value);}catch{throw new RichAgentArgumentError("$","arguments are not valid JSON");}}
 let nodes=0,bytes=0;
 const copy=(v:unknown,path:string,depth:number):unknown=>{
  if(++nodes>MAX_NODES||depth>MAX_DEPTH)throw new RichAgentArgumentError(path,"arguments too large or too deeply nested");
  if(v===null||typeof v==="boolean")return v;
  if(typeof v==="number"){if(!Number.isFinite(v))throw new RichAgentArgumentError(path,"expected a finite number");return v;}
  if(typeof v==="string"){bytes+=v.length;if(bytes>MAX_JSON_BYTES)throw new RichAgentArgumentError(path,"arguments too large");return v;}
  if(Array.isArray(v)){if(Object.getPrototypeOf(v)!==Array.prototype)throw new RichAgentArgumentError(path,"expected a plain array");const out:unknown[]=[];for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,i);if(!d||!("value" in d))throw new RichAgentArgumentError(path,"expected a plain array");out.push(copy(d.value,`${path}[${i}]`,depth+1));}return out;}
  if(typeof v==="object"){
   const proto=Object.getPrototypeOf(v);if(proto!==Object.prototype&&proto!==null)throw new RichAgentArgumentError(path,"expected a plain object");
   if(Object.getOwnPropertySymbols(v).length)throw new RichAgentArgumentError(path,"expected a plain object");
   const out:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
   for(const key of Object.getOwnPropertyNames(v)){const d=Object.getOwnPropertyDescriptor(v,key)!;if(!("value" in d)||!d.enumerable)throw new RichAgentArgumentError(path,"expected own data properties only");out[key]=copy(d.value,`${path}.${key}`,depth+1);}
   return out;
  }
  throw new RichAgentArgumentError(path,"expected JSON data");
 };
 const admitted=copy(value,"$",0);
 validate(schema,admitted,"$");
 return admitted as Record<string,unknown>;
}
function typeOf(value:unknown):string{if(value===null)return "null";if(Array.isArray(value))return "array";if(typeof value==="number")return Number.isSafeInteger(value)?"integer":"number";return typeof value;}
/** Exact validation of an admitted JSON value against the supported schema subset. */
function validate(schema:RichAgentJsonSchema,value:unknown,path:string):void{
 if(schema.oneOf){
  let matches=0,first:unknown;
  for(const option of schema.oneOf){try{validate(option,value,path);matches++;}catch(error){first??=error;}}
  if(matches!==1){
   const tool=value&&typeof value==="object"&&!Array.isArray(value)?(value as Record<string,unknown>)["tool"]:undefined;
   const named=schema.oneOf.find(option=>option.properties?.["tool"]?.const===tool);
   if(named)validate(named,value,path);
   throw first instanceof RichAgentArgumentError?first:new RichAgentArgumentError(path,"does not match any allowed shape");
  }
  return;
 }
 const actual=typeOf(value);
 if(schema.type!==undefined){const allowed=typeof schema.type==="string"?[schema.type]:schema.type;if(!allowed.includes(actual as never))throw new RichAgentArgumentError(path,`expected ${allowed.join(" or ")}`);}
 if(schema.const!==undefined&&value!==schema.const)throw new RichAgentArgumentError(path,`expected ${JSON.stringify(schema.const)}`);
 if(schema.enum&&!schema.enum.includes(value as never))throw new RichAgentArgumentError(path,`expected one of ${schema.enum.map(v=>JSON.stringify(v)).join(", ")}`);
 if(typeof value==="string"){if(schema.minLength!==undefined&&value.length<schema.minLength)throw new RichAgentArgumentError(path,"too short");if(schema.maxLength!==undefined&&value.length>schema.maxLength)throw new RichAgentArgumentError(path,"too long");}
 if(typeof value==="number"){if(schema.minimum!==undefined&&value<schema.minimum)throw new RichAgentArgumentError(path,`must be at least ${schema.minimum}`);if(schema.maximum!==undefined&&value>schema.maximum)throw new RichAgentArgumentError(path,`must be at most ${schema.maximum}`);}
 if(Array.isArray(value)){
  if(schema.minItems!==undefined&&value.length<schema.minItems)throw new RichAgentArgumentError(path,`needs at least ${schema.minItems} items`);
  if(schema.maxItems!==undefined&&value.length>schema.maxItems)throw new RichAgentArgumentError(path,`allows at most ${schema.maxItems} items`);
  if(schema.items)value.forEach((item,i)=>validate(schema.items!,item,`${path}[${i}]`));
 }
 if(actual==="object"){
  const record=value as Record<string,unknown>,properties=schema.properties??{};
  for(const key of schema.required??[])if(!(key in record))throw new RichAgentArgumentError(`${path}.${key}`,"is required");
  for(const key of Object.keys(record)){const child=properties[key];if(!child){if(schema.additionalProperties===false)throw new RichAgentArgumentError(`${path}.${key}`,"is not allowed");continue;}validate(child,record[key],`${path}.${key}`);}
 }
}
