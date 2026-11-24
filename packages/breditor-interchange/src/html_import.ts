import {Budget,fail,limits} from "./budget.js";
import {attribute,htmlTree,isElement,plainText,type HtmlElement,type HtmlNode} from "./html_tree.js";
import {declarations,initialStyle,styleFor,type StyleState} from "./html_style.js";
import {append,element,nodeText,rootJson,type Element,type Node,type Text} from "./wire.js";
import type {InterchangeOptions} from "./types.js";
import {importTable,pixels} from "./html_table.js";
import {Stylesheets} from "./html_stylesheet.js";
import {canonicalLanguageTagV1} from "./language_tag.js";
import {imageHrefProperty,imageLinkNewWindowProperty,isImageLinkHrefV1} from "./image_link_href.js";
import {mentionFormat,mentionFromSpan} from "./mention.js";
import {isRubyAnnotation,rubyFormat,rubyLiteral} from "./ruby.js";
import {anchorName,bookmarkProperty,internalLinkFormat} from "./bookmark.js";
/** Attributes consumed by a recognized V4 mention span. */
const mentionAttributes:ReadonlySet<string>=new Set(["data-mention-kind","data-mention-id"]);
const blocks=new Set(["p","div","h1","h2","h3","h4","h5","h6","ul","ol","li","pre","blockquote","table","figure","hr","section","article","main","header","footer"]);
// `google-sheets-html-origin` is Google Sheets' transparent producer wrapper around its table.
const containers=new Set(["div","section","article","main","header","footer","html","head","body","center","google-sheets-html-origin"]);
const removed=new Set(["script","style","iframe","object","embed","template","noscript","canvas","audio","video","source"]);
// Non-rendered document metadata (Office ProgId/Generator, File-List companions, charset, empty titles).
const metadata=new Set(["meta","title","base","link"]);
const inlineTags=new Set(["span","b","strong","i","em","u","s","strike","del","code","sub","sup","a","small","big","font","label","abbr","mark","wbr"]);
const knownAttributes=new Set(["style","class","id","dir","align","lang","href","target","rel","src","alt","width","height","start","value","rowspan","colspan","span","type","checked","disabled","data-breditor-placeholder","data-breditor-cell-partition","data-breditor-cell-row","data-breditor-cell-column","data-breditor-cell-header"]);
const structuralRoles=new Set(["presentation","none","list","listitem"]);
// Word for the web flat-list metadata that structural conversion consumes.
const flatListAttributes:ReadonlySet<string>=new Set(["data-aria-level","data-aria-posinset","data-listid","aria-setsize"]);
const wordBullets=/^[·•●○◦▪■□◆◇►➢➤✓✔\-–—*o§Øüvqnl]$/;
/** Target-owner capabilities read once by the adapter; they select conversion, never admission. */
export interface ImportCapabilities {readonly listNumbering:boolean;readonly textLanguage?:boolean;readonly imageLinks?:boolean;readonly details?:boolean;readonly mentions?:boolean;readonly tableCaptions?:boolean;readonly pageBreaks?:boolean;readonly bookmarks?:boolean;readonly ruby?:boolean}
/** Rich V4 native text-language format (Rust `text_language.rs`). */
export const textLanguageFormat="breditor/text-language",textLanguageTag="breditor/language-tag";
const htmlSpace=/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g;
/** Rich V4 marker codes (Rust `list_numbering.rs`). Maps avoid inherited-key lookups. */
export const cssListStyles:ReadonlyMap<string,number>=new Map([["decimal",1],["lower-alpha",2],["lower-latin",2],["upper-alpha",3],["upper-latin",3],["lower-roman",4],["upper-roman",5]]);
const htmlListTypes:ReadonlyMap<string,number>=new Map([["1",1],["a",2],["A",3],["i",4],["I",5]]);
// `reversed` is interpreted (not reported as unknown) only for numbering-capable owners.
const numberingAttributes:ReadonlySet<string>=new Set(["reversed"]);
// `open` is persisted section state, interpreted only for section-capable (V4) owners.
const detailsAttributes:ReadonlySet<string>=new Set(["open"]);
/** Rich V4 section nesting bound (Rust `RICH_DETAILS_MAX_DEPTH`). */
const maxDetailsDepth=8;
/**
 * Rich V4 page breaks. CSS forced-break properties (`page-break-before/after`, `break-before/after`)
 * and Word's break markers are consumed only for page-break-capable owners; V1–V3 keep reporting them as
 * `unsupported-style`. `left`/`right`/`recto`/`verso` force a page too but name a page side the native block
 * cannot keep (`style-approximation`).
 */
const breakProperties=["page-break-before","page-break-after","break-before","break-after"] as const;
const pageBreakValues:ReadonlyMap<string,boolean>=new Map([["always",true],["page",true],["left",false],["right",false],["recto",false],["verso",false]]);
/** Declarations a recognized Word/Docs page-break carrier holds besides the break itself. */
const carrierProperties:ReadonlySet<string>=new Set([...breakProperties,"mso-special-character","mso-break-type","display"]);
/** `clear` is Word's `<br clear=all>` page-break carrier attribute. */
const carrierAttributes:ReadonlySet<string>=new Set(["clear"]);
interface PageBreaks {readonly before:boolean;readonly after:boolean}
/**
 * Flat producer list entry: Word desktop `mso-list` paragraphs or Word for the web `data-aria-level` items.
 * `styles` (numbering-capable owners only) parallels `numbers` (or has one entry when `numbers` is empty) with each
 * reading's V4 marker code; undefined is decimal. Absent keeps the original decimal-only reconstruction.
 */
interface FlatItem {level:number;group:string;ordered:boolean;numbers:number[];styles?:(number|undefined)[];body:(state:StyleState)=>Element[]}
const romanPattern=/^m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/;
function roman(value:string):number|null {
  if(!value||!romanPattern.test(value))return null;const digits:Record<string,number>={i:1,v:5,x:10,l:50,c:100,d:500,m:1000};let total=0;
  for(let i=0;i<value.length;i++){const n=digits[value[i]!]!,next=digits[value[i+1]??""]??0;total+=n<next?-n:n;}return total;
}
/**
 * Word marker text → candidate ordinals (preferred first), [] for a bullet glyph, null if unrecognized.
 * `styles[i]` is the V4 marker code reading `numbers[i]` (undefined = decimal, the native default).
 * `exact` = native decimal keeps it; `styled` = a numbering-capable (V4) owner keeps it exactly: a plain
 * `N.`/`N)`, or a letter/roman `a.`/`a)` read as lower/upper alpha or roman with that start.
 */
function wordMarker(raw:string):{numbers:number[];styles:(number|undefined)[];exact:boolean;styled:boolean}|null {
  const value=raw.replace(/\s+/g,"");
  let m=/^(\d{1,9})[.)]$/.exec(value);if(m)return{numbers:[Number(m[1])],styles:[undefined],exact:true,styled:true};
  m=/^\((\d{1,9})\)$/.exec(value)??/^(?:\d{1,9}\.){1,8}(\d{1,9})\.?$/.exec(value);if(m)return{numbers:[Number(m[1])],styles:[undefined],exact:false,styled:false};
  m=/^(\(?)([a-z]{1,4}|[A-Z]{1,4})[.)]$/.exec(value);
  if(m){
    const upper=m[2]!!==m[2]!.toLowerCase(),word=m[2]!.toLowerCase(),letters=word.split("").every(c=>c===word[0])?(word.length-1)*26+word.charCodeAt(0)-96:null,numeral=roman(word),numbers:number[]=[],styles:(number|undefined)[]=[];
    const alpha=upper?3:2,romanStyle=upper?5:4,add=(n:number,style:number)=>{if(!numbers.includes(n)){numbers.push(n);styles.push(style);}};
    // A lone `i` opens a roman list in Word's defaults; other ambiguous letters read alphabetically first.
    if(word==="i"&&numeral!==null)add(numeral,romanStyle);if(letters!==null)add(letters,alpha);if(numeral!==null)add(numeral,romanStyle);
    // `(a)` keeps both parentheses, which a native `a.` marker cannot show.
    if(numbers.length)return{numbers,styles,exact:false,styled:!m[1]};
  }
  if(wordBullets.test(value))return{numbers:[],styles:[],exact:true,styled:true};
  return null;
}
/** Conversion staging only. Native schema/clipboard admission is always required before publication. */
export class HtmlConversion {
  #css=new WeakMap<HtmlElement,Map<string,string>>();#blockDescendant=new WeakMap<HtmlElement,boolean>();#word=new WeakMap<HtmlElement,FlatItem|null>();
  #markers=new WeakSet<HtmlElement>();#checkboxes=new WeakSet<HtmlElement>();
  #preservedEnd=new WeakSet<Text>();#detailsDepth=0;
  /** V4: nodes whose forced-break declarations were consumed, and page breaks derived from block properties. */
  #breakConsumed=new WeakSet<HtmlElement>();#carrier=new WeakSet<HtmlElement>();#soft=new WeakSet<Element>();
  /** V4: Word for the web items whose own `list-style-type` became their list's native style. */
  #listStyleConsumed=new WeakSet<HtmlElement>();
  /** V4: `<a name|id>` anchors already adopted or reported, and every adopted bookmark name. */
  #anchors=new WeakSet<HtmlElement>();#bookmarkNames=new Set<string>();
  constructor(readonly b:Budget,readonly options:InterchangeOptions,readonly sheets:Stylesheets,readonly capabilities:ImportCapabilities={listNumbering:false}){}
  css(node:HtmlElement):Map<string,string>{let value=this.#css.get(node);if(!value){const important=new Set<string>();value=this.sheets.apply(node,declarations(node,this.b,important),important);this.#css.set(node,value);}return value;}
  /** `interpreted` names attributes that structural conversion already consumed for this node. */
  style(node:HtmlElement,parent:StyleState,interpreted?:ReadonlySet<string>):StyleState {
    if(interpreted===undefined&&node.tagName==="ol"&&this.capabilities.listNumbering)interpreted=numberingAttributes;
    if(this.#anchors.has(node))interpreted=new Set([...(interpreted??[]),"name"]);
    for(const attr of node.attrs)if(attr.namespace!==undefined||attr.prefix!==undefined||!this.#knownAttribute(node,attr.name,attr.value,interpreted))this.b.loss("unsupported-attribute");
    const css=this.css(node),consumed=this.#breakConsumed.has(node)?this.#carrier.has(node)?carrierProperties:new Set<string>(breakProperties):undefined;
    const listStyle=this.#listStyleConsumed.has(node);
    // V4: `href="#name"` (or `#bm-name`) is an internal link; the external link policy never sees it.
    const internal=this.#internalHref(node),source=internal===undefined?node:{...node,attrs:node.attrs.filter(attr=>attr.name!=="href")};
    const state=styleFor(source,parent,this.b,consumed||listStyle?new Map([...css].filter(([name])=>!consumed?.has(name)&&!(listStyle&&name==="list-style-type"))):css);
    if(internal!==undefined){state.formats.set("breditor-inline/link",internalLinkFormat(internal));if(attribute(node,"target")?.toLowerCase()==="_blank")this.b.loss("unsupported-attribute");}
    if(this.capabilities.textLanguage)this.#language(node,state);
    return state;
  }
  /**
   * V4: `lang` (or the equivalent `xml:lang`) on any element becomes the text language
   * of every text run below it, exactly as HTML inherits it; a block-level value therefore tags the
   * block's runs. A well-formed tag is stored in canonical case. `lang=""` means unknown and
   * removes an inherited language without a notice. A malformed, private-use, extension or
   * over-long tag also removes it and reports `unsupported-attribute`. When both attributes are
   * present `lang` is used and a disagreeing `xml:lang` is reported.
   */
  #language(node:HtmlElement,state:StyleState):void {
    const plain=attribute(node,"lang"),xml=attribute(node,"xml:lang"),raw=plain??xml;
    if(raw===undefined)return;
    const value=raw.replace(htmlSpace,"");
    if(plain!==undefined&&xml!==undefined&&canonicalLanguageTagV1(xml.replace(htmlSpace,""))!==canonicalLanguageTagV1(value))this.b.loss("unsupported-attribute");
    if(!value){state.formats.delete(textLanguageFormat);return;}
    const tag=canonicalLanguageTagV1(value);
    if(tag===null){state.formats.delete(textLanguageFormat);this.b.loss("unsupported-attribute");return;}
    state.formats.set(textLanguageFormat,{type:textLanguageFormat,properties:{[textLanguageTag]:tag}});
  }
  #knownAttribute(node:HtmlElement,name:string,value:string,interpreted?:ReadonlySet<string>):boolean {
    if(knownAttributes.has(name)||interpreted?.has(name))return true;
    if(this.#carrier.has(node)&&carrierAttributes.has(name))return true;
    // Namespace declarations (Office `xmlns:o`, Sheets `xmlns`) and `xml:lang` (same as `lang`) are syntax, not content.
    if(name==="xmlns"||name.startsWith("xmlns:")||name==="xml:lang")return true;
    // Structural ARIA that only restates the list/paragraph structure being imported.
    return name==="role"&&structuralRoles.has(value.trim().toLowerCase())||name==="aria-level"&&node.tagName==="li";
  }
  /** Bookmark-capable owners only: the bookmark name of an `<a href="#…">` fragment in the native grammar. */
  #internalHref(node:HtmlElement):string|undefined {
    if(!this.capabilities.bookmarks||node.tagName!=="a")return undefined;
    const raw=attribute(node,"href");
    return raw?.startsWith("#")?anchorName(raw.slice(1)):undefined;
  }
  /**
   * V4 anchors of one `<p>`, `<h1>`–`<h6>` or `<pre>`: its own `id`, then every `<a name>` /
   * `<a id>` inside it, in document order. Collected before the block converts so `name` is consumed.
   */
  #anchorCandidates(node:HtmlElement):string[] {
    if(!this.capabilities.bookmarks)return [];
    const found:string[]=[],own=attribute(node,"id");if(own!==undefined)found.push(own);
    const walk=(items:readonly HtmlNode[])=>{for(const item of items){if(!isElement(item))continue;
      if(item.tagName==="a"){const value=attribute(item,"name")??attribute(item,"id");if(value!==undefined){found.push(value);this.#anchors.add(item);}}
      walk(item.childNodes);}};
    walk(node.childNodes);return found;
  }
  /**
   * The first valid, unused candidate becomes the bookmark of the block's first paragraph, heading or code
   * block. Invalid names, names already used in this import and further anchors are reported
   * (`unsupported-attribute`): a document has at most one bookmark per block and unique names.
   */
  #adoptAnchors(candidates:readonly string[],output:readonly Element[],start:number):void {
    if(!candidates.length)return;
    const target=output.slice(start).find(n=>["breditor/paragraph","breditor/heading","breditor/code-block"].includes(n.type));
    for(const raw of candidates){
      const name=anchorName(raw);
      if(target&&name!==undefined&&!this.#bookmarkNames.has(name)&&target.properties[bookmarkProperty]===undefined){target.properties[bookmarkProperty]=name;this.#bookmarkNames.add(name);}
      else this.b.loss("unsupported-attribute");
    }
  }
  #metadata(node:HtmlElement):boolean {
    if(!metadata.has(node.tagName))return false;
    // A referenced external stylesheet is never loaded; its styling is reported, other links are companions.
    if(node.tagName==="link"&&(attribute(node,"rel")??"").toLowerCase().split(/\s+/).includes("stylesheet"))this.b.loss("unsupported-style");
    return true;
  }
  /** Producer-private paragraph-mark placeholders: Word `<o:p>` and Word for the web `EOP` runs holding only (no-break) spaces. */
  #paragraphMark(node:HtmlElement):boolean {
    return(node.tagName==="o:p"||node.tagName==="span"&&(attribute(node,"class")??"").split(/\s+/).includes("EOP"))&&node.childNodes.every(n=>!isElement(n))&&!/[^\t\n\f\r \u00a0]/.test(plainText(node));
  }
  #safe(node:HtmlElement):boolean {
    if(node.tagName==="style"&&this.sheets.consumed(node))return false;
    if(this.#metadata(node))return false;
    if(node.namespaceURI!=="http://www.w3.org/1999/xhtml"||removed.has(node.tagName)||this.#hidden(node)){this.b.loss("removed-content");return false;}return true;
  }
  #hidden(node:HtmlElement):boolean {
    if(attribute(node,"hidden")!==undefined)return true;
    const css=this.css(node);return css.get("display")?.trim().toLowerCase()==="none"||["hidden","collapse"].includes(css.get("visibility")?.trim().toLowerCase()??"")||css.get("mso-hide")?.trim().toLowerCase()==="all";
  }
  excluded(node:HtmlElement):boolean{return this.#hidden(node);}
  #containsBlock(node:HtmlElement):boolean {
    let value=this.#blockDescendant.get(node);if(value===undefined){value=node.childNodes.some(n=>isElement(n)&&(blocks.has(n.tagName)||this.#containsBlock(n)));this.#blockDescendant.set(node,value);}return value;
  }
  #inlineText(output:Node[],value:string,state:StyleState):void {
    if(state.whiteSpace==="normal")value=value.replace(/[\t\n\f\r ]+/g," ");
    else if(state.whiteSpace==="pre-line")value=value.replace(/[\t\f\r ]+/g," ");
    if(state.whiteSpace!=="pre"&&(!output.length||output.at(-1)?.kind==="element"||output.at(-1)?.kind==="text"&&/[ \n]$/.test((output.at(-1) as Text).text)))value=value.replace(/^ +/,"");
    if(!value)return;
    append(this.b,output,value,[...state.formats.values()]);
    const last=output.at(-1);if(last?.kind==="text"){if(state.whiteSpace==="pre")this.#preservedEnd.add(last);else this.#preservedEnd.delete(last);}
  }
  inline(nodes:readonly HtmlNode[],state:StyleState):Node[] {
    const output:Node[]=[];
    const walk=(items:readonly HtmlNode[],parent:StyleState)=>{
      for(const node of items){
        if(!isElement(node)){if(node.nodeName==="#text")this.#inlineText(output,plainText(node),parent);continue;}
        if(!this.#safe(node)||this.#markers.has(node)||this.#checkboxes.has(node)||this.#paragraphMark(node)||interchangeNewline(node))continue;
        // V4: Word's `<br clear=all style='page-break-before:always'>` splits the paragraph at a page break.
        if(node.tagName==="br"&&this.#breakCarrier(node)){this.style(node,parent);output.push(this.#pageBreak(false));continue;}
        // Opt-in ruby extension: each base/`<rt>` pair becomes base text carrying the annotation.
        if(node.tagName==="ruby"&&this.capabilities.ruby){this.#ruby(node,this.style(node,parent),walk);continue;}
        // V4: the exact exported mention span becomes a mention over its `@label` text.
        const mention=this.capabilities.mentions?mentionFromSpan(node.tagName,name=>attribute(node,name),plainText(node)):undefined;
        const next=this.style(node,parent,mention?mentionAttributes:undefined);
        if(mention)next.formats.set(mentionFormat,mention);
        if(node.tagName==="br"){if(attribute(node,"data-breditor-placeholder")!=="1")append(this.b,output,"\n",[...next.formats.values()]);continue;}
        if(node.tagName==="o:p"){walk(node.childNodes,next);continue;}
        if(node.tagName==="img"){const image=this.image(node,next);if(image)output.push(image);else this.#inlineText(output,attribute(node,"alt")??"",next);continue;}
        if(node.tagName==="input"||node.tagName==="button"||node.tagName==="select"||node.tagName==="textarea"){this.b.loss("removed-content");continue;}
        if(!inlineTags.has(node.tagName))this.b.loss("unsupported-element");
        if(node.tagName==="small"||node.tagName==="big"||node.tagName==="font"||node.tagName==="abbr")this.b.loss("unsupported-style");
        walk(node.childNodes,next);
      }
    };
    walk(nodes,state);return output;
  }
  /**
   * `<ruby>`: base nodes up to each `<rt>` take that annotation (`rp` is presentation, `rb` unwraps).
   * The reading is whitespace-collapsed and must satisfy the annotation policy; otherwise, or for
   * a base without `<rt>`, the base stays plain text and the reading is dropped (`removed-content`).
   * Nested annotation containers (`rtc`) are reported as `unsupported-element`.
   */
  #ruby(node:HtmlElement,state:StyleState,walk:(items:readonly HtmlNode[],parent:StyleState)=>void):void {
    let base:HtmlNode[]=[];
    const emit=(annotation?:string)=>{if(!base.length)return;walk(base,annotation===undefined?state:{...state,formats:new Map(state.formats).set(rubyFormat,rubyLiteral(annotation))});base=[];};
    for(const child of node.childNodes){
      if(!isElement(child)){base.push(child);continue;}
      if(child.tagName==="rp")continue;
      if(child.tagName==="rb"){base.push(...child.childNodes);continue;}
      if(child.tagName==="rtc"){this.b.loss("unsupported-element");continue;}
      if(child.tagName!=="rt"){base.push(child);continue;}
      const reading=plainText(child).replace(/[\t\n\f\r ]+/g," ").replace(htmlSpace,"");
      if(base.length&&isRubyAnnotation(reading))emit(reading);else{if(reading)this.b.loss("removed-content");emit();}
    }
    emit();
  }
  #trim(runs:Node[],state:StyleState):void {
    if(state.whiteSpace==="pre")return;
    const last=runs.at(-1);
    if(last?.kind==="text"&&!this.#preservedEnd.has(last))last.text=last.text.replace(/ +$/,"");
    while(runs[0]?.kind==="text"&&!(runs[0] as Text).text)runs.shift();while(runs.at(-1)?.kind==="text"&&!(runs.at(-1) as Text).text)runs.pop();
  }
  prose(nodes:readonly HtmlNode[],state:StyleState,heading?:number,allowEmpty=true):Element[] {
    const pieces=this.inline(nodes,state);this.#trim(pieces,state);
    // A sole native HTML placeholder is one empty paragraph, not a hard break.
    if(allowEmpty&&pieces.length===1&&pieces[0]?.kind==="text"&&pieces[0].text==="\n"&&nodes.length===1&&isElement(nodes[0]!)&&nodes[0]!.tagName==="br")pieces.length=0;
    if(!allowEmpty&&!pieces.length)return[];
    const output:Element[]=[],layout={...state.layout,...(heading===undefined?{}:{"breditor/level":heading})};let runs:Node[]=[];
    const flush=()=>{if(runs.length){output.push(element(this.b,heading===undefined?"paragraph":"heading",runs,layout));runs=[];}};
    for(const piece of pieces){if(piece.kind==="element"){flush();output.push(piece);}else runs.push(piece);}flush();
    // Lifting images out of an unstyled paragraph that holds nothing else (a Markdown block image) loses nothing.
    // A V4 page break splitting the paragraph loses nothing: the text either side stays in order.
    const lifted=pieces.filter(p=>p.kind==="element"&&p.type!=="breditor/page-break");
    if(lifted.length&&!(heading===undefined&&!Object.keys(state.layout).length&&pieces.every(p=>p.kind==="element")))this.b.loss("block-structure");
    if(!output.length)output.push(element(this.b,heading===undefined?"paragraph":"heading",[],layout));
    return output;
  }
  flow(nodes:readonly HtmlNode[],state=initialStyle(),insideTable=false):Element[] {
    const output:Element[]=[];let pending:HtmlNode[]=[];
    const flush=()=>{
      // A lone <br> between blocks renders one empty line (Docs, Notes): an empty paragraph, not a hard break.
      const significant=pending.filter(n=>isElement(n)||plainText(n).trim()!=="");
      if(state.whiteSpace!=="pre"&&significant.length===1&&isElement(significant[0]!)&&significant[0]!.tagName==="br"&&!interchangeNewline(significant[0]!)&&!this.#hidden(significant[0]!)&&attribute(significant[0]!,"data-breditor-placeholder")!=="1"&&!this.#breakCarrier(significant[0]!)){this.style(significant[0]!,state);output.push(element(this.b,"paragraph",[],{...state.layout}));}
      else if(significant.length||state.whiteSpace==="pre"&&pending.length)output.push(...this.prose(pending,state,undefined,false));
      pending=[];
    };
    const blank=(n:HtmlNode)=>!isElement(n)&&!plainText(n).trim();
    for(let i=0;i<nodes.length;i++){
      const node=nodes[i]!;
      if(!isElement(node)){pending.push(node);continue;}
      // V4: Google Docs' hidden `<hr style="page-break-before:always;display:none">` and our own
      // `<div style="break-after:page"></div>` are page-break carriers: each is exactly one page break.
      if((node.tagName==="hr"||node.tagName==="div"&&!this.#hidden(node))&&this.#breakCarrier(node)){flush();this.style(node,state);output.push(this.#pageBreak(false));continue;}
      if(this.#hidden(node)&&node.tagName!=="style"){this.b.loss("removed-content");continue;}
      const word=this.#wordItem(node);
      if(word){flush();const items=[word];for(let j=i+1;j<nodes.length;j++){const n=nodes[j]!;if(blank(n)){i=j;continue;}const next=isElement(n)?this.#wordItem(n):null;if(!next||next.group!==word.group)break;items.push(next);i=j;}output.push(...this.#flatLists(items,state));continue;}
      if(this.#flatList(node)){
        flush();const items=this.#flatListItems(node,state);
        for(let j=i+1;j<nodes.length;j++){const n=nodes[j]!;if(blank(n)){i=j;continue;}if(!isElement(n)||!this.#flatList(n))break;items.push(...this.#flatListItems(n,state));i=j;}
        for(let start=0;start<items.length;){let end=start+1;while(end<items.length&&items[end]!.group===items[start]!.group)end++;output.push(...this.#flatLists(items.slice(start,end),state));start=end;}
        continue;
      }
      if(node.tagName==="details"&&this.capabilities.details){flush();if(this.#safe(node))output.push(...this.#details(node,state,insideTable));continue;}
      if(!blocks.has(node.tagName)&&!containers.has(node.tagName)&&!this.#containsBlock(node)){pending.push(node);continue;}
      flush();if(!this.#safe(node))continue;
      // V4: forced breaks declared on a content block become page breaks around its output.
      const breaks=this.#blockBreaks(node),mark=output.length;
      const next=this.style(node,state),tag=node.tagName;
      if(containers.has(tag)){if(tag==="center")next.layout["breditor/block-align"]=2;output.push(...this.flow(node.childNodes,next,insideTable));}
      else if(tag==="p"||/^h[1-6]$/.test(tag)){const anchors=this.#anchorCandidates(node),start=output.length;output.push(...this.prose(node.childNodes,next,tag==="p"?undefined:Number(tag[1])));this.#adoptAnchors(anchors,output,start);}
      else if(tag==="ul"||tag==="ol")output.push(...this.#list(node,next,insideTable));
      else if(tag==="blockquote"){const body=this.flow(node.childNodes,next,insideTable);output.push(element(this.b,"blockquote",body.length?body:[element(this.b,"paragraph")]));}
      else if(tag==="pre"){const anchors=this.#anchorCandidates(node),start=output.length;output.push(this.#code(node,next));this.#adoptAnchors(anchors,output,start);}
      else if(tag==="hr")output.push(element(this.b,"horizontal-rule"));
      else if(tag==="table"){if(insideTable)fail("unsupported-content");output.push(...importTable(this,node,next));}
      else if(tag==="figure")output.push(...this.#figure(node,next,insideTable));
      else {if(!inlineTags.has(tag))this.b.loss("unsupported-element");output.push(...this.flow(node.childNodes,next,insideTable));}
      if(breaks?.before)output.splice(mark,0,this.#pageBreak(true));
      if(breaks?.after)output.push(this.#pageBreak(true));
    }
    flush();return output;
  }
  /** V4 forced page breaks named by one element's CSS; undefined when none (or not page-break capable). */
  #breaks(node:HtmlElement):(PageBreaks&{readonly exact:boolean})|undefined {
    if(!this.capabilities.pageBreaks)return undefined;
    const css=this.css(node),value=(name:string)=>{const raw=css.get(name)?.trim().toLowerCase();return raw===undefined?undefined:pageBreakValues.get(raw);};
    const before=value("break-before")??value("page-break-before"),after=value("break-after")??value("page-break-after");
    if(before===undefined&&after===undefined)return undefined;
    return {before:before!==undefined,after:after!==undefined,exact:before!==false&&after!==false};
  }
  /** A content-free `<br>`, `<hr>` or `<div>` whose only role is a forced page break (Word, Google Docs, our export). */
  #breakCarrier(node:HtmlElement):boolean {
    if(this.#carrier.has(node))return true;
    const breaks=this.#breaks(node);if(!breaks)return false;
    if(node.tagName!=="br"&&(node.childNodes.some(n=>isElement(n)||plainText(n).trim())))return false;
    if(!breaks.exact)this.b.loss("style-approximation");
    this.#carrier.add(node);this.#breakConsumed.add(node);return true;
  }
  #blockBreaks(node:HtmlElement):PageBreaks|undefined {
    const breaks=this.#breaks(node);if(!breaks)return undefined;
    if(!breaks.exact)this.b.loss("style-approximation");
    this.#breakConsumed.add(node);return breaks;
  }
  /** One page-break element; `soft` ones come from block properties and collapse like CSS forced breaks. */
  #pageBreak(soft:boolean):Element {const value=element(this.b,"page-break");if(soft)this.#soft.add(value);return value;}
  /**
   * V4 root normalization. A page break is admitted only as a direct child of the document root, so
   * one found inside a quote, list, section, table cell or caption is removed (`block-structure`), leaving an
   * empty paragraph where its container would otherwise be empty. At the root, a page break derived from a
   * block's CSS is dropped at the start or end of the content and next to another page break, as CSS
   * fragmentation would; explicit carriers are kept exactly.
   */
  pageBreakRoot(children:Element[]):Element[] {
    if(!this.capabilities.pageBreaks)return children;
    const strip=(node:Element):void=>{
      const before=node.children.length;
      node.children=node.children.filter(child=>{if(child.kind==="element"&&child.type==="breditor/page-break"){this.b.loss("block-structure");return false;}return true;});
      for(const child of node.children)if(child.kind==="element")strip(child);
      const emptied=node.children.length!==before&&(node.children.length===0||node.type==="breditor/details"&&node.children.length===1);
      if(emptied)node.children.push(element(this.b,"paragraph"));
      if(node.children.length!==before&&(node.type==="breditor/list-item"||node.type==="breditor/task-item")){const first=node.children[0];if(first?.kind!=="element"||!["breditor/paragraph","breditor/heading"].includes(first.type))node.children.unshift(element(this.b,"paragraph"));}
    };
    for(const child of children)if(child.type!=="breditor/page-break")strip(child);
    const isBreak=(node:Element|undefined)=>node?.type==="breditor/page-break";
    const output:Element[]=[];
    for(const [index,child] of children.entries()){
      if(isBreak(child)&&this.#soft.has(child)&&(output.length===0||index===children.length-1||isBreak(output.at(-1))||isBreak(children[index+1])))continue;
      output.push(child);
    }
    return output;
  }
  /**
   * V4 section: the first `<summary>` child element is the summary (as in HTML); a missing
   * one becomes an empty summary and reports `block-structure`, like any block found inside a summary
   * or a heading summary. `open` maps to persisted open state. Beyond the nesting bound a section is
   * lifted (summary text as a paragraph, then its body) with `block-structure`.
   */
  #details(node:HtmlElement,state:StyleState,insideTable:boolean):Element[] {
    const next=this.style(node,state,detailsAttributes),summary=node.childNodes.find((n):n is HtmlElement=>isElement(n)&&n.tagName==="summary");
    let runs:Node[]=[];const lead:Element[]=[];
    if(summary&&this.#safe(summary)){
      const blocks=this.prose(summary.childNodes,this.style(summary,next),undefined,true);
      const first=blocks[0];
      if(first&&(first.type==="breditor/paragraph"||first.type==="breditor/heading")){runs=[...first.children];lead.push(...blocks.slice(1));}
      else lead.push(...blocks);
      // A summary is one inline text line: block markup, block layout or extra blocks inside it are flattened or moved.
      if(lead.length||this.#containsBlock(summary)||first&&Object.keys(first.properties).some(k=>k!=="breditor/block-id"))this.b.loss("block-structure");
    }else if(!summary)this.b.loss("block-structure");
    const rest=node.childNodes.filter(n=>n!==summary);
    if(++this.#detailsDepth>maxDetailsDepth){
      this.b.loss("block-structure");const body=this.flow(rest,next,insideTable);this.#detailsDepth--;
      return [element(this.b,"paragraph",runs),...lead,...body];
    }
    const body=[...lead,...this.flow(rest,next,insideTable)];this.#detailsDepth--;
    return [element(this.b,"details",[element(this.b,"details-summary",runs),...(body.length?body:[element(this.b,"paragraph")])],attribute(node,"open")!==undefined?{"breditor/details-open":true}:{})];
  }
  image(node:HtmlElement,state:StyleState):Element|undefined {
    const src=attribute(node,"src")??"",rawAlt=attribute(node,"alt");let binding;
    // Office/LibreOffice temporary `file:` companions are producer-local paths, never host-owned
    // assets: report them without offering the path to the host registry.
    if(/^[\t\n\f\r ]*file:/i.test(src)){this.b.loss("image-reference");return undefined;}
    try{binding=this.options.resolveImage?.(Object.freeze({src,alt:rawAlt??null}));}catch{fail("asset-policy");}
    if(!binding){this.b.loss("image-reference");return undefined;}
    if(typeof binding.asset!=="string"||typeof binding.generation!=="string")fail("asset-policy");
    const missing=rawAlt===undefined||rawAlt!==""&&!rawAlt.trim(),alt=missing?"Image":rawAlt!;if(missing)this.b.loss("image-alt");
    const props:Record<string,unknown>={"breditor/image-id":this.b.id(),"breditor/asset-id":binding.asset,"breditor/asset-generation":binding.generation,"breditor/decorative":alt==="","breditor/alt-text":alt};
    const css=this.css(node),rawWidth=css.get("width")??attribute(node,"width"),rawHeight=css.get("height")??attribute(node,"height"),width=pixels(rawWidth),height=pixels(rawHeight);
    if(rawWidth!==undefined||rawHeight!==undefined){if(width!==null&&height!==null&&width>=1&&width<=4096&&height>=1&&height<=4096){props["breditor/width"]=Math.round(width);props["breditor/height"]=Math.round(height);if(!Number.isInteger(width)||!Number.isInteger(height))this.b.loss("image-size");}else this.b.loss("image-size");}
    if(this.capabilities.imageLinks)this.#imageLink(props,state);
    return element(this.b,"image",[],props);
  }
  /**
   * V4: an enclosing safe `<a href>` (already canonicalized by the inline-link policy,
   * unsafe hrefs reported as `unsafe-link` there) becomes the image's own link. A canonical target
   * outside the native subset reports `unsafe-link`; a decorative image (`alt=""`) cannot name a
   * link, so the link is dropped with `image-alt`.
   */
  #imageLink(props:Record<string,unknown>,state:StyleState):void {
    const link=state.formats.get("breditor-inline/link");if(!link)return;
    const href=link.properties["breditor-inline/href"];
    if(!isImageLinkHrefV1(href)){this.b.loss("unsafe-link");return;}
    if(props["breditor/decorative"]===true){this.b.loss("image-alt");return;}
    props[imageHrefProperty]=href;if(link.properties["breditor-inline/new-window"]===true)props[imageLinkNewWindowProperty]=true;
  }
  /** V4 owners only: an `<a href>` whose sole content is one `<img>` (whitespace aside). */
  #linkedImage(node:HtmlElement):HtmlElement|undefined {
    if(!this.capabilities.imageLinks||node.tagName!=="a"||attribute(node,"href")===undefined)return undefined;
    const elements=node.childNodes.filter(isElement);
    if(elements.length!==1||elements[0]!.tagName!=="img"||node.childNodes.some(n=>!isElement(n)&&plainText(n).trim()))return undefined;
    return elements[0];
  }
  #figure(node:HtmlElement,state:StyleState,insideTable:boolean):Element[] {
    const images:HtmlElement[]=[],captions:HtmlElement[]=[];let other=false;
    // V4: `<figure><a href><img></a><figcaption>` is a linked image with a caption.
    const anchors=new Map<HtmlElement,HtmlElement>();
    for(const n of node.childNodes){if(!isElement(n)){if(plainText(n).trim())other=true;}else if(n.tagName==="img")images.push(n);else if(n.tagName==="figcaption")captions.push(n);else{const linked=this.#linkedImage(n);if(linked){images.push(linked);anchors.set(linked,n);}else other=true;}}
    if(images.length!==1||captions.length>1||other){this.b.loss("block-structure");return this.flow(node.childNodes,state,insideTable);}
    const imageNode=images[0]!,caption=captions[0],anchor=anchors.get(imageNode);
    if(anchor&&this.#hidden(anchor)){this.b.loss("removed-content");return caption&&!this.#hidden(caption)?this.flow(caption.childNodes,this.style(caption,state),insideTable):[];}
    const body=caption&&!this.#hidden(caption)?this.flow(caption.childNodes,this.style(caption,state),insideTable):[];
    if(caption&&this.#hidden(caption))this.b.loss("removed-content");
    if(this.#hidden(imageNode)){this.b.loss("removed-content");return body;}
    const image=this.image(imageNode,this.style(imageNode,anchor?this.style(anchor,state):state));
    if(!image){const runs:Node[]=[];append(this.b,runs,attribute(imageNode,"alt")??"",[]);return [...(runs.length?[element(this.b,"paragraph",runs)]:[]),...body];}
    if(body.length){const runs:Node[]=[];for(const [i,n]of body.entries()){if(i)append(this.b,runs,"\n",[]);if(n.type==="breditor/paragraph"||n.type==="breditor/heading"){for(const run of n.children){if(run.kind==="text")append(this.b,runs,run.text,run.formats);}}else{append(this.b,runs,nodeText(n),[]);this.b.loss("block-structure");}}if(body.length!==1||body[0]!.type!=="breditor/paragraph")this.b.loss("block-structure");image.children=[element(this.b,"paragraph",runs)];}
    return[image];
  }
  #code(node:HtmlElement,state:StyleState):Element {
    const code=node.childNodes.find(n=>isElement(n)&&n.tagName==="code"),language=code&&isElement(code)?attribute(code,"class")?.split(/\s+/).find(c=>c.startsWith("language-"))?.slice(9):undefined;
    const collect=(n:HtmlNode):string=>{
      if(!isElement(n))return plainText(n);if(!this.#safe(n))return"";
      if(n.tagName==="br")return"\n";if(n.tagName==="img"){this.b.loss("image-reference");return attribute(n,"alt")??"";}
      if(!["pre","code","span"].includes(n.tagName)||n.attrs.some(a=>a.name==="style"))this.b.loss("unsupported-style");
      return n.childNodes.map(collect).join("");
    };
    const text=node.childNodes.map(collect).join(""),runs:Node[]=[];append(this.b,runs,text,[]);
    const props={...state.layout};if(language){if(/^[a-zA-Z0-9][a-zA-Z0-9+_.#-]{0,63}$/.test(language))props["breditor/language"]=language;else this.b.loss("unsupported-attribute");}
    return element(this.b,"code-block",runs,props);
  }
  #checkbox(node:HtmlElement):HtmlElement|undefined {
    for(const child of node.childNodes){if(!isElement(child)){if(plainText(child).trim())return undefined;continue;}if(child.tagName==="input"&&attribute(child,"type")?.toLowerCase()==="checkbox")return child;if(["p","span"].includes(child.tagName))return this.#checkbox(child);return undefined;}return undefined;
  }
  /** V4 numbering of one `<ol>`: CSS `list-style-type` wins over the `type` hint, as in HTML. */
  #numbering(node:HtmlElement):{props:Record<string,unknown>;reversed:boolean} {
    const props:Record<string,unknown>={},css=this.css(node).get("list-style-type")?.trim().toLowerCase(),type=attribute(node,"type");
    const style=css!==undefined?cssListStyles.get(css):type!==undefined?htmlListTypes.get(type):undefined;
    // Styling already reported other unrecognized CSS values; bullet markers on an `<ol>` are reported here.
    if(style===undefined&&(css!==undefined?["disc","circle","square"].includes(css):type!==undefined))this.b.loss("list-numbering");
    if(style!==undefined)props["breditor/list-style"]=style;
    const reversed=attribute(node,"reversed")!==undefined;if(reversed)props["breditor/list-reversed"]=true;
    return {props,reversed};
  }
  #list(node:HtmlElement,state:StyleState,insideTable:boolean):Element[] {
    const ordered=node.tagName==="ol",numbering=ordered&&this.capabilities.listNumbering?this.#numbering(node):undefined,step=numbering?.reversed?-1:1;
    const rawStart=attribute(node,"start");
    // HTML counts a reversed list without `start` down from its item count; V4 stores that start explicitly.
    const items=node.childNodes.filter(n=>isElement(n)&&n.tagName==="li"&&!this.#hidden(n)).length;
    const output:Element[]=[];let current:Element|undefined,ordinal=Number(rawStart??(numbering?.reversed?Math.max(items,1):1));
    if(!Number.isSafeInteger(ordinal)||ordinal>1_000_000_000)fail("unsupported-content");
    // Native ordered lists count from 1; CommonMark `0.` and HTML zero/negative starts are approximated, not rejected.
    if(ordinal<1){this.b.loss("list-numbering");ordinal=1;}
    if(ordered&&!numbering){
      const css=this.css(node).get("list-style-type")?.trim().toLowerCase();
      if(attribute(node,"type")!==undefined&&attribute(node,"type")!=="1"||attribute(node,"reversed")!==undefined)this.b.loss("list-numbering");
      // Formerly reported while styling; the count per list is unchanged.
      if(css!==undefined&&css!=="decimal"&&cssListStyles.has(css))this.b.loss("list-numbering");
    }else if(!ordered&&(attribute(node,"type")!==undefined&&attribute(node,"type")!=="disc"||attribute(node,"reversed")!==undefined))this.b.loss("list-numbering");
    // A continuation that a reversed count drove below 1 cannot be stored; it restarts at 1 and is reported.
    const listProps=():Record<string,unknown>=>{let start=ordinal;if(start<1){this.b.loss("list-numbering");start=1;}return {"breditor/start":start,...numbering?.props};};
    for(const child of node.childNodes){
      if(!isElement(child)){if(plainText(child).trim())fail("unsupported-content");continue;}
      // Google Docs and Cocoa HTML Writer (Notes/TextEdit/Pages) place a nested list directly in its
      // parent list after the item it belongs to; HTML renders it there, so it nests into that item.
      if((child.tagName==="ul"||child.tagName==="ol")&&!this.#hidden(child)){
        const nested=this.#list(child,this.style(child,state),insideTable),owner=current?.children.at(-1) as Element|undefined;
        if(owner)owner.children.push(...nested);
        else{this.b.loss("block-structure");current=element(this.b,ordered?"ordered-list":"bullet-list",[],ordered?listProps():{});output.push(current);current.children.push(element(this.b,"list-item",[element(this.b,"paragraph"),...nested]));ordinal+=step;}
        continue;
      }
      if(child.tagName!=="li"||this.#hidden(child))fail("unsupported-content");
      const checkbox=this.#checkbox(child),task=checkbox!==undefined;if(checkbox)this.#checkboxes.add(checkbox);
      const explicit=attribute(child,"value");if(ordered&&explicit!==undefined){const n=Number(explicit);if(!Number.isSafeInteger(n)||n<1||n>1_000_000_000)fail("unsupported-content");if(n!==ordinal){current=undefined;ordinal=n;this.b.loss("list-numbering");}}
      const kind=task?"task-list":ordered?"ordered-list":"bullet-list";
      if(!current||current.type!==`breditor/${kind}`){current=element(this.b,kind,[],ordered&&!task?listProps():{});output.push(current);}
      if(task&&ordered)this.b.loss("list-numbering");
      const body=this.flow(child.childNodes,this.style(child,state),insideTable);
      if(!body.length||!['breditor/paragraph','breditor/heading'].includes(body[0]!.type))body.unshift(element(this.b,"paragraph"));
      current.children.push(element(this.b,task?"task-item":"list-item",body,task?{"breditor/checked":attribute(checkbox!,"checked")!==undefined}:{}));ordinal+=step;
    }
    if(!output.length)this.b.loss("block-structure");return output;
  }
  #wordItem(node:HtmlElement):FlatItem|null {
    if(this.#word.has(node))return this.#word.get(node)!;
    let item:FlatItem|null=null;
    if(node.tagName==="p"&&!this.#hidden(node)){
      const declaration=this.css(node).get("mso-list"),m=declaration?/\bl(\d+)\s+level(\d+)\s+lfo(\d+)\b/i.exec(declaration):null;
      if(m){const level=Number(m[2]);if(level<1||level>16)fail("unsupported-content");
        const todo=[...node.childNodes];let marker:HtmlElement|undefined;
        while(todo.length){const n=todo.shift()!;if(isElement(n)){if(this.css(n).get("mso-list")?.toLowerCase()==="ignore"){marker=n;break;}todo.unshift(...n.childNodes);}}
        if(marker){
          this.#markers.add(marker);const parsed=wordMarker(plainText(marker).replace(/\u00a0/g," ").trim());
          // Unrecognized marker text (custom "Step %1:" formats) keeps list structure as bullets and reports it.
          // Numbering-capable owners keep letter and roman markers as native list styles (`styled`).
          const v4=this.capabilities.listNumbering;if(!parsed||!(v4?parsed.styled:parsed.exact))this.b.loss("list-numbering");
          item={level,group:`${m[1]}:${m[3]}`,ordered:Boolean(parsed?.numbers.length),numbers:parsed?.numbers??[],...(v4&&parsed?{styles:parsed.styles}:{}),body:state=>this.prose(node.childNodes,this.style(node,state))};
        }
        else this.b.loss("list-numbering");
      }
    }
    this.#word.set(node,item);return item;
  }
  /** Word for the web: a (wrapper div around a) ul/ol whose items all carry flat `data-aria-level` nesting. */
  #flatList(node:HtmlElement):{wrapper:HtmlElement|undefined;list:HtmlElement}|null {
    let wrapper:HtmlElement|undefined,list:HtmlElement|undefined=node;
    if(node.tagName==="div"){const elements=node.childNodes.filter(isElement);if(elements.length!==1||node.childNodes.some(n=>!isElement(n)&&plainText(n).trim()))return null;wrapper=node;list=elements[0];}
    if(!list||list.tagName!=="ul"&&list.tagName!=="ol"||this.#hidden(node)||this.#hidden(list))return null;
    let items=0;
    for(const child of list.childNodes){if(!isElement(child)){if(plainText(child).trim())return null;continue;}if(child.tagName!=="li"||!/^(?:[1-9]|1[0-6])$/.test(attribute(child,"data-aria-level")??""))return null;items++;}
    return items?{wrapper,list}:null;
  }
  #flatListItems(node:HtmlElement,state:StyleState):FlatItem[] {
    const {wrapper,list}=this.#flatList(node)!,outer=wrapper?this.style(wrapper,state):state;
    if(!this.#safe(list))return[];
    const listState=this.style(list,outer),ordered=list.tagName==="ol",items:FlatItem[]=[];
    const v4=this.capabilities.listNumbering;
    const listCss=this.css(list).get("list-style-type")?.trim().toLowerCase();
    const typeHint=attribute(list,"type");
    const htmlStyle=typeHint===undefined?undefined:htmlListTypes.get(typeHint);
    const supportedType=ordered&&v4?htmlStyle!==undefined:typeHint===(ordered?"1":"disc");
    const rawStart=ordered?attribute(list,"start"):undefined;
    // Numbering-capable owners judge each item's own style below; others report the list's non-decimal style once more.
    if(!v4&&ordered&&listCss!==undefined&&listCss!=="decimal"&&cssListStyles.has(listCss))this.b.loss("list-numbering");
    if(typeHint!==undefined&&!supportedType||attribute(list,"reversed")!==undefined)this.b.loss("list-numbering");
    for(const li of list.childNodes){
      if(!isElement(li))continue;if(this.#hidden(li))fail("unsupported-content");
      // V1–V3 lists number in decimal only. Unless both the CSS list style and Word's level text
      // (`%1.` / `%1)`) prove a plain decimal ordinal, the letter/roman/compound format is reported.
      // Numbering-capable owners keep decimal, lower/upper alpha and roman styles under the same level-text proof
      // (an unproven level text keeps the style but is reported); an item's own list-style-type is then consumed.
      let style:number|undefined;
      if(ordered){
        const itemCss=this.css(li).get("list-style-type")?.trim().toLowerCase();
        const css=itemCss??listCss;
        const code=css===undefined?htmlStyle:cssListStyles.get(css);
        style=v4&&code!==1?code:undefined;
        if(v4&&code!==undefined&&itemCss!==undefined)this.#listStyleConsumed.add(li);
        if((v4?code===undefined:code!==1)||!/^%[1-9][.)]?$/.test(attribute(li,"data-leveltext")??""))this.b.loss("list-numbering");
      }
      const aria=attribute(li,"data-aria-posinset"),position=Number(aria);
      const numbers=ordered&&Number.isSafeInteger(position)&&position>=1&&position<=1_000_000_000?[position]:[];
      // The producer's per-item ordinal wins. HTML start supplies only the
      // first ordinal when the wrapper has no position for that item.
      if(ordered&&items.length===0&&aria===undefined&&rawStart!==undefined){
        const start=Number(rawStart);
        if(!Number.isSafeInteger(start)||start>1_000_000_000)fail("unsupported-content");
        if(start<1)this.b.loss("list-numbering");
        numbers.push(Math.max(1,start));
      }
      items.push({level:Number(attribute(li,"data-aria-level")),group:`aria:${attribute(li,"data-listid")??""}`,ordered,numbers,...(v4&&ordered?{styles:[style]}:{}),body:()=>{
        const body=this.flow(li.childNodes,this.style(li,listState,flatListAttributes));
        if(!body.length||!['breditor/paragraph','breditor/heading'].includes(body[0]!.type))body.unshift(element(this.b,"paragraph"));return body;
      }});
    }
    return items;
  }
  /** Rebuild nesting from flat (level, ordinal) entries. Skipped levels nest one deeper and are reported, never rejected. */
  #flatLists(items:FlatItem[],state:StyleState):Element[] {
    const output:Element[]=[],stack:{level:number;list:Element;item:Element;next:number|null;style:number|undefined}[]=[];
    if(items[0]!.level!==1)this.b.loss("block-structure");
    for(const item of items){
      while(stack.length&&stack.at(-1)!.level>item.level)stack.pop();
      let top=stack.at(-1),list:Element;const kind=item.ordered?"ordered-list":"bullet-list",same=top?.level===item.level?top:undefined;
      let number:number|null=null,style:number|undefined;
      if(item.ordered){
        // Continue the open list with the reading (ordinal and, for V4 owners, marker style) it expects next.
        const open=same&&same.list.type==="breditor/ordered-list"&&same.next!==null?same:undefined,styles=item.styles;
        const reading=open?item.numbers.length?item.numbers.findIndex((n,i)=>n===open.next&&styles?.[i]===open.style):styles?.[0]===open.style?-2:-1:-1;
        if(open&&reading!==-1){number=open.next;style=styles?.[Math.max(reading,0)];}else{number=item.numbers[0]??1;style=styles?.[0];}
        if(number!==null&&number<1){this.b.loss("list-numbering");number=1;}
      }
      const props=number===null?{}:{"breditor/start":number,...(style===undefined?{}:{"breditor/list-style":style})};
      if(!top||top.level<item.level){if(top&&item.level!==top.level+1)this.b.loss("block-structure");list=element(this.b,kind,[],props);if(top)top.item.children.push(list);else output.push(list);top={level:item.level,list,item:list,next:number,style};stack.push(top);}
      else if(top.list.type!==`breditor/${kind}`||number!==null&&number!==top.next||style!==top.style){list=element(this.b,kind,[],props);if(stack.length>1)stack[stack.length-2]!.item.children.push(list);else output.push(list);top.list=list;top.style=style;}
      top.item=element(this.b,"list-item",item.body(state));top.list.children.push(top.item);top.next=number===null?null:number+1;
    }
    return output;
  }
}
/** WebKit/Blink trailing-selection marker (Docs, Notes, Safari); it is not authored content. */
function interchangeNewline(node:HtmlElement):boolean{return node.tagName==="br"&&(attribute(node,"class")??"").split(/\s+/).includes("Apple-interchange-newline");}
export function importHtmlContent(source:string,b:Budget,options:InterchangeOptions,capabilities:ImportCapabilities={listNumbering:false}):{root:string;kind:"text"|"flow"} {
  const sourceNodes=htmlTree(source,b),converter=new HtmlConversion(b,options,new Stylesheets(sourceNodes,b),capabilities),body=converter.pageBreakRoot(converter.flow(sourceNodes));
  const containsBlock=(n:HtmlNode):boolean=>isElement(n)&&(blocks.has(n.tagName)||n.childNodes.some(containsBlock));
  const inline=!sourceNodes.some(containsBlock)&&body.length===1&&body[0]!.type==="breditor/paragraph"&&Object.keys(body[0]!.properties).every(k=>k==="breditor/block-id")&&body[0]!.children.length>0&&body[0]!.children.every(n=>n.kind==="text");
  return{root:rootJson(b,body),kind:inline?"text":"flow"};
}
