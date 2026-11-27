/**
 * Review panel for agent edits staged by `createRichAgentTools` (docs/AI_AGENT_TOOLS.md) and an MCP-shaped adapter
 * (`tools/list`, `tools/call` JSON shapes only; no server, transport or I/O). Text is always shown with
 * `textContent`; the panel lives outside the editing surface and never touches the editing DOM.
 */
import {createRichStyleElement} from "./style_element.js";
import {defaultRichUi,type RichUiLocale,type RichUiStringKey} from "./ui_locale.js";
import type {RichAgentTools,RichAgentReviewItem,RichAgentToolResult} from "./ai_agent_tools.js";

export interface RichAgentReviewOptions {uiLocale?:RichUiLocale;label?:string;onError?:(error:unknown)=>void}
export interface RichAgentReviewPanel {dispose():void}
const mounted=new WeakSet<HTMLElement>();
/** Mount the staged-change review (Accept all applies ONE native publication; Reject all discards). */
export function mountRichAgentReview(root:HTMLElement,tools:RichAgentTools,options:RichAgentReviewOptions={}):RichAgentReviewPanel{
 if(mounted.has(root))throw Error("Agent review requires an unused host element");
 if(!tools||typeof tools.review!=="function"||typeof tools.subscribe!=="function")throw new TypeError("Expected agent tools");
 const d=root.ownerDocument,ui=options.uiLocale??defaultRichUi,label=options.label??ui.text("agentReviewLabel");
 const section=d.createElement("section");section.dataset["breditorAgentReview"]="";section.setAttribute("aria-label",label);ui.applyChrome(section);
 const style=createRichStyleElement(d,styles);
 const title=d.createElement("h2");title.textContent=label;
 const list=d.createElement("ol");list.dataset["agentItems"]="";
 const actions=d.createElement("div");actions.dataset["agentActions"]="";
 const status=d.createElement("p");status.dataset["agentStatus"]="";status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 let message:string|null=null;
 const button=(name:string,key:RichUiStringKey,run:()=>void)=>{const node=d.createElement("button");node.type="button";node.dataset["agentAction"]=name;node.textContent=ui.text(key);node.addEventListener("click",run);actions.append(node);return node;};
 const report=(error:unknown)=>{message=ui.text("agentFailed",{reason:ui.describe(error,"refused")});try{options.onError?.(error);}catch{/* reporting cannot change state */}render();};
 const accept=button("accept","agentAccept",()=>{try{const outcome=tools.accept();if(outcome!=="queued")message=ui.text("aiApplied",{revision:tools.state().appliedRevision??""});render();}catch(error){report(error);}});
 const reject=button("reject","agentReject",()=>{tools.reject();message=ui.text("aiRejected");render();});
 section.append(style,title,list,actions,status);
 const item=(entry:RichAgentReviewItem):HTMLLIElement=>{
  const li=d.createElement("li");li.dataset["agentTool"]=entry.tool;
  const summary=d.createElement("p");summary.dataset["agentSummary"]="";summary.textContent=entry.summary;li.append(summary);
  if(entry.diff&&entry.diff.length){
   const diff=d.createElement("p");diff.dataset["agentDiff"]="";
   for(const part of entry.diff){const node=d.createElement(part.kind==="removed"?"del":part.kind==="added"?"ins":"span");node.textContent=part.text;diff.append(node);}
   li.append(diff);
  }
  return li;
 };
 const render=()=>{
  const review=tools.review(),state=tools.state();
  list.replaceChildren(...(review?.items??[]).map(item));
  const count=review?.items.length??0;
  accept.disabled=!review||review.stale||state.disposed;reject.disabled=!review||state.disposed;
  section.dataset["agentPhase"]=state.phase;
  status.textContent=review?.stale?ui.text("agentStale"):review?(count===1?ui.text("agentPendingOne"):ui.text("agentPending",{count})):message??ui.text("agentEmpty");
  if(review)message=null;
 };
 const unsubscribe=tools.subscribe(render);
 mounted.add(root);root.replaceChildren(section);render();
 let disposed=false;
 return Object.freeze({dispose(){if(disposed)return;disposed=true;unsubscribe();mounted.delete(root);section.remove();}});
}
const styles=`[data-breditor-agent-review]{padding:12px;border:1px solid #bdcdc5;border-radius:8px;color:#173d37;background:#f4f7f4;font:14px system-ui,sans-serif}[data-breditor-agent-review] h2{font-size:16px;margin:0 0 8px}[data-breditor-agent-review] ol{margin:0;padding-left:20px}[data-breditor-agent-review] li{margin:4px 0}[data-breditor-agent-review] p{margin:2px 0}[data-breditor-agent-review] del{background:#fbe3e3;color:#7a1c1c}[data-breditor-agent-review] ins{background:#dff3e4;color:#14532d;text-decoration:none}[data-breditor-agent-review] [data-agent-actions]{display:flex;gap:8px;margin-top:8px}`;

// ---- MCP-shaped adapter (JSON only). ----
export interface RichAgentMcpTool {readonly name:string;readonly description:string;readonly inputSchema:unknown}
export interface RichAgentMcpCallResult {readonly content:readonly {readonly type:"text";readonly text:string}[];readonly structuredContent:Readonly<Record<string,unknown>>;readonly isError:boolean}
export interface RichAgentMcpAdapter {
 /** `tools/list` result shape. */
 listTools():{readonly tools:readonly RichAgentMcpTool[]};
 /** `tools/call` result shape; tool errors are results with `isError: true`. */
 callTool(params:{readonly name:string;readonly arguments?:unknown}):Promise<RichAgentMcpCallResult>;
 /** Answer one JSON-RPC 2.0 request for `tools/list` or `tools/call`; other methods get error -32601. */
 handle(request:unknown):Promise<Readonly<Record<string,unknown>>>;
}
/** Expose agent tools in MCP's `tools/list` / `tools/call` JSON shapes. The host owns any transport. */
export function richAgentMcpAdapter(tools:RichAgentTools):RichAgentMcpAdapter{
 const toResult=(result:RichAgentToolResult):RichAgentMcpCallResult=>{const body=result.ok?result.result:{error:result.error};return Object.freeze({content:Object.freeze([Object.freeze({type:"text" as const,text:JSON.stringify(body)})]),structuredContent:body,isError:!result.ok});};
 const adapter:RichAgentMcpAdapter={
  listTools:()=>Object.freeze({tools:Object.freeze(tools.definitions.map(d=>Object.freeze({name:d.name,description:d.description,inputSchema:d.inputSchema})))}),
  callTool:async params=>toResult(await tools.call(typeof params?.name==="string"?params.name:"",params?.arguments)),
  handle:async request=>{
   const r=request&&typeof request==="object"?request as Record<string,unknown>:{};
   const id=typeof r["id"]==="string"||typeof r["id"]==="number"?r["id"]:null;
   if(r["jsonrpc"]!=="2.0"||typeof r["method"]!=="string")return {jsonrpc:"2.0",id,error:{code:-32600,message:"Invalid request"}};
   if(r["method"]==="tools/list")return {jsonrpc:"2.0",id,result:adapter.listTools()};
   if(r["method"]==="tools/call"){const params=r["params"]&&typeof r["params"]==="object"?r["params"] as {name:string;arguments?:unknown}:{name:""};return {jsonrpc:"2.0",id,result:await adapter.callTool(params)};}
   return {jsonrpc:"2.0",id,error:{code:-32601,message:"Method not found"}};
  },
 };
 return Object.freeze(adapter);
}
