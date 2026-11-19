import {Budget,fail,limits} from "./budget.js";
import {attribute,htmlTree,isElement,plainText,type HtmlElement,type HtmlNode} from "./html_tree.js";
import {declarations,initialStyle,styleFor,type StyleState} from "./html_style.js";
import {append,element,nodeText,rootJson,type Element,type Node,type Text} from "./wire.js";
import type {InterchangeOptions} from "./types.js";
import {importTable,pixels} from "./html_table.js";
import {Stylesheets} from "./html_stylesheet.js";
import {canonicalLanguageTagV1} from "./language_tag.js";
import {imageHrefProperty,imageLinkNewWindowProperty,isImageLinkHrefV1} from "./image_link_href.js";
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
export interface ImportCapabilities {readonly listNumbering:boolean;readonly textLanguage?:boolean;readonly imageLinks?:boolean}
/** Candidate rich V4 native text-language format (Rust `text_language.rs`). */
export const textLanguageFormat="breditor/text-language",textLanguageTag="breditor/language-tag";
const htmlSpace=/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g;
/** Candidate rich V4 marker codes (Rust `list_numbering.rs`). Maps avoid inherited-key lookups. */
export const cssListStyles:ReadonlyMap<string,number>=new Map([["decimal",1],["lower-alpha",2],["lower-latin",2],["upper-alpha",3],["upper-latin",3],["lower-roman",4],["upper-roman",5]]);
const htmlListTypes:ReadonlyMap<string,number>=new Map([["1",1],["a",2],["A",3],["i",4],["I",5]]);
// `reversed` is interpreted (not reported as unknown) only for numbering-capable owners.
const numberingAttributes:ReadonlySet<string>=new Set(["reversed"]);
/** Flat producer list entry: Word desktop `mso-list` paragraphs or Word for the web `data-aria-level` items. */
interface FlatItem {level:number;group:string;ordered:boolean;numbers:number[];body:(state:StyleState)=>Element[]}
const romanPattern=/^m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/;
function roman(value:string):number|null {
  if(!value||!romanPattern.test(value))return null;const digits:Record<string,number>={i:1,v:5,x:10,l:50,c:100,d:500,m:1000};let total=0;
  for(let i=0;i<value.length;i++){const n=digits[value[i]!]!,next=digits[value[i+1]??""]??0;total+=n<next?-n:n;}return total;
}
/** Word marker text → candidate ordinals (preferred first), [] for a bullet glyph, null if unrecognized; `exact` = native decimal keeps it. */
function wordMarker(raw:string):{numbers:number[];exact:boolean}|null {
  const value=raw.replace(/\s+/g,"");
  let m=/^(\d{1,9})[.)]$/.exec(value);if(m)return{numbers:[Number(m[1])],exact:true};
  m=/^\((\d{1,9})\)$/.exec(value)??/^(?:\d{1,9}\.){1,8}(\d{1,9})\.?$/.exec(value);if(m)return{numbers:[Number(m[1])],exact:false};
  m=/^\(?([a-z]{1,4}|[A-Z]{1,4})[.)]$/.exec(value);
  if(m){
    const word=m[1]!.toLowerCase(),letters=word.split("").every(c=>c===word[0])?(word.length-1)*26+word.charCodeAt(0)-96:null,numeral=roman(word),numbers:number[]=[];
    // A lone `i` opens a roman list in Word's defaults; other ambiguous letters read alphabetically first.
    if(word==="i"&&numeral!==null)numbers.push(numeral);if(letters!==null)numbers.push(letters);if(numeral!==null&&!numbers.includes(numeral))numbers.push(numeral);
    if(numbers.length)return{numbers,exact:false};
  }
  if(wordBullets.test(value))return{numbers:[],exact:true};
  return null;
}
/** Conversion staging only. Native schema/clipboard admission is always required before publication. */
export class HtmlConversion {
  #css=new WeakMap<HtmlElement,Map<string,string>>();#blockDescendant=new WeakMap<HtmlElement,boolean>();#word=new WeakMap<HtmlElement,FlatItem|null>();
  #markers=new WeakSet<HtmlElement>();#checkboxes=new WeakSet<HtmlElement>();
  #preservedEnd=new WeakSet<Text>();
  constructor(readonly b:Budget,readonly options:InterchangeOptions,readonly sheets:Stylesheets,readonly capabilities:ImportCapabilities={listNumbering:false}){}
  css(node:HtmlElement):Map<string,string>{let value=this.#css.get(node);if(!value){const important=new Set<string>();value=this.sheets.apply(node,declarations(node,this.b,important),important);this.#css.set(node,value);}return value;}
  /** `interpreted` names attributes that structural conversion already consumed for this node. */
  style(node:HtmlElement,parent:StyleState,interpreted?:ReadonlySet<string>):StyleState {
    if(interpreted===undefined&&node.tagName==="ol"&&this.capabilities.listNumbering)interpreted=numberingAttributes;
    for(const attr of node.attrs)if(attr.namespace!==undefined||attr.prefix!==undefined||!this.#knownAttribute(node,attr.name,attr.value,interpreted))this.b.loss("unsupported-attribute");
    const state=styleFor(node,parent,this.b,this.css(node));
    if(this.capabilities.textLanguage)this.#language(node,state);
    return state;
  }
  /**
   * Candidate V4: `lang` (or the equivalent `xml:lang`) on any element becomes the text language
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
    // Namespace declarations (Office `xmlns:o`, Sheets `xmlns`) and `xml:lang` (same as `lang`) are syntax, not content.
    if(name==="xmlns"||name.startsWith("xmlns:")||name==="xml:lang")return true;
    // Structural ARIA that only restates the list/paragraph structure being imported.
    return name==="role"&&structuralRoles.has(value.trim().toLowerCase())||name==="aria-level"&&node.tagName==="li";
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
        const next=this.style(node,parent);
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
    if(pieces.some(p=>p.kind==="element")&&!(heading===undefined&&!Object.keys(state.layout).length&&pieces.every(p=>p.kind==="element")))this.b.loss("block-structure");
    if(!output.length)output.push(element(this.b,heading===undefined?"paragraph":"heading",[],layout));
    return output;
  }
  flow(nodes:readonly HtmlNode[],state=initialStyle(),insideTable=false):Element[] {
    const output:Element[]=[];let pending:HtmlNode[]=[];
    const flush=()=>{
      // A lone <br> between blocks renders one empty line (Docs, Notes): an empty paragraph, not a hard break.
      const significant=pending.filter(n=>isElement(n)||plainText(n).trim()!=="");
      if(state.whiteSpace!=="pre"&&significant.length===1&&isElement(significant[0]!)&&significant[0]!.tagName==="br"&&!interchangeNewline(significant[0]!)&&!this.#hidden(significant[0]!)&&attribute(significant[0]!,"data-breditor-placeholder")!=="1"){this.style(significant[0]!,state);output.push(element(this.b,"paragraph",[],{...state.layout}));}
      else if(significant.length||state.whiteSpace==="pre"&&pending.length)output.push(...this.prose(pending,state,undefined,false));
      pending=[];
    };
    const blank=(n:HtmlNode)=>!isElement(n)&&!plainText(n).trim();
    for(let i=0;i<nodes.length;i++){
      const node=nodes[i]!;
      if(!isElement(node)){pending.push(node);continue;}
      if(this.#hidden(node)&&node.tagName!=="style"){this.b.loss("removed-content");continue;}
      const word=this.#wordItem(node);
      if(word){flush();const items=[word];for(let j=i+1;j<nodes.length;j++){const n=nodes[j]!;if(blank(n)){i=j;continue;}const next=isElement(n)?this.#wordItem(n):null;if(!next||next.group!==word.group)break;items.push(next);i=j;}output.push(...this.#flatLists(items,state));continue;}
      if(this.#flatList(node)){
        flush();const items=this.#flatListItems(node,state);
        for(let j=i+1;j<nodes.length;j++){const n=nodes[j]!;if(blank(n)){i=j;continue;}if(!isElement(n)||!this.#flatList(n))break;items.push(...this.#flatListItems(n,state));i=j;}
        for(let start=0;start<items.length;){let end=start+1;while(end<items.length&&items[end]!.group===items[start]!.group)end++;output.push(...this.#flatLists(items.slice(start,end),state));start=end;}
        continue;
      }
      if(!blocks.has(node.tagName)&&!containers.has(node.tagName)&&!this.#containsBlock(node)){pending.push(node);continue;}
      flush();if(!this.#safe(node))continue;
      const next=this.style(node,state),tag=node.tagName;
      if(containers.has(tag)){if(tag==="center")next.layout["breditor/block-align"]=2;output.push(...this.flow(node.childNodes,next,insideTable));}
      else if(tag==="p"||/^h[1-6]$/.test(tag))output.push(...this.prose(node.childNodes,next,tag==="p"?undefined:Number(tag[1])));
      else if(tag==="ul"||tag==="ol")output.push(...this.#list(node,next,insideTable));
      else if(tag==="blockquote"){const body=this.flow(node.childNodes,next,insideTable);output.push(element(this.b,"blockquote",body.length?body:[element(this.b,"paragraph")]));}
      else if(tag==="pre")output.push(this.#code(node,next));
      else if(tag==="hr")output.push(element(this.b,"horizontal-rule"));
      else if(tag==="table"){if(insideTable)fail("unsupported-content");output.push(...importTable(this,node,next));}
      else if(tag==="figure")output.push(...this.#figure(node,next,insideTable));
      else {if(!inlineTags.has(tag))this.b.loss("unsupported-element");output.push(...this.flow(node.childNodes,next,insideTable));}
    }
    flush();return output;
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
    const rawWidth=attribute(node,"width")??this.css(node).get("width"),rawHeight=attribute(node,"height")??this.css(node).get("height"),width=pixels(rawWidth),height=pixels(rawHeight);
    if(rawWidth!==undefined||rawHeight!==undefined){if(width!==null&&height!==null&&width>=1&&width<=4096&&height>=1&&height<=4096){props["breditor/width"]=Math.round(width);props["breditor/height"]=Math.round(height);if(!Number.isInteger(width)||!Number.isInteger(height))this.b.loss("image-size");}else this.b.loss("image-size");}
    if(this.capabilities.imageLinks)this.#imageLink(props,state);
    return element(this.b,"image",[],props);
  }
  /**
   * Candidate V4: an enclosing safe `<a href>` (already canonicalized by the inline-link policy,
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
    // Candidate V4: `<figure><a href><img></a><figcaption>` is a linked image with a caption.
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
  /** Candidate V4 numbering of one `<ol>`: CSS `list-style-type` wins over the `type` hint, as in HTML. */
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
          if(!parsed||!parsed.exact)this.b.loss("list-numbering");
          item={level,group:`${m[1]}:${m[3]}`,ordered:Boolean(parsed?.numbers.length),numbers:parsed?.numbers??[],body:state=>this.prose(node.childNodes,this.style(node,state))};
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
    {const css=this.css(list).get("list-style-type")?.trim().toLowerCase();if(ordered&&css!==undefined&&css!=="decimal"&&cssListStyles.has(css))this.b.loss("list-numbering");}
    if(attribute(list,"type")!==undefined&&attribute(list,"type")!==(ordered?"1":"disc")||attribute(list,"reversed")!==undefined)this.b.loss("list-numbering");
    for(const li of list.childNodes){
      if(!isElement(li))continue;if(this.#hidden(li))fail("unsupported-content");
      // Native lists number in decimal only. Unless both the CSS list style and Word's level text
      // (`%1.` / `%1)`) prove a plain decimal ordinal, the letter/roman/compound format is reported.
      if(ordered){const type=(this.css(li).get("list-style-type")??this.css(list).get("list-style-type"))?.trim().toLowerCase();if(type!=="decimal"||!/^%[1-9][.)]?$/.test(attribute(li,"data-leveltext")??""))this.b.loss("list-numbering");}
      const position=Number(attribute(li,"data-aria-posinset")),numbers=ordered&&Number.isSafeInteger(position)&&position>=1&&position<=1_000_000_000?[position]:[];
      items.push({level:Number(attribute(li,"data-aria-level")),group:`aria:${attribute(li,"data-listid")??""}`,ordered,numbers,body:()=>{
        const body=this.flow(li.childNodes,this.style(li,listState,flatListAttributes));
        if(!body.length||!['breditor/paragraph','breditor/heading'].includes(body[0]!.type))body.unshift(element(this.b,"paragraph"));return body;
      }});
    }
    return items;
  }
  /** Rebuild nesting from flat (level, ordinal) entries. Skipped levels nest one deeper and are reported, never rejected. */
  #flatLists(items:FlatItem[],state:StyleState):Element[] {
    const output:Element[]=[],stack:{level:number;list:Element;item:Element;next:number|null}[]=[];
    if(items[0]!.level!==1)this.b.loss("block-structure");
    for(const item of items){
      while(stack.length&&stack.at(-1)!.level>item.level)stack.pop();
      let top=stack.at(-1),list:Element;const kind=item.ordered?"ordered-list":"bullet-list",same=top?.level===item.level?top:undefined;
      let number:number|null=null;
      if(item.ordered){number=same&&same.list.type==="breditor/ordered-list"&&same.next!==null&&(!item.numbers.length||item.numbers.includes(same.next))?same.next:item.numbers[0]??1;if(number<1){this.b.loss("list-numbering");number=1;}}
      const props=number===null?{}:{"breditor/start":number};
      if(!top||top.level<item.level){if(top&&item.level!==top.level+1)this.b.loss("block-structure");list=element(this.b,kind,[],props);if(top)top.item.children.push(list);else output.push(list);top={level:item.level,list,item:list,next:number};stack.push(top);}
      else if(top.list.type!==`breditor/${kind}`||number!==null&&number!==top.next){list=element(this.b,kind,[],props);if(stack.length>1)stack[stack.length-2]!.item.children.push(list);else output.push(list);top.list=list;}
      top.item=element(this.b,"list-item",item.body(state));top.list.children.push(top.item);top.next=number===null?null:number+1;
    }
    return output;
  }
}
/** WebKit/Blink trailing-selection marker (Docs, Notes, Safari); it is not authored content. */
function interchangeNewline(node:HtmlElement):boolean{return node.tagName==="br"&&(attribute(node,"class")??"").split(/\s+/).includes("Apple-interchange-newline");}
export function importHtmlContent(source:string,b:Budget,options:InterchangeOptions,capabilities:ImportCapabilities={listNumbering:false}):{root:string;kind:"text"|"flow"} {
  const sourceNodes=htmlTree(source,b),converter=new HtmlConversion(b,options,new Stylesheets(sourceNodes,b),capabilities),body=converter.flow(sourceNodes);
  const containsBlock=(n:HtmlNode):boolean=>isElement(n)&&(blocks.has(n.tagName)||n.childNodes.some(containsBlock));
  const inline=!sourceNodes.some(containsBlock)&&body.length===1&&body[0]!.type==="breditor/paragraph"&&Object.keys(body[0]!.properties).every(k=>k==="breditor/block-id")&&body[0]!.children.length>0&&body[0]!.children.every(n=>n.kind==="text");
  return{root:rootJson(b,body),kind:inline?"text":"flow"};
}
