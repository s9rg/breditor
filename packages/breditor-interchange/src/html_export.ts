import {Budget,bytes,fail,limits} from "./budget.js";
import {escapeAttribute as a,escapeText as t,safeUrl} from "./safe_url.js";
import {nodeText,property,stringProperty,type Element,type Literal,type Node} from "./wire.js";
import type {InterchangeOptions} from "./types.js";
import {isCanonicalLanguageTagV1} from "./language_tag.js";
/** Export only native-admitted DTOs. Every output tag, attribute and CSS property is library-owned. */
export class HtmlExport {
  constructor(readonly b:Budget,readonly options:InterchangeOptions){}
  #visited=0;
  #visit():void{if(++this.#visited>limits.outputNodes)fail("resource-limit");}
  inline(nodes:readonly Node[]):string{return nodes.map(n=>{
    this.#visit();if(n.kind!=="text"){this.b.loss("block-structure");return t(nodeText(n));}
    let value=t(n.text);for(const f of [...n.formats].reverse())value=this.#format(value,f);return value;
  }).join("");}
  #format(value:string,f:Literal):string {
    const simple:Readonly<Record<string,string>>={"breditor/strong":"strong","breditor-inline/italic":"em","breditor-inline/underline":"u","breditor-inline/strike":"s","breditor-inline/code":"code","breditor-inline/subscript":"sub","breditor-inline/superscript":"sup"};
    const tag=simple[f.type];if(typeof tag==="string")return `<${tag}>${value}</${tag}>`;
    const p=f.properties;
    if(f.type==="breditor-inline/link"){
      const source=p["breditor-inline/href"],href=typeof source==="string"?safeUrl(source):null;
      if(!href){this.b.loss("unsafe-link");return value;}
      if(href!==source)this.b.loss("style-approximation");
      return `<a href="${a(href)}"${p["breditor-inline/new-window"]===true?' target="_blank" rel="noopener noreferrer"':""}>${value}</a>`;
    }
    // Candidate V4 text language: only an admitted canonical tag becomes an inert `lang` attribute.
    if(f.type==="breditor/text-language"){const tag=p["breditor/language-tag"];if(isCanonicalLanguageTagV1(tag))return `<span lang="${a(tag)}">${value}</span>`;this.b.loss("unsupported-attribute");return value;}
    const rgb=p["breditor-inline/rgb24"],pixels=p["breditor-inline/pixels"],family=p["breditor-inline/family"];
    if(["breditor-inline/text-color","breditor-inline/background-color"].includes(f.type)&&typeof rgb==="number"&&Number.isInteger(rgb)&&rgb>=0&&rgb<=0xffffff)return `<span style="${f.type==="breditor-inline/text-color"?"color":"background-color"}:#${rgb.toString(16).padStart(6,"0")}">${value}</span>`;
    if(f.type==="breditor-inline/text-size"&&typeof pixels==="number"&&Number.isInteger(pixels)&&pixels>=8&&pixels<=96)return `<span style="font-size:${pixels}px">${value}</span>`;
    if(f.type==="breditor-inline/font-family"&&typeof family==="number"&&Number.isInteger(family)&&family>=1&&family<=4)return `<span style="font-family:${["","system-ui","sans-serif","serif","monospace"][family]}">${value}</span>`;
    this.b.loss("unsupported-style");return value;
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
        case "breditor/paragraph":return `<p${this.#layout(node)}>${this.inline(node.children)}</p>`;
        case "breditor/heading":{const rank=property(node,"level");if(typeof rank!=="number"||!Number.isInteger(rank)||rank<1||rank>6)fail("native-admission");return `<h${rank}${this.#layout(node)}>${this.inline(node.children)}</h${rank}>`;}
        case "breditor/blockquote":return `<blockquote>${body()}</blockquote>`;
        case "breditor/code-block":{const language=property(node,"language");return `<pre${this.#layout(node)}><code${typeof language==="string"?` class="language-${a(language)}"`:""}>${t(nodeText(node))}</code></pre>`;}
        case "breditor/horizontal-rule":return"<hr>";
        case "breditor/bullet-list":return `<ul>${body()}</ul>`;
        case "breditor/ordered-list":{
          const start=property(node,"start"),style=property(node,"list-style"),reversed=property(node,"list-reversed");
          if(typeof start!=="number"||!Number.isSafeInteger(start)||start<1)fail("native-admission");
          // Candidate V4 numbering is emitted only from admitted closed values: an HTML `type` token and `reversed`.
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
    let raw;try{raw=this.options.exportImage?.(Object.freeze({asset:stringProperty(node,"asset-id"),generation:stringProperty(node,"asset-generation")}));}catch{fail("asset-policy");}
    if(typeof raw!=="string"){this.b.loss("image-reference");return undefined;}
    const safe=safeUrl(raw);if(!safe){this.b.loss("image-reference");return undefined;}return safe;
  }
  #image(node:Element,depth:number):string {
    const src=this.imageUrl(node),alt=stringProperty(node,"alt-text"),caption=node.children.length?this.blocks(node.children,depth+1):"";
    if(!src)return `<p style="white-space:pre-wrap">${t(alt)}</p>${caption}`;
    const width=property(node,"width"),height=property(node,"height"),size=typeof width==="number"&&typeof height==="number"&&Number.isInteger(width)&&Number.isInteger(height)&&width>=1&&height>=1&&width<=4096&&height<=4096?` width="${width}" height="${height}"`:"";
    return `<figure><img src="${a(src)}" alt="${a(alt)}"${size}>${caption?`<figcaption>${caption}</figcaption>`:""}</figure>`;
  }
  #table(node:Element,depth:number):string {
    const rows=node.children.filter((n):n is Element=>n.kind==="element"),columns=property(node,"columns") as {id:string;width:number}[],merges=property(node,"merges") as Record<string,unknown>[];
    if(!Array.isArray(columns)||!Array.isArray(merges))fail("native-admission");if(!rows.length){this.b.loss("table-geometry");return"";}
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
    return `<table><colgroup>${columns.map(c=>{if(!Number.isInteger(c.width)||c.width<32||c.width>4096)fail("native-admission");return `<col width="${c.width}">`;}).join("")}</colgroup><tbody>${body}</tbody></table>`;
  }
}
export function exportHtmlRoot(nodes:Node[],b:Budget,options:InterchangeOptions,kind:"text"|"flow"|"grid"):string {
  const writer=new HtmlExport(b,options),wrapper=nodes[0];
  if(kind==="text"&&(nodes.length!==1||wrapper?.kind!=="element"||wrapper.type!=="breditor/paragraph"))fail("native-admission");
  if(kind==="text"&&wrapper?.kind==="element"&&Object.keys(wrapper.properties).some(k=>k!=="breditor/block-id"))b.loss("block-structure");
  const result=kind==="text"&&wrapper?.kind==="element"?`<span style="white-space:pre-wrap">${writer.inline(wrapper.children)}</span>`:writer.blocks(nodes);if(result.length>limits.outputBytes||bytes(result)>limits.outputBytes)fail("resource-limit");return result;
}
