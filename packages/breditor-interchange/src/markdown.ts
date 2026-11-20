import MarkdownIt,{type Token} from "markdown-it";
import {Budget,bytes,fail,limits,sourceWithinBudget} from "./budget.js";
import {HtmlExport,imageLink} from "./html_export.js";
import {property,type Element,type Node,type Text} from "./wire.js";
import {safeUrl} from "./safe_url.js";
import {autolinkRun} from "./autolink.js";
import {isImageLinkHrefV1} from "./image_link_href.js";
import type {InterchangeOptions} from "./types.js";
// Inline tokens a GFM autolink literal may start right after (`*`, `_`, `~` openers) or end right before.
const literalStarts:ReadonlySet<string>=new Set(["softbreak","hardbreak","em_open","strong_open","s_open"]);
const literalEnds:ReadonlySet<string>=new Set(["softbreak","hardbreak","em_close","strong_close","s_close"]);
/** Raw inline HTML whose text content is already a link or code: `<a …>…</a>`, `<code>…</code>`.
 * HTML ignores a self-closing slash on these, so `<a …/>` opens an element too. */
const inertHtml=/^<(\/?)(a|code)(?=[\s/>])/i;
/**
 * Opt-in GFM autolink literals under the native typed `autolink-v1` policy. Runs before `text_join`,
 * so backslash escapes and entities are still separate `text_special` tokens: a run touching one (or
 * any other adjacent non-delimiter inline token) continues past its text token and stays literal.
 * Text inside Markdown links, `<…>` autolinks, image labels and raw `<a>`/`<code>` HTML is never
 * scanned; code spans and code blocks are not text tokens. A rejected candidate is plain text.
 */
function autolinkLiterals(tokens:readonly Token[],observe:(token:Token)=>Token):void {
  for(const inline of tokens){
    if(inline.type!=="inline"||!inline.children)continue;
    const children=inline.children,out:Token[]=[];let links=0,inert=0;
    for(let i=0;i<children.length;i++){
      const token=children[i]!;
      if(token.type==="link_open")links++;else if(token.type==="link_close")links=Math.max(0,links-1);
      else if(token.type==="html_inline"){const m=inertHtml.exec(token.content.trim());if(m)inert=Math.max(0,inert+(m[1]?-1:1));}
      if(token.type!=="text"||links||inert){out.push(token);continue;}
      const prev=children[i-1],next=children[i+1],value=token.content;
      const startOk=!prev||literalStarts.has(prev.type)||(prev.type==="text"||prev.type==="text_special")&&/\p{White_Space}$/u.test(prev.content);
      const endOk=!next||literalEnds.has(next.type)||(next.type==="text"||next.type==="text_special")&&/^\p{White_Space}/u.test(next.content);
      let cursor=0;
      const push=(type:string,tag:string,nesting:1|0|-1,content="")=>{const t=observe(new MarkdownIt.Token(type,tag,nesting));t.content=content;t.level=token.level;out.push(t);return t;};
      for(const run of value.matchAll(/[^\p{White_Space}]+/gu)){
        const at=run.index;if(at===0&&!startOk||at+run[0].length===value.length&&!endOk)continue;
        const found=autolinkRun(run[0]);if(!found)continue;
        const from=at+found.start,to=at+found.end;
        if(from>cursor)push("text","",0,value.slice(cursor,from));
        const open=push("link_open","a",1);open.attrs=[["href",found.href]];open.markup="linkify";open.info="auto";
        push("text","",0,value.slice(from,to));push("link_close","a",-1).markup="linkify";
        cursor=to;
      }
      if(cursor===0)out.push(token);else if(cursor<value.length){token.content=value.slice(cursor);out.push(token);}
    }
    inline.children=out;
  }
}
/** CommonMark plus markdown-it's table/strike extensions, task markers and sanitized raw HTML;
 * `autolinks` adds GFM autolink literals under the native `autolink-v1` target policy. */
export function markdownHtml(source:string,b:Budget,autolinks=false):string {
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
  if(autolinks)md.core.ruler.before("text_join","breditor_autolink_literals",state=>{autolinkLiterals(state.tokens,observe);});
  const tokens=md.parse(source,{}),todo=[...tokens];
  while(todo.length){
    const token=todo.pop()!;observe(token);if(token.level>=limits.depth)fail("resource-limit");if(token.children)todo.push(...token.children);
    // Fence info after the language word, and raw comments/declarations/CDATA, have no native field and no rendered HTML.
    if(token.type==="fence"&&/\S\s+\S/.test(token.info.trim()))b.loss("unsupported-attribute");
    if((token.type==="html_block"||token.type==="html_inline")&&/<!--|<\?|<![A-Za-z[]/.test(token.content))b.loss("removed-content");
  }
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
/** Hard breaks are paragraph-only (ATX headings and table rows are single lines); alignment is table-column-only. */
function simpleInline(node:Element,breaks=false,align=false):boolean {
  if(Object.keys(node.properties).some(k=>k!=="breditor/block-id"&&k!=="breditor/level"&&!(align&&k==="breditor/block-align")))return false;
  return node.children.every(n=>n.kind==="text"&&!(breaks?/(^ | $| {2}|[\t\r])/:/(^ | $| {2}|[\t\r\n])/).test(n.text)&&n.formats.every(f=>simpleFormats.has(f.type))&&(!n.formats.some(f=>f.type==="breditor-inline/code")||n.formats.length===1)&&!n.formats.some(f=>f.type==="breditor-inline/link"&&f.properties["breditor-inline/new-window"]===true));
}
// `&` would start an entity. After a hard break a line-leading `-`/`=` could close a setext heading or start a
// list/rule, and `:` a table delimiter row; the inline verifier cannot see block rules, so every line start is escaped.
// The `:` of `://` is escaped too: with `.` (always escaped) this keeps literal URL text literal when it is
// reimported with opt-in autolink literals, because an escape ends a literal candidate.
const escape=(value:string)=>{if(value.includes("\u0000"))fail("unsupported-content");return value.replace(/[\\`*_[\]{}()#+.!<>~|&]/g,"\\$&").replace(/:(?=\/\/)/g,"\\:").replace(/^[-=:]/gm,"\\$&");};
const verifier=new MarkdownIt({html:false,linkify:false,typographer:false,breaks:false});
/** `<href>` must re-parse as one link to `href` with exactly that text (no percent-decoding or IDN display). */
function autolinkForm(href:string):boolean {
  if(!isImageLinkHrefV1(href)||safeUrl(href)!==href)return false;
  let tokens:Token[];try{tokens=verifier.parseInline(`<${href}>`,{})[0]?.children??[];}catch{return false;}
  return tokens.length===3&&tokens[0]?.type==="link_open"&&tokens[0].attrGet("href")===href&&tokens[1]?.type==="text"&&tokens[1].content===href&&tokens[2]?.type==="link_close";
}
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
  // Paragraph, heading and cell content is trimmed before inline parsing, so a final `\`+LF is a literal backslash.
  try{tokens=verifier.parseInline(markdown.trim(),{})[0]?.children??[];}catch{return false;}
  const active=new Map<string,number>(),actual:Segment[]=[];
  const keys=(extra?:string)=>[...[...active].filter(([,count])=>count>0).map(([type])=>type),...(extra?[extra]:[])].sort().join("+");
  for(const token of tokens){
    const match=/^(strong|em|s|link)_(open|close)$/.exec(token.type);
    if(match){const type=tokenFormats[match[1]!]!;active.set(type,(active.get(type)??0)+(match[2]==="open"?1:-1));continue;}
    if(token.type==="text")pushSegment(actual,token.content,keys());
    else if(token.type==="code_inline")pushSegment(actual,token.content,keys("breditor-inline/code"));
    else if(token.type==="hardbreak")pushSegment(actual,"\n",keys());
    else return false;
  }
  return actual.length===expected.length&&actual.every(([text,formats],i)=>text===expected[i]![0]&&formats===expected[i]![1]);
}
/** The image must re-parse as exactly one image with the same URL and plain alt text, wrapped
 * in exactly one link to `href` when the candidate V4 image is linked. */
function imageRoundTrips(markdown:string,src:string,alt:string,href?:string):boolean {
  let tokens:Token[];try{tokens=verifier.parseInline(markdown,{})[0]?.children??[];}catch{return false;}
  if(href!==undefined){
    if(tokens.length!==3||tokens[0]?.type!=="link_open"||tokens[0].attrGet("href")!==href||tokens[2]?.type!=="link_close")return false;
    tokens=tokens.slice(1,2);
  }
  const image=tokens[0],label=image?.children??[];
  return tokens.length===1&&image?.type==="image"&&image.attrGet("src")===src&&label.every(t=>t.type==="text")&&label.map(t=>t.content).join("")===alt;
}
// A same-window candidate V4 image link is expressible as `[![alt](src)](href)`; a new-window one is not.
const imageKeys=new Set(["breditor/block-id","breditor/image-id","breditor/asset-id","breditor/asset-generation","breditor/decorative","breditor/alt-text","breditor/image-href"]);
const alignMarkers:Readonly<Record<string,string>>={none:"---",5:":---",2:":---:",6:"---:"};
const destination=(url:string)=>`<${url.replace(/</g,"%3C").replace(/>/g,"%3E")}>`;
/** An HTML block ends at a blank line, so blank lines inside fallback HTML become character references. */
const htmlBlock=(html:string)=>html.replace(/\n(?=[ \t]*\n)/g,"&#10;");
function inlineMarkdown(nodes:readonly Node[],b:Budget):string {
  return nodes.map(n=>{
    if(n.kind!=="text")fail("native-admission");
    // A same-window link whose text is exactly its canonical target uses the `<url>` autolink form when that re-parses exactly.
    const auto=n.formats.find(f=>f.type==="breditor-inline/link"&&f.properties["breditor-inline/href"]===n.text&&f.properties["breditor-inline/new-window"]!==true&&!n.formats.some(c=>c.type==="breditor-inline/code")&&autolinkForm(n.text));
    let value=auto?`<${n.text}>`:escape(n.text).replace(/\n/g,"\\\n");
    for(const f of [...n.formats].reverse()){
      if(f===auto)continue;
      if(f.type==="breditor/strong")value=`**${value}**`;
      else if(f.type==="breditor-inline/italic")value=`*${value}*`;
      else if(f.type==="breditor-inline/strike")value=`~~${value}~~`;
      else if(f.type==="breditor-inline/code"){const tick="`".repeat(Math.max(1,...[...n.text.matchAll(/`+/g)].map(m=>m[0].length+1)));value=`${tick}${n.text.includes("`")?" ":""}${n.text}${n.text.includes("`")?" ":""}${tick}`;}
      else if(f.type==="breditor-inline/link"){
        const source=f.properties["breditor-inline/href"],href=typeof source==="string"?safeUrl(source):null;
        if(href){if(href!==source)b.loss("style-approximation");if(f.properties["breditor-inline/new-window"]===true)b.loss("markdown-feature");value=`[${value}](${destination(href)})`;}else b.loss("unsafe-link");
      }
    }
    return value;
  }).join("");
}
export function exportMarkdownRoot(nodes:Node[],b:Budget,options:InterchangeOptions):string {
  const html=new HtmlExport(b,options);
  // Adjacent lists sharing a marker merge into one Markdown list, so each next one alternates `-`/`*` or `.`/`)`.
  const sequence=(items:readonly Node[],depth:number):string=>{
    let last="",flip=false;
    return items.map(v=>{const kind=v.kind!=="element"?"":v.type==="breditor/ordered-list"?"ordered":v.type==="breditor/bullet-list"||v.type==="breditor/task-list"?"bullet":"";flip=kind!==""&&kind===last&&!flip;last=kind;return block(v,depth,flip);}).join("\n\n");
  };
  const block=(n:Node,depth:number,flip=false):string=>{
    if(depth>limits.depth)fail("resource-limit");if(n.kind!=="element")fail("native-admission");
    const fallback=()=>{b.loss("markdown-feature");return htmlBlock(html.blocks([n],depth));};
    if(n.type==="breditor/paragraph"||n.type==="breditor/heading"){
      if(!n.children.length||!simpleInline(n,n.type==="breditor/paragraph")||!inlineRoundTrips(n.children,inlineMarkdown(n.children,new Budget())))return fallback();
      const inline=inlineMarkdown(n.children,b);return n.type==="breditor/heading"?`${"#".repeat(Number(property(n,"level")))} ${inline}`:inline;
    }
    if(n.type==="breditor/horizontal-rule")return"---";
    if(n.type==="breditor/code-block"){
      if(Object.keys(n.properties).some(k=>!["breditor/block-id","breditor/language"].includes(k)))return fallback();
      const content=n.children.map(t=>(t as Text).text).join("");
      // A fenced block appends a final LF to nonempty content. HTML preserves an absent final LF exactly.
      if(content&&!content.endsWith("\n")||content.includes("\r"))return fallback();
      const fence="`".repeat(Math.max(3,...[...content.matchAll(/`+/g)].map(m=>m[0].length+1)));
      return `${fence}${String(property(n,"language")??"")}\n${content}${fence}`;
    }
    if(n.type==="breditor/blockquote")return sequence(n.children,depth+1).split("\n").map(line=>line?`> ${line}`:">").join("\n");
    if(["breditor/bullet-list","breditor/ordered-list","breditor/task-list"].includes(n.type)){
      const ordered=n.type==="breditor/ordered-list",start=ordered?Number(property(n,"start")):1,bullet=flip?"*":"-";if(start+n.children.length>999999999)return fallback();
      // CommonMark has only ascending decimal markers: letter, roman or reversed V4 lists keep exact HTML.
      if(ordered&&(property(n,"list-reversed")!==undefined||property(n,"list-style")!==undefined&&property(n,"list-style")!==1))return fallback();
      return n.children.map((item,i)=>{if(item.kind!=="element")fail("native-admission");const marker=ordered?`${start+i}${flip?")":"."} `:n.type==="breditor/task-list"?`${bullet} [${property(item,"checked")===true?"x":" "}] `:`${bullet} `,indent=ordered?marker.length:2,lines=sequence(item.children,depth+1).split("\n");return `${marker}${lines[0]}${lines.slice(1).map(line=>`\n${line?" ".repeat(indent):""}${line}`).join("")}`;}).join("\n");
    }
    if(n.type==="breditor/table"){
      // GFM tables have no caption: a candidate V4 captioned table keeps exact HTML (`markdown-feature`).
      const tail=n.children.at(-1);if(tail?.kind==="element"&&tail.type==="breditor/paragraph")return fallback();
      const rows=n.children as Element[],columns=property(n,"columns") as {id:string;width:number}[],merges=property(n,"merges") as unknown[];
      const cell=(r:Element,c:string)=>r.children.find((n):n is Element=>n.kind==="element"&&property(n,"column-id")===c)??fail("native-admission");
      const simple=rows.length>0&&columns.every(c=>c.width===120)&&merges.length===0&&rows.every((r,i)=>columns.every(c=>{const v=cell(r,c.id);return property(v,"header")===(i===0)&&v.children.length===1&&v.children[0]?.kind==="element"&&v.children[0].type==="breditor/paragraph"&&simpleInline(v.children[0],false,true)&&!v.children[0].children.some(t=>t.kind==="text"&&t.text.includes("|"));}));
      if(!simple)return fallback();
      // GFM alignment is per column: left/center/right only, uniform from header to last row.
      const content=(r:Element,c:string)=>cell(r,c).children[0] as Element,align=columns.map(c=>{const values=new Set(rows.map(r=>String(property(content(r,c.id),"block-align")??"none")));return values.size===1?alignMarkers[[...values][0]!]:undefined;});
      if(align.some(a=>a===undefined)||!rows.every(r=>columns.every(c=>{const cells=content(r,c.id).children;return inlineRoundTrips(cells,inlineMarkdown(cells,new Budget()));})))return fallback();
      const lines=rows.map(r=>`| ${columns.map(c=>inlineMarkdown(content(r,c.id).children,b)).join(" | ")} |`);lines.splice(1,0,`| ${align.join(" | ")} |`);return lines.join("\n");
    }
    if(n.type==="breditor/image"){
      // HTML retains captions, display size and alt text a Markdown label cannot carry exactly.
      const alt=property(n,"alt-text");
      if(n.children.length||Object.keys(n.properties).some(k=>!imageKeys.has(k))||typeof alt!=="string"||property(n,"decorative")!==(alt==="")||alt!==""&&!alt.trim())return fallback();
      const src=new HtmlExport(new Budget(),options).imageUrl(n);if(!src)return fallback();
      const link=imageLink(n),image=`![${escape(alt)}](${destination(src)})`,markdown=link?`[${image}](${destination(link.href)})`:image;
      return imageRoundTrips(markdown,src,alt,link?.href)?markdown:fallback();
    }
    return fallback();
  };
  const result=sequence(nodes,0);if(result.includes("\u0000"))fail("unsupported-content");if(result.length>limits.outputBytes||bytes(result)>limits.outputBytes)fail("resource-limit");return result;
}
