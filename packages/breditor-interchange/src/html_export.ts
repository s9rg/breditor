import {Budget,bytes,fail,limits} from "./budget.js";
import {escapeAttribute as a,escapeText as t,safeUrl} from "./safe_url.js";
import {nodeText,property,stringProperty,type Element,type Literal,type Node} from "./wire.js";
import type {ImportedAsset,InterchangeOptions} from "./types.js";
import {isCanonicalLanguageTagV1} from "./language_tag.js";
import {isImageLinkHrefV1} from "./image_link_href.js";
import {mentionUnits} from "./mention.js";
import {rubyFormat,rubyUnits} from "./ruby.js";
import {bookmarkIdPrefix,internalLinkOf,isBookmarkName} from "./bookmark.js";
/** Export only native-admitted DTOs. Every output tag, attribute and CSS property is library-owned. */
export class HtmlExport {
  /** `bookmarks`: the source owner is bookmark-capable (V4), so anchors and internal links are
   * exported; otherwise output is the original one. */
  constructor(readonly b:Budget,readonly options:InterchangeOptions,readonly bookmarks=false,
    readonly preparedImage?:(binding:ImportedAsset)=>string|undefined){}
  #visited=0;
  #visit():void{if(++this.#visited>limits.outputNodes)fail("resource-limit");}
  inline(nodes:readonly Node[]):string{
    // Opt-in ruby extension: each group of one equal annotation is one `<ruby>` around its base.
    if(!nodes.some(n=>n.kind==="text"&&n.formats.some(f=>f.type===rubyFormat)))return this.#plain(nodes);
    return rubyUnits(nodes).map(unit=>unit.kind==="nodes"?this.#plain(unit.nodes):`<ruby>${this.#plain(unit.runs)}<rp>(</rp><rt>${t(unit.annotation)}</rt><rp>)</rp></ruby>`).join("");
  }
  #plain(nodes:readonly Node[]):string{return mentionUnits(nodes).map(unit=>{
    // V4: each whole mention is one inert entity span around its styled pieces.
    if(unit.kind==="mention")return `<span class="breditor-mention" data-mention-kind="${a(unit.mention.kind)}" data-mention-id="${a(unit.mention.id)}">${this.inline(unit.pieces)}</span>`;
    const n=unit.node;
    this.#visit();if(n.kind!=="text"){this.b.loss("block-structure");return t(nodeText(n));}
    let value=t(n.text);for(const f of [...n.formats].reverse())value=this.#format(value,f);return value;
  }).join("");}
  #format(value:string,f:Literal):string {
    const simple:Readonly<Record<string,string>>={"breditor/strong":"strong","breditor-inline/italic":"em","breditor-inline/underline":"u","breditor-inline/strike":"s","breditor-inline/code":"code","breditor-inline/subscript":"sub","breditor-inline/superscript":"sup"};
    const tag=simple[f.type];if(typeof tag==="string")return `<${tag}>${value}</${tag}>`;
    const p=f.properties;
    // V4 internal link `#name`: a fragment link to the exported anchor `bm-<name>`.
    const internal=this.bookmarks?internalLinkOf(f):undefined;
    if(internal!==undefined)return `<a href="#${bookmarkIdPrefix}${a(internal)}">${value}</a>`;
    if(f.type==="breditor-inline/link"){
      const source=p["breditor-inline/href"],href=typeof source==="string"?safeUrl(source):null;
      if(!href){this.b.loss("unsafe-link");return value;}
      if(href!==source)this.b.loss("style-approximation");
      return `<a href="${a(href)}"${p["breditor-inline/new-window"]===true?' target="_blank" rel="noopener noreferrer"':""}>${value}</a>`;
    }
    // V4 text language: only an admitted canonical tag becomes an inert `lang` attribute.
    // A ruby literal reaching here is outside the annotation policy: the base is kept, the annotation dropped.
    if(f.type===rubyFormat){this.b.loss("removed-content");return value;}
    if(f.type==="breditor/text-language"){const tag=p["breditor/language-tag"];if(isCanonicalLanguageTagV1(tag))return `<span lang="${a(tag)}">${value}</span>`;this.b.loss("unsupported-attribute");return value;}
    const rgb=p["breditor-inline/rgb24"],pixels=p["breditor-inline/pixels"],family=p["breditor-inline/family"];
    if(["breditor-inline/text-color","breditor-inline/background-color"].includes(f.type)&&typeof rgb==="number"&&Number.isInteger(rgb)&&rgb>=0&&rgb<=0xffffff)return `<span style="${f.type==="breditor-inline/text-color"?"color":"background-color"}:#${rgb.toString(16).padStart(6,"0")}">${value}</span>`;
    if(f.type==="breditor-inline/text-size"&&typeof pixels==="number"&&Number.isInteger(pixels)&&pixels>=8&&pixels<=96)return `<span style="font-size:${pixels}px">${value}</span>`;
    if(f.type==="breditor-inline/font-family"&&typeof family==="number"&&Number.isInteger(family)&&family>=1&&family<=4)return `<span style="font-family:${["","system-ui","sans-serif","serif","monospace"][family]}">${value}</span>`;
    this.b.loss("unsupported-style");return value;
  }
  /** V4 bookmark: `id="bm-<name>"` from an admitted name only. */
  #anchor(node:Element):string {
    const name=property(node,"bookmark");if(name===undefined||!this.bookmarks)return "";
    if(!isBookmarkName(name))fail("native-admission");return ` id="${bookmarkIdPrefix}${a(name)}"`;
  }
  #layout(node:Element):string {
    const style=["white-space:pre-wrap"],align=property(node,"block-align"),dir=property(node,"block-direction"),indent=property(node,"block-indent"),height=property(node,"line-height-percent");
    if(typeof align==="number"&&Number.isInteger(align)&&align>=1&&align<=6)style.push(`text-align:${["","start","center","end","justify","left","right"][align]}`);
    if(typeof dir==="number"&&Number.isInteger(dir)&&dir>=1&&dir<=3){if(dir!==3)style.push(`direction:${dir===1?"ltr":"rtl"}`);}
    if(typeof indent==="number"&&Number.isInteger(indent)&&indent>=0&&indent<=12)style.push(`margin-inline-start:${indent*2}em`);
    if(typeof height==="number"&&Number.isInteger(height)&&height>=100&&height<=300)style.push(`line-height:${height}%`);
    return ` style="${style.join(";")}"${dir===3?' dir="auto"':""}`;
  }
  blocks(nodes:readonly Node[],depth=0):string {
    if(depth>limits.depth)fail("resource-limit");return nodes.map(node=>{
      this.#visit();if(node.kind==="text"){this.b.loss("block-structure");return t(node.text);}
      const body=()=>this.blocks(node.children,depth+1);
      switch(node.type){
        case "breditor/paragraph":return `<p${this.#anchor(node)}${this.#layout(node)}>${this.inline(node.children)}</p>`;
        case "breditor/heading":{const rank=property(node,"level");if(typeof rank!=="number"||!Number.isInteger(rank)||rank<1||rank>6)fail("native-admission");return `<h${rank}${this.#anchor(node)}${this.#layout(node)}>${this.inline(node.children)}</h${rank}>`;}
        case "breditor/blockquote":return `<blockquote>${body()}</blockquote>`;
        // V4 section: native disclosure; `open` only from the admitted `true` flag.
        case "breditor/details":{const open=property(node,"details-open");if(open!==undefined&&open!==true||node.children[0]?.kind!=="element"||node.children[0].type!=="breditor/details-summary")fail("native-admission");return `<details${open===true?" open":""}>${body()}</details>`;}
        case "breditor/details-summary":return `<summary>${this.inline(node.children)}</summary>`;
        case "breditor/code-block":{const language=property(node,"language");return `<pre${this.#anchor(node)}${this.#layout(node)}><code${typeof language==="string"?` class="language-${a(language)}"`:""}>${t(nodeText(node))}</code></pre>`;}
        case "breditor/horizontal-rule":return"<hr>";
        // V4 page break: an empty block forcing a page after it (modern and legacy CSS spellings).
        case "breditor/page-break":return '<div style="break-after:page;page-break-after:always"></div>';
        case "breditor/bullet-list":return `<ul>${body()}</ul>`;
        case "breditor/ordered-list":{
          const start=property(node,"start"),style=property(node,"list-style"),reversed=property(node,"list-reversed");
          if(typeof start!=="number"||!Number.isSafeInteger(start)||start<1)fail("native-admission");
          // V4 numbering is emitted only from admitted closed values: an HTML `type` token and `reversed`.
          if(style!==undefined&&(typeof style!=="number"||!Number.isInteger(style)||style<1||style>5)||reversed!==undefined&&reversed!==true)fail("native-admission");
          return `<ol start="${start}"${typeof style==="number"?` type="${["1","a","A","i","I"][style-1]!}"`:""}${reversed===true?" reversed":""}>${body()}</ol>`;
        }
        case "breditor/task-list":return `<ul>${body()}</ul>`;
        case "breditor/list-item":return `<li>${body()}</li>`;
        case "breditor/task-item":{const first=node.children[0];if(first?.kind!=="element"||!['breditor/paragraph','breditor/heading'].includes(first.type))fail("native-admission");return `<li><input type="checkbox" disabled${property(node,"checked")===true?" checked":""}>${body()}</li>`;}
        case "breditor/image":return this.#image(node,depth);
        case "breditor/table":return this.#table(node,depth);
        default:this.b.loss("unsupported-element");return body();
      }
    }).join("");
  }
  imageUrl(node:Element):string|undefined {
    const prepared=this.preparedImage?.(imageBinding(node));if(prepared!==undefined)return prepared;
    let raw;try{raw=this.options.exportImage?.(imageBinding(node));}catch{fail("asset-policy");}
    if(typeof raw!=="string"){this.b.loss("image-reference");return undefined;}
    const safe=safeUrl(raw);if(!safe){this.b.loss("image-reference");return undefined;}return safe;
  }
  #image(node:Element,depth:number):string {
    const src=this.imageUrl(node),alt=stringProperty(node,"alt-text"),caption=node.children.length?this.blocks(node.children,depth+1):"";
    const link=imageLink(node);
    if(!src)return `<p style="white-space:pre-wrap">${link?`${link.open}${t(alt)}</a>`:t(alt)}</p>${caption}`;
    const width=property(node,"width"),height=property(node,"height"),size=typeof width==="number"&&typeof height==="number"&&Number.isInteger(width)&&Number.isInteger(height)&&width>=1&&height>=1&&width<=4096&&height<=4096?` width="${width}" height="${height}"`:"";
    const image=`<img src="${a(src)}" alt="${a(alt)}"${size}>`;
    return `<figure>${link?`${link.open}${image}</a>`:image}${caption?`<figcaption>${caption}</figcaption>`:""}</figure>`;
  }
  #table(node:Element,depth:number):string {
    const elements=node.children.filter((n):n is Element=>n.kind==="element"),last=elements.at(-1);
    // V4 caption: the table's trailing paragraph, exported as the leading <caption>.
    const captionNode=last?.type==="breditor/paragraph"?last:undefined,rows=captionNode?elements.slice(0,-1):elements;
    const columns=property(node,"columns") as {id:string;width:number}[],merges=property(node,"merges") as Record<string,unknown>[];
    if(!Array.isArray(columns)||!Array.isArray(merges))fail("native-admission");if(!rows.length){this.b.loss("table-geometry");return captionNode?this.blocks([captionNode],depth+1):"";}
    const caption=captionNode?`<caption style="caption-side:bottom">${this.blocks([captionNode],depth+1)}</caption>`:"";
    const occupied=new Map<string,{r:number;c:number;rs:number;cs:number}>(),rowIds=rows.map(r=>stringProperty(r,"row-id")),columnIds=columns.map(c=>c.id);
    for(const merge of merges){const r=rowIds.indexOf(String(merge["first-row"])),endR=rowIds.indexOf(String(merge["last-row"])),c=columnIds.indexOf(String(merge["first-column"])),endC=columnIds.indexOf(String(merge["last-column"]));if(r<0||c<0||endR<r||endC<c)fail("native-admission");const bounds={r,c,rs:endR-r+1,cs:endC-c+1};for(let y=r;y<=endR;y++)for(let x=c;x<=endC;x++)occupied.set(`${y}:${x}`,bounds);}
    const cells=rows.map(row=>columnIds.map(column=>row.children.find((n):n is Element=>n.kind==="element"&&property(n,"column-id")===column)??fail("native-admission")));
    const body=rows.map((_row,r)=>`<tr>${columnIds.map((_column,c)=>{
      const merge=occupied.get(`${r}:${c}`);if(merge&&(merge.r!==r||merge.c!==c))return"";
      const cell=cells[r]![c]!,tag=property(cell,"header")===true?"th":"td";
      let content;
      if(merge){const partitions:string[]=[];for(let y=r;y<r+merge.rs;y++)for(let x=c;x<c+merge.cs;x++){const source=cells[y]![x]!;partitions.push(`<div data-breditor-cell-partition="1" data-breditor-cell-row="${y-r}" data-breditor-cell-column="${x-c}" data-breditor-cell-header="${property(source,"header")===true?1:0}">${this.blocks(source.children,depth+1)}</div>`);}content=partitions.join("");}
      else content=this.blocks(cell.children,depth+1);
      return `<${tag}${merge?` rowspan="${merge.rs}" colspan="${merge.cs}"`:""}>${content}</${tag}>`;
    }).join("")}</tr>`).join("");
    return `<table>${caption}<colgroup>${columns.map(c=>{if(!Number.isInteger(c.width)||c.width<32||c.width>4096)fail("native-admission");return `<col width="${c.width}">`;}).join("")}</colgroup><tbody>${body}</tbody></table>`;
  }
}
/** V4 image link: the opening `<a>` from admitted canonical values only (link wraps the image, not the caption). */
export function imageLink(node:Element):{href:string;newWindow:boolean;open:string}|undefined {
  const href=property(node,"image-href"),newWindow=property(node,"image-link-new-window");
  if(href===undefined&&newWindow===undefined)return undefined;
  if(!isImageLinkHrefV1(href)||newWindow!==undefined&&newWindow!==true||property(node,"decorative")!==false)fail("native-admission");
  return {href,newWindow:newWindow===true,open:`<a href="${a(href)}"${newWindow===true?' target="_blank" rel="noopener noreferrer"':""}>`};
}
export function imageBinding(node:Element):ImportedAsset {
  return Object.freeze({asset:stringProperty(node,"asset-id"),generation:stringProperty(node,"asset-generation")});
}
export function exportHtmlRoot(nodes:Node[],b:Budget,options:InterchangeOptions,kind:"text"|"flow"|"grid",bookmarks=false,
  preparedImage?:(binding:ImportedAsset)=>string|undefined):string {
  const writer=new HtmlExport(b,options,bookmarks,preparedImage),wrapper=nodes[0];
  if(kind==="text"&&(nodes.length!==1||wrapper?.kind!=="element"||wrapper.type!=="breditor/paragraph"))fail("native-admission");
  if(kind==="text"&&wrapper?.kind==="element"&&Object.keys(wrapper.properties).some(k=>k!=="breditor/block-id"))b.loss("block-structure");
  const result=kind==="text"&&wrapper?.kind==="element"?`<span style="white-space:pre-wrap">${writer.inline(wrapper.children)}</span>`:writer.blocks(nodes);if(result.length>limits.outputBytes||bytes(result)>limits.outputBytes)fail("resource-limit");return result;
}
