import MarkdownIt,{type Token} from "markdown-it";
import {Budget,bytes,fail,limits,sourceWithinBudget} from "./budget.js";
import {HtmlExport} from "./html_export.js";
import {property,type Element,type Node,type Text} from "./wire.js";
import {safeUrl} from "./safe_url.js";
import type {InterchangeOptions} from "./types.js";
/** CommonMark plus markdown-it's table/strike extensions, task markers and sanitized raw HTML. */
export function markdownHtml(source:string,b:Budget):string {
  sourceWithinBudget(source);
  const md=new MarkdownIt({html:true,linkify:false,typographer:false,breaks:false,maxNesting:limits.depth});
  // Let the single downstream HTML URL policy see link/image destinations and report removals.
  md.validateLink=()=>true;
  const seen=new WeakSet<object>();let count=0;
  const observe=(token:Token)=>{if(!seen.has(token)){seen.add(token);if(++count>limits.markdownTokens)fail("resource-limit");}return token;};
  const Block=md.block.State,Inline=md.inline.State;
  md.block.State=class extends Block{override push(...args:Parameters<InstanceType<typeof Block>["push"]>):Token{return observe(super.push(...args));}};
  md.inline.State=class extends Inline{override push(...args:Parameters<InstanceType<typeof Inline>["push"]>):Token{return observe(super.push(...args));}override pushPending():Token{return observe(super.pushPending());}};
  const tokenize=md.block.tokenize,skip=md.inline.skipToken;
  md.block.tokenize=function(state,start,end){if(state.level>=limits.depth)fail("resource-limit");tokenize.call(this,state,start,end);};
  md.inline.skipToken=function(state){if(state.level>=limits.depth)fail("resource-limit");skip.call(this,state);};
  const tokens=md.parse(source,{}),todo=[...tokens];
  while(todo.length){const token=todo.pop()!;observe(token);if(token.level>=limits.depth)fail("resource-limit");if(token.children)todo.push(...token.children);}
  // Task state comes from a parsed item head, never a blanket replacement in source text/code.
  for(let i=0;i<tokens.length;i++){
    if(tokens[i]!.type!=="list_item_open")continue;
    const paragraph=tokens[i+1],inline=tokens[i+2];if(paragraph?.type!=="paragraph_open"||inline?.type!=="inline")continue;
    const match=/^\[([ xX])\](?:[ \t]+|$)/.exec(inline.content),first=inline.children?.[0];
    if(!match||first?.type!=="text"||!first.content.startsWith(match[0]))continue;
    first.content=first.content.slice(match[0].length);
    const checkbox=observe(new MarkdownIt.Token("html_inline","",0));checkbox.content=`<input type="checkbox" disabled${match[1]!==" "?" checked":""}>`;
    inline.children!.unshift(checkbox);
  }
  const result=md.renderer.render(tokens,md.options,{});if(result.length>limits.sourceBytes||bytes(result)>limits.sourceBytes)fail("resource-limit");return result;
}
const simpleFormats=new Set(["breditor/strong","breditor-inline/italic","breditor-inline/strike","breditor-inline/code","breditor-inline/link"]);
function simpleInline(node:Element):boolean {
  if(Object.keys(node.properties).some(k=>k!=="breditor/block-id"&&k!=="breditor/level"))return false;
  return node.children.every(n=>n.kind==="text"&&!/(^ | $| {2}|[\t\r\n])/.test(n.text)&&n.formats.every(f=>simpleFormats.has(f.type))&&(!n.formats.some(f=>f.type==="breditor-inline/code")||n.formats.length===1)&&!n.formats.some(f=>f.type==="breditor-inline/link"&&f.properties["breditor-inline/new-window"]===true));
}
// `&` would start an entity and a run-leading `-` a list or thematic break, so both are escaped too.
const escape=(value:string)=>{if(value.includes("\u0000"))fail("unsupported-content");return value.replace(/[\\`*_[\]{}()#+.!<>~|&]/g,"\\$&").replace(/^-/,"\\-");};
const verifier=new MarkdownIt({html:false,linkify:false,typographer:false,breaks:false});
const tokenFormats:Record<string,string>={strong:"breditor/strong",em:"breditor-inline/italic",s:"breditor-inline/strike",link:"breditor-inline/link"};
type Segment=[text:string,formats:string];
function pushSegment(out:Segment[],text:string,formats:string):void {
  if(!text)return;const last=out.at(-1);if(last&&last[1]===formats)last[0]+=text;else out.push([text,formats]);
}
/**
 * Emphasis delimiters only open/close at CommonMark flanking positions, and adjacent runs
 * sharing a format emit touching delimiters. Rather than model those rules, re-parse the
 * emitted inline Markdown and require the same text/format sequence before using it.
 */
function inlineRoundTrips(nodes:readonly Node[],markdown:string):boolean {
  const expected:Segment[]=[];
  for(const n of nodes){
    if(n.kind!=="text")return false;
    const keys=n.formats.filter(f=>f.type!=="breditor-inline/link"||(typeof f.properties["breditor-inline/href"]==="string"&&safeUrl(f.properties["breditor-inline/href"])!==null)).map(f=>f.type).sort().join("+");
    pushSegment(expected,n.text,keys);
  }
  let tokens:Token[];
  try{tokens=verifier.parseInline(markdown,{})[0]?.children??[];}catch{return false;}
  const active=new Map<string,number>(),actual:Segment[]=[];
  const keys=(extra?:string)=>[...[...active].filter(([,count])=>count>0).map(([type])=>type),...(extra?[extra]:[])].sort().join("+");
  for(const token of tokens){
    const match=/^(strong|em|s|link)_(open|close)$/.exec(token.type);
    if(match){const type=tokenFormats[match[1]!]!;active.set(type,(active.get(type)??0)+(match[2]==="open"?1:-1));continue;}
    if(token.type==="text")pushSegment(actual,token.content,keys());
    else if(token.type==="code_inline")pushSegment(actual,token.content,keys("breditor-inline/code"));
    else return false;
  }
  return actual.length===expected.length&&actual.every(([text,formats],i)=>text===expected[i]![0]&&formats===expected[i]![1]);
}
/** An HTML block ends at a blank line, so blank lines inside fallback HTML become character references. */
const htmlBlock=(html:string)=>html.replace(/\n(?=[ \t]*\n)/g,"&#10;");
function inlineMarkdown(nodes:readonly Node[],b:Budget):string {
  return nodes.map(n=>{
    if(n.kind!=="text")fail("native-admission");let value=escape(n.text);
    for(const f of [...n.formats].reverse()){
      if(f.type==="breditor/strong")value=`**${value}**`;
      else if(f.type==="breditor-inline/italic")value=`*${value}*`;
      else if(f.type==="breditor-inline/strike")value=`~~${value}~~`;
      else if(f.type==="breditor-inline/code"){const tick="`".repeat(Math.max(1,...[...n.text.matchAll(/`+/g)].map(m=>m[0].length+1)));value=`${tick}${n.text.includes("`")?" ":""}${n.text}${n.text.includes("`")?" ":""}${tick}`;}
      else if(f.type==="breditor-inline/link"){
        const source=f.properties["breditor-inline/href"],href=typeof source==="string"?safeUrl(source):null;
        if(href){if(href!==source)b.loss("style-approximation");if(f.properties["breditor-inline/new-window"]===true)b.loss("markdown-feature");value=`[${value}](<${href.replace(/</g,"%3C").replace(/>/g,"%3E")}>)`;}else b.loss("unsafe-link");
      }
    }
    return value;
  }).join("");
}
export function exportMarkdownRoot(nodes:Node[],b:Budget,options:InterchangeOptions):string {
  const html=new HtmlExport(b,options);
  const block=(n:Node,depth=0):string=>{
    if(depth>limits.depth)fail("resource-limit");if(n.kind!=="element")fail("native-admission");
    const fallback=()=>{b.loss("markdown-feature");return htmlBlock(html.blocks([n],depth));};
    if(n.type==="breditor/paragraph"||n.type==="breditor/heading"){
      if(!n.children.length||!simpleInline(n)||!inlineRoundTrips(n.children,inlineMarkdown(n.children,new Budget())))return fallback();
      const inline=inlineMarkdown(n.children,b);return n.type==="breditor/heading"?`${"#".repeat(Number(property(n,"level")))} ${inline}`:inline;
    }
    if(n.type==="breditor/horizontal-rule")return"---";
    if(n.type==="breditor/code-block"){
      if(Object.keys(n.properties).some(k=>!["breditor/block-id","breditor/language"].includes(k)))return fallback();
      const content=n.children.map(t=>(t as Text).text).join("");
      // A fenced block appends a final LF. HTML preserves an absent final LF exactly.
      if(!content.endsWith("\n")||content.includes("\r"))return fallback();
      const fence="`".repeat(Math.max(3,...[...content.matchAll(/`+/g)].map(m=>m[0].length+1)));
      return `${fence}${String(property(n,"language")??"")}\n${content}${fence}`;
    }
    if(n.type==="breditor/blockquote")return n.children.map(v=>block(v,depth+1)).join("\n\n").split("\n").map(line=>`> ${line}`).join("\n");
    if(["breditor/bullet-list","breditor/ordered-list","breditor/task-list"].includes(n.type)){
      const ordered=n.type==="breditor/ordered-list",start=ordered?Number(property(n,"start")):1;if(start+n.children.length>999999999)return fallback();
      return n.children.map((item,i)=>{if(item.kind!=="element")fail("native-admission");const marker=ordered?`${start+i}. `:n.type==="breditor/task-list"?`- [${property(item,"checked")===true?"x":" "}] `:"- ",indent=ordered?marker.length:2,body=item.children.map(v=>block(v,depth+1)).join("\n\n"),lines=body.split("\n");return `${marker}${lines[0]}${lines.slice(1).map(line=>`\n${" ".repeat(indent)}${line}`).join("")}`;}).join("\n");
    }
    if(n.type==="breditor/table"){
      const rows=n.children as Element[],columns=property(n,"columns") as {id:string;width:number}[],merges=property(n,"merges") as unknown[];
      const cell=(r:Element,c:string)=>r.children.find((n):n is Element=>n.kind==="element"&&property(n,"column-id")===c)??fail("native-admission");
      const simple=rows.length>0&&columns.every(c=>c.width===120)&&merges.length===0&&rows.every((r,i)=>columns.every(c=>{const v=cell(r,c.id);return property(v,"header")===(i===0)&&v.children.length===1&&v.children[0]?.kind==="element"&&v.children[0].type==="breditor/paragraph"&&simpleInline(v.children[0])&&!v.children[0].children.some(t=>t.kind==="text"&&t.text.includes("|"));}));
      if(!simple||!rows.every(r=>columns.every(c=>{const cells=(cell(r,c.id).children[0] as Element).children;return inlineRoundTrips(cells,inlineMarkdown(cells,new Budget()));})))return fallback();
      const lines=rows.map(r=>`| ${columns.map(c=>inlineMarkdown((cell(r,c.id).children[0] as Element).children,b)).join(" | ")} |`);lines.splice(1,0,`| ${columns.map(()=>"---").join(" | ")} |`);return lines.join("\n");
    }
    if(n.type==="breditor/image"){
      // HTML retains captions, display size, exact whitespace and portable alt escaping.
      return fallback();
    }
    return fallback();
  };
  const result=nodes.map(n=>block(n)).join("\n\n");if(result.includes("\u0000"))fail("unsupported-content");if(result.length>limits.outputBytes||bytes(result)>limits.outputBytes)fail("resource-limit");return result;
}
