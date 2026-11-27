/**
 * Native rich document → WordprocessingML. Pure, synchronous and deterministic: identifiers
 * (relationships, numbering, drawing ids, media names) are assigned in document order and no
 * clock, randomness or environment value is read. Every source feature without a faithful DOCX
 * representation reports an aggregated loss code; nothing is silently dropped.
 */
import {fail,limits} from "../budget.js";
import {safeUrl} from "../safe_url.js";
import {isCanonicalLanguageTagV1} from "../language_tag.js";
import {isImageLinkHrefV1} from "../image_link_href.js";
import {mentionUnits,mentionFormat} from "../mention.js";
import {rubyAnnotationOf,rubyFormat} from "../ruby.js";
import {bookmarkProperty,internalLinkOf,isBookmarkName} from "../bookmark.js";
import {sniffImage,type SniffedImage} from "./image.js";
import {relType,type AbstractKind,type NumInstance} from "./parts.js";

/** Reused interchange codes plus two DOCX-specific ones (`image-format`, `mention-entity`). */
export type DocxLossCode="unsupported-element"|"unsupported-attribute"|"unsupported-style"|"style-approximation"|"unsafe-link"|"image-reference"|"image-format"|"block-structure"|"table-geometry"|"list-numbering"|"mention-entity"|"removed-content";
export interface DocxLoss {readonly code:DocxLossCode;readonly count:number;readonly effect:"loss"}
export interface DocxImageBinding {readonly asset:string;readonly generation:string}
export const docxLimits=Object.freeze({
  /** UTF-16 code units of the native document JSON (whole documents, so 8× the clipboard source bound). */
  documentChars:8*1024*1024,
  /** Visited native nodes (4× the interchange output-node bound). */
  nodes:4*limits.outputNodes,
  depth:limits.depth,rows:limits.rows,columns:limits.columns,cells:limits.cells,
  /** Distinct embedded images and bytes, matching the default rich asset-store file bound. */
  images:256,imageBytes:10*1024*1024,totalImageBytes:64*1024*1024,
  /** Generated XML (UTF-16 code units) across all parts. */
  xmlChars:32*1024*1024,
});

export interface JsonText {kind:"text";text:string;formats:{type:string;properties:Record<string,unknown>}[]}
export interface JsonElement {kind:"element";type:string;properties:Record<string,unknown>;children:JsonNode[]}
export type JsonNode=JsonText|JsonElement;
type Literal=JsonText["formats"][number];

export class LossLedger {
  #map=new Map<DocxLossCode,number>();
  add(code:DocxLossCode,count=1):void{this.#map.set(code,(this.#map.get(code)??0)+count);}
  list():readonly DocxLoss[]{return Object.freeze([...this.#map].sort(([a],[b])=>a<b?-1:1).map(([code,count])=>Object.freeze({code,count,effect:"loss" as const})));}
}

const isRecord=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const loneSurrogate=/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** Structural validation of one node record (children are validated as they are visited). */
function checkNode(value:unknown):JsonNode {
  if(!isRecord(value))fail("invalid-source");
  if(value["kind"]==="text"){
    if(typeof value["text"]!=="string"||!Array.isArray(value["formats"])||loneSurrogate.test(value["text"]))fail("invalid-source");
    for(const f of value["formats"] as unknown[])if(!isRecord(f)||typeof f["type"]!=="string"||!isRecord(f["properties"]))fail("invalid-source");
    return value as unknown as JsonText;
  }
  if(value["kind"]==="element"){
    if(typeof value["type"]!=="string"||!isRecord(value["properties"])||!Array.isArray(value["children"]))fail("invalid-source");
    return value as unknown as JsonElement;
  }
  return fail("invalid-source");
}
/** Accept a `breditor/document` root, a view/record `{root}` or a clipboard `{document:{root}}`. */
export function documentRoot(source:unknown):JsonElement {
  if(typeof source!=="string")fail("invalid-source");
  if(source.length>docxLimits.documentChars)fail("resource-limit");
  let parsed:unknown;try{parsed=JSON.parse(source);}catch{fail("invalid-source");}
  const candidate=isRecord(parsed)&&parsed["kind"]==="element"?parsed:isRecord(parsed)&&isRecord(parsed["root"])?parsed["root"]:isRecord(parsed)&&isRecord(parsed["document"])&&isRecord(parsed["document"]["root"])?parsed["document"]["root"]:undefined;
  const root=checkNode(candidate);if(root.kind!=="element"||root.type!=="breditor/document")fail("invalid-source");
  return root;
}
const prop=(node:JsonElement,name:string):unknown=>node.properties[`breditor/${name}`];
const intIn=(v:unknown,min:number,max:number):v is number=>typeof v==="number"&&Number.isInteger(v)&&v>=min&&v<=max;
export function textOf(node:JsonNode):string{return node.kind==="text"?node.text:node.children.map(textOf).join("");}

/** Every image binding in document order, deduplicated (for hosts that load bytes asynchronously). */
export function collectImageBindings(root:JsonElement):DocxImageBinding[] {
  const seen=new Set<string>(),out:DocxImageBinding[]=[];let visited=0;
  const walk=(node:JsonElement,depth:number):void=>{
    if(depth>docxLimits.depth)fail("resource-limit");
    for(const raw of node.children){
      if(++visited>docxLimits.nodes)fail("resource-limit");
      const child=checkNode(raw);if(child.kind!=="element")continue;
      if(child.type==="breditor/image"){
        const asset=prop(child,"asset-id"),generation=prop(child,"asset-generation");
        if(typeof asset!=="string"||typeof generation!=="string")fail("invalid-source");
        const key=`${asset}\u0000${generation}`;if(!seen.has(key)){seen.add(key);out.push(Object.freeze({asset,generation}));}
      }
      walk(child,depth+1);
    }
  };
  walk(root,0);if(out.length>docxLimits.images)fail("resource-limit");return out;
}

// --- XML text -------------------------------------------------------------------------------
const invalidXml=/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
export const escAttr=(s:string)=>esc(s).replace(/"/g,"&quot;").replace(/'/g,"&apos;").replace(/\t/g,"&#9;").replace(/\n/g,"&#10;").replace(/\r/g,"&#13;");

interface Media {readonly relId:string;readonly name:string;readonly image:SniffedImage}
interface Ctx {readonly quote:number;readonly listLevel:number;readonly item:{num:{numId:number;level:number}|null}|null}
const rootCtx:Ctx={quote:0,listLevel:-1,item:null};
const twipsPerPixel=15,emuPerPixel=9525;
const alignValue=["","left","center","right","both","left","right"] as const;

export interface ConvertOptions {
  readonly image:((binding:DocxImageBinding)=>Uint8Array|undefined)|undefined;
  readonly contentWidthTwips:number;
}
export class DocxWriter {
  readonly losses=new LossLedger();
  readonly rels:{id:string;type:string;target:string;external:boolean}[]=[
    {id:"rId1",type:relType.styles,target:"styles.xml",external:false},
    {id:"rId2",type:relType.numbering,target:"numbering.xml",external:false},
    {id:"rId3",type:relType.settings,target:"settings.xml",external:false},
  ];
  readonly media:{name:string;data:Uint8Array;image:SniffedImage}[]=[];
  readonly abstracts:{id:number;kind:AbstractKind}[]=[];
  readonly nums:NumInstance[]=[];
  #links=new Map<string,string>();#images=new Map<string,Media|null>();#imageBytes=0;
  #visited=0;#drawings=0;#chars=0;
  /** V4 bookmark names present in the document, and the next `w:bookmarkStart` id. */
  #bookmarks=new Set<string>();#bookmarkId=0;
  constructor(readonly options:ConvertOptions){}

  #visit():void{if(++this.#visited>docxLimits.nodes)fail("resource-limit");}
  #emit(xml:string):string{this.#chars+=xml.length;if(this.#chars>docxLimits.xmlChars)fail("resource-limit");return xml;}
  #rel(type:string,target:string,external:boolean):string{const id=`rId${this.rels.length+1}`;this.rels.push({id,type,target,external});return id;}
  #linkRel(href:string):string{let id=this.#links.get(href);if(!id){id=this.#rel(relType.hyperlink,escAttr(href),true);this.#links.set(href,id);}return id;}
  #num(kind:AbstractKind,level:number,start:number|null):number {
    let abstract=this.abstracts.find(a=>a.kind===kind);
    if(!abstract){abstract={id:this.abstracts.length,kind};this.abstracts.push(abstract);}
    const numId=this.nums.length+1;this.nums.push({numId,abstractId:abstract.id,level,start});return numId;
  }

  /** Strip XML-invalid controls (reported) and map hard breaks/tabs to run content. */
  #runContent(text:string):string {
    let removed=0;const clean=text.replace(/\r\n?/g,"\n").replace(invalidXml,()=>{removed++;return "";});
    if(removed)this.losses.add("removed-content",removed);
    let out="";
    for(const piece of clean.split(/(\n|\t)/)){
      if(piece==="\n")out+="<w:br/>";else if(piece==="\t")out+="<w:tab/>";else if(piece)out+=`<w:t xml:space="preserve">${esc(piece)}</w:t>`;
    }
    return out;
  }
  #attr(text:string):string{let removed=0;const clean=text.replace(invalidXml,()=>{removed++;return "";});if(removed)this.losses.add("removed-content",removed);return escAttr(clean);}

  /** Run properties in CT_RPr schema order. */
  #rPr(formats:readonly Literal[],linked:boolean):string {
    let bold=false,italic=false,underline=false,strike=false,code=false,vert:""|"subscript"|"superscript"="",color="",fill="",size=0,family="",lang="";
    for(const f of formats){
      const p=f.properties;
      switch(f.type){
        case "breditor/strong":bold=true;break;
        case "breditor-inline/italic":italic=true;break;
        case "breditor-inline/underline":underline=true;break;
        case "breditor-inline/strike":strike=true;break;
        case "breditor-inline/code":code=true;break;
        // Exclusive scripts: a stored run with both exports superscript (the HTML rule) and reports it.
        case "breditor-inline/subscript":if(vert==="superscript")this.losses.add("style-approximation");else vert="subscript";break;
        case "breditor-inline/superscript":if(vert==="subscript")this.losses.add("style-approximation");vert="superscript";break;
        case "breditor-inline/link":break;
        case "breditor-inline/text-color":case "breditor-inline/background-color":{
          const rgb=p["breditor-inline/rgb24"];if(!intIn(rgb,0,0xffffff)){this.losses.add("unsupported-style");break;}
          const hex=rgb.toString(16).padStart(6,"0").toUpperCase();if(f.type==="breditor-inline/text-color")color=hex;else fill=hex;break;
        }
        case "breditor-inline/text-size":{const px=p["breditor-inline/pixels"];if(!intIn(px,8,96)){this.losses.add("unsupported-style");break;}size=Math.round(px*1.5);break;}
        case "breditor-inline/font-family":{const v=p["breditor-inline/family"];if(!intIn(v,1,4)){this.losses.add("unsupported-style");break;}family=["","Segoe UI","Arial","Times New Roman","Courier New"][v]!;break;}
        case "breditor/text-language":{const tag=p["breditor/language-tag"];if(!isCanonicalLanguageTagV1(tag)){this.losses.add("unsupported-attribute");break;}lang=tag;break;}
        case mentionFormat:this.losses.add("mention-entity");break;
        default:this.losses.add("unsupported-style");
      }
    }
    if(code)family="Courier New";
    let x="";
    if(linked)x+='<w:rStyle w:val="Hyperlink"/>';
    if(family)x+=`<w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:cs="${family}"/>`;
    if(bold)x+="<w:b/><w:bCs/>";if(italic)x+="<w:i/><w:iCs/>";if(strike)x+="<w:strike/>";
    if(color)x+=`<w:color w:val="${color}"/>`;if(size)x+=`<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`;
    if(underline)x+='<w:u w:val="single"/>';if(fill)x+=`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
    if(vert)x+=`<w:vertAlign w:val="${vert}"/>`;if(lang)x+=`<w:lang w:val="${lang}"/>`;
    return x?`<w:rPr>${x}</w:rPr>`:"";
  }

  /** Inline content: runs grouped into one `w:hyperlink` per contiguous identical link literal. */
  inline(nodes:readonly JsonNode[]):string {
    for(const n of nodes)checkNode(n);
    const pieces:{text:string;formats:Literal[];pageBreak?:true}[]=[];
    for(const unit of mentionUnits(nodes as never)){
      if(unit.kind==="mention"){this.losses.add("mention-entity");for(const run of unit.pieces){this.#visit();pieces.push({text:run.text,formats:run.formats as Literal[]});}continue;}
      const n=unit.node as JsonNode;this.#visit();
      if(n.kind==="text"){pieces.push({text:n.text,formats:n.formats});continue;}
      if(n.type==="breditor/page-break"){pieces.push({text:"",formats:[],pageBreak:true});continue;}
      this.losses.add("block-structure");pieces.push({text:textOf(n),formats:[]});
    }
    // A CRLF can straddle styled runs. Keep the break in the run that owns the CR.
    let previousEndedWithCr=false;
    for(const piece of pieces){
      if(piece.pageBreak)previousEndedWithCr=false;
      if(!piece.text)continue;
      const endsWithCr=piece.text.endsWith("\r");
      if(previousEndedWithCr&&piece.text.startsWith("\n"))piece.text=piece.text.slice(1);
      previousEndedWithCr=endsWithCr;
    }
    // Opt-in ruby extension: the annotation leaves the run formats and becomes a `w:ruby` around the base runs.
    const ruby=pieces.map(piece=>{
      const literal=piece.formats.find(f=>f.type===rubyFormat);if(!literal)return undefined;
      piece.formats=piece.formats.filter(f=>f.type!==rubyFormat);const value=rubyAnnotationOf(literal);if(value===undefined)this.losses.add("removed-content");return value;
    });
    let out="",group:{key:string;href:string|null;anchor?:string;newWindow:boolean;runs:string}|null=null;
    const flush=()=>{if(!group)return;out+=group.anchor!==undefined?`<w:hyperlink w:anchor="${escAttr(group.anchor)}" w:history="1">${group.runs}</w:hyperlink>`:group.href!==null?`<w:hyperlink r:id="${this.#linkRel(group.href)}"${group.newWindow?' w:tgtFrame="_blank"':""} w:history="1">${group.runs}</w:hyperlink>`:group.runs;group=null;};
    for(let index=0;index<pieces.length;index++){
      const piece=pieces[index]!;
      if(piece.pageBreak){flush();out+='<w:r><w:br w:type="page"/></w:r>';continue;}
      if(!piece.text)continue;
      const annotation=ruby[index],linkKey=(p:typeof piece)=>{const l=p.formats.find(f=>f.type==="breditor-inline/link");return l?JSON.stringify(l):"";};
      // One `w:ruby` per contiguous base of one annotation inside one link group.
      let last=index;if(annotation!==undefined)while(last+1<pieces.length&&ruby[last+1]===annotation&&!pieces[last+1]!.pageBreak&&linkKey(pieces[last+1]!)===linkKey(piece))last++;
      const runs=(linked:boolean)=>{
        const base=pieces.slice(index,last+1).filter(p=>p.text).map(p=>`<w:r>${this.#rPr(p.formats,linked)}${this.#runContent(p.text)}</w:r>`).join("");
        if(annotation===undefined)return base;
        const tag=piece.formats.find(f=>f.type==="breditor/text-language")?.properties["breditor/language-tag"],lid=isCanonicalLanguageTagV1(tag)?tag:"ja-JP";
        return `<w:r><w:ruby><w:rubyPr><w:rubyAlign w:val="distributeSpace"/><w:hps w:val="10"/><w:hpsRaise w:val="20"/><w:hpsBaseText w:val="21"/><w:lid w:val="${escAttr(lid)}"/></w:rubyPr><w:rt><w:r><w:rPr><w:sz w:val="10"/><w:szCs w:val="10"/></w:rPr>${this.#runContent(annotation)}</w:r></w:rt><w:rubyBase>${base}</w:rubyBase></w:ruby></w:r>`;
      };
      const consumed=last;
      const link=piece.formats.find(f=>f.type==="breditor-inline/link"),key=link?JSON.stringify(link):"";
      let href:string|null=null,newWindow=false;
      // V4 internal link `#name`: a document-internal `w:hyperlink w:anchor` to the bookmark.
      // A dangling target (no block carries the name) keeps its text without a link (`unsafe-link`).
      const internal=link?internalLinkOf(link):undefined;
      if(internal!==undefined){
        const anchor=this.#bookmarks.has(internal)?internal:undefined;if(anchor===undefined)this.losses.add("unsafe-link");
        if(!group||group.key!==key){flush();group={key,href:null,...(anchor!==undefined?{anchor}:{}),newWindow:false,runs:""};}
        group.runs+=runs(anchor!==undefined);index=consumed;continue;
      }
      if(link){
        const source=link.properties["breditor-inline/href"];href=typeof source==="string"?safeUrl(source):null;
        if(href===null)this.losses.add("unsafe-link");newWindow=link.properties["breditor-inline/new-window"]===true;
      }
      if(!group||group.key!==key){flush();group={key,href,newWindow,runs:""};}
      group.runs+=runs(href!==null);index=consumed;
    }
    flush();return out;
  }

  /** Paragraph properties in CT_PPr order: pStyle, numPr, bidi, spacing, ind, jc. */
  #paragraph(node:JsonElement|undefined,style:string|undefined,content:string,ctx:Ctx):string {
    const num=ctx.item?.num??null;if(ctx.item)ctx.item.num=null;
    let indent=0,bidi=false,spacing="",jc="";
    if(node){
      const align=prop(node,"block-align"),dir=prop(node,"block-direction"),level=prop(node,"block-indent"),height=prop(node,"line-height-percent");
      if(dir!==undefined){if(!intIn(dir,1,3))this.losses.add("unsupported-attribute");else if(dir===2)bidi=true;else if(dir===3)this.losses.add("style-approximation");}
      if(align!==undefined){if(!intIn(align,1,6))this.losses.add("unsupported-attribute");else{jc=alignValue[align]!;if(bidi&&(align===5||align===6))this.losses.add("style-approximation");}}
      if(level!==undefined){if(!intIn(level,0,12))this.losses.add("unsupported-attribute");else indent=level;}
      if(height!==undefined){if(!intIn(height,100,300))this.losses.add("unsupported-attribute");else spacing=`<w:spacing w:line="${Math.round(240*height/100)}" w:lineRule="auto"/>`;}
    }
    const effectiveStyle=style??(ctx.quote>0?"Quote":undefined);
    const listLeft=ctx.listLevel>=0?720*(ctx.listLevel+1):0,left=listLeft+720*ctx.quote+720*indent;
    const explicitInd=ctx.quote>0||indent>0||(ctx.listLevel>=0&&!num);
    let p="";
    if(effectiveStyle)p+=`<w:pStyle w:val="${effectiveStyle}"/>`;
    if(num)p+=`<w:numPr><w:ilvl w:val="${num.level}"/><w:numId w:val="${num.numId}"/></w:numPr>`;
    if(bidi)p+="<w:bidi/>";
    p+=spacing;
    if(explicitInd&&left>0)p+=`<w:ind w:left="${left}"${num?' w:hanging="360"':""}/>`;
    if(jc)p+=`<w:jc w:val="${jc}"/>`;
    // V4 bookmark: `w:bookmarkStart`/`w:bookmarkEnd` around the whole paragraph content. Word's
    // own UI limits names to 40 letters, digits and underscores; other admitted names are kept verbatim.
    const name=node?prop(node,"bookmark"):undefined;
    if(name!==undefined){
      if(!isBookmarkName(name))this.losses.add("unsupported-attribute");
      else{if(name.length>40||name.includes("-"))this.losses.add("style-approximation");const id=this.#bookmarkId++;content=`<w:bookmarkStart w:id="${id}" w:name="${escAttr(name)}"/>${content}<w:bookmarkEnd w:id="${id}"/>`;}
    }
    return this.#emit(`<w:p>${p?`<w:pPr>${p}</w:pPr>`:""}${content}</w:p>`);
  }
  /** A list item whose first block is not paragraph-like still shows its marker. */
  #flushMarker(ctx:Ctx):string{return ctx.item?.num?this.#paragraph(undefined,undefined,"",ctx):"";}

  blocks(nodes:readonly JsonNode[],ctx:Ctx,depth:number):string {
    if(depth>docxLimits.depth)fail("resource-limit");
    let out="";
    for(const raw of nodes){
      const node=checkNode(raw);this.#visit();
      if(node.kind==="text"){this.losses.add("block-structure");out+=this.#paragraph(undefined,undefined,this.inline([node]),ctx);continue;}
      out+=this.#block(node,ctx,depth);
    }
    return out;
  }
  #block(node:JsonElement,ctx:Ctx,depth:number):string {
    const body=(c:Ctx=ctx)=>this.blocks(node.children,c,depth+1);
    switch(node.type){
      case "breditor/paragraph":return this.#paragraph(node,undefined,this.inline(node.children),ctx);
      case "breditor/heading":{
        const level=prop(node,"level");if(!intIn(level,1,6)){this.losses.add("unsupported-attribute");return this.#paragraph(node,undefined,this.inline(node.children),ctx);}
        return this.#paragraph(node,`Heading${level}`,this.inline(node.children),ctx);
      }
      case "breditor/blockquote":return body({...ctx,quote:ctx.quote+1});
      case "breditor/details":{
        // Collapsible sections flatten: summary as a bold paragraph, body as ordinary flow.
        this.losses.add("block-structure");return body();
      }
      case "breditor/details-summary":return this.#paragraph(node,"BreditorSectionSummary",this.inline(node.children),ctx);
      case "breditor/code-block":{
        if(prop(node,"language")!==undefined)this.losses.add("unsupported-attribute");
        for(const child of node.children){const c=checkNode(child);this.#visit();if(c.kind!=="text"||c.formats.length)this.losses.add("unsupported-style");}
        return this.#paragraph(node,"BreditorCodeBlock",`<w:r>${this.#runContent(textOf(node))}</w:r>`,ctx);
      }
      case "breditor/horizontal-rule":return this.#paragraph(undefined,"BreditorHorizontalRule","",ctx);
      case "breditor/page-break":return this.#flushMarker(ctx)+this.#emit('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      case "breditor/bullet-list":case "breditor/ordered-list":case "breditor/task-list":return this.#flushMarker(ctx)+this.#list(node,ctx,depth);
      case "breditor/image":return this.#image(node,ctx,depth);
      case "breditor/table":return this.#flushMarker(ctx)+this.#table(node,ctx,depth);
      default:{
        this.losses.add("unsupported-element");
        if(node.children.length&&node.children.every(c=>isRecord(c)&&c["kind"]==="text"))return this.#paragraph(node,undefined,this.inline(node.children),ctx);
        return body();
      }
    }
  }
  #list(node:JsonElement,ctx:Ctx,depth:number):string {
    let level=ctx.listLevel+1;if(level>8){level=8;this.losses.add("list-numbering");}
    let numId:number|null=null,open:number|null=null,done:number|null=null;
    let reverseStart:number|undefined;
    if(node.type==="breditor/ordered-list"){
      let start=prop(node,"start"),style=prop(node,"list-style");const reversed=prop(node,"list-reversed");
      if(start===undefined)start=1;
      if(typeof start!=="number"||!Number.isSafeInteger(start)||start<0){this.losses.add("unsupported-attribute");start=1;}
      if((start as number)>2147483647){this.losses.add("list-numbering");start=2147483647;}
      if(style!==undefined&&!intIn(style,1,5)){this.losses.add("unsupported-attribute");style=undefined;}
      const kind=(["decimal","lowerLetter","upperLetter","lowerRoman","upperRoman"] as const)[((style as number|undefined)??1)-1]!;
      if(reversed===true){
        this.losses.add("list-numbering");
        // Word increments list instances. A separate restart per item keeps the visible ordinals.
        if(kind==="decimal"&&(start as number)>=node.children.length-1)reverseStart=start as number;
      }else if(reversed!==undefined)this.losses.add("unsupported-attribute");
      if(reverseStart===undefined)numId=this.#num(kind,level,start as number);
    }else if(node.type==="breditor/bullet-list")numId=this.#num("bullet",level,null);
    let out="";
    for(const [index,raw] of node.children.entries()){
      const item=checkNode(raw);this.#visit();
      if(item.kind!=="element"||!["breditor/list-item","breditor/task-item"].includes(item.type)){
        this.losses.add("unsupported-element");out+=this.blocks([item],{...ctx,listLevel:level,item:null},depth+1);continue;
      }
      let id=reverseStart===undefined?numId:this.#num("decimal",level,reverseStart-index);
      if(item.type==="breditor/task-item"||node.type==="breditor/task-list"){
        const checked=prop(item,"checked")===true;
        // The checkbox becomes a static ☐/☒ list marker (not an interactive content control).
        this.losses.add("style-approximation");
        if(checked)id=done??=this.#num("taskDone",level,null);else id=open??=this.#num("taskOpen",level,null);
      }
      const itemCtx:Ctx={quote:ctx.quote,listLevel:level,item:{num:{numId:id!,level}}};
      out+=this.blocks(item.children,itemCtx,depth+2)+this.#flushMarker(itemCtx);
    }
    return out;
  }
  #image(node:JsonElement,ctx:Ctx,depth:number):string {
    const asset=prop(node,"asset-id"),generation=prop(node,"asset-generation"),alt=prop(node,"alt-text")??"",decorative=prop(node,"decorative")===true;
    if(typeof asset!=="string"||typeof generation!=="string"||typeof alt!=="string")fail("invalid-source");
    const href=prop(node,"image-href"),newWindow=prop(node,"image-link-new-window")===true;
    let link:string|null=null;
    if(href!==undefined){if(isImageLinkHrefV1(href))link=href;else this.losses.add("unsafe-link");}
    const media=this.#media({asset,generation});
    let content:string;
    if(media){
      let width=prop(node,"width"),height=prop(node,"height");
      if(!(intIn(width,1,4096)&&intIn(height,1,4096))){width=media.image.width;height=media.image.height;}
      const max=Math.floor(this.options.contentWidthTwips/twipsPerPixel);let w=width as number,h=height as number;
      if(w>max){h=Math.max(1,Math.round(h*max/w));w=max;}
      const cx=w*emuPerPixel,cy=h*emuPerPixel,id=++this.#drawings,descr=decorative?"":this.#attr(alt);
      const ext=decorative?'<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>':"";
      const drawing=`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Picture ${id}" descr="${descr}">${ext}</wp:docPr><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${media.name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${media.relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
      content=link?`<w:hyperlink r:id="${this.#linkRel(link)}"${newWindow?' w:tgtFrame="_blank"':""} w:history="1">${drawing}</w:hyperlink>`:drawing;
    }else{
      // Missing or unsupported bytes: keep the alternative text (as the link text when linked).
      const runs=alt?`<w:r>${link?'<w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>':""}${this.#runContent(alt)}</w:r>`:"";
      content=link&&runs?`<w:hyperlink r:id="${this.#linkRel(link)}"${newWindow?' w:tgtFrame="_blank"':""} w:history="1">${runs}</w:hyperlink>`:runs;
    }
    let out=media||content||ctx.item?.num?this.#paragraph(undefined,undefined,content,ctx):"";
    for(const raw of node.children){
      const child=checkNode(raw);this.#visit();
      out+=child.kind==="element"&&child.type==="breditor/paragraph"?this.#paragraph(child,"Caption",this.inline(child.children),ctx):this.blocks([child],ctx,depth+1);
    }
    return out;
  }
  #media(binding:DocxImageBinding):Media|null {
    const key=`${binding.asset}\u0000${binding.generation}`,known=this.#images.get(key);if(known!==undefined){if(!known)this.losses.add("image-reference");return known;}
    let bytes:unknown;try{bytes=this.options.image?.(Object.freeze({...binding}));}catch{fail("asset-policy");}
    if(bytes===undefined){this.#images.set(key,null);this.losses.add("image-reference");return null;}
    if(!(bytes instanceof Uint8Array))fail("asset-policy");
    if(bytes.length>docxLimits.imageBytes||(this.#imageBytes+=bytes.length)>docxLimits.totalImageBytes||this.media.length>=docxLimits.images)fail("resource-limit");
    const image=sniffImage(bytes);
    if(!image){this.#images.set(key,null);this.losses.add("image-format");return null;}
    const name=`image${this.media.length+1}.${image.extension}`;
    this.media.push({name,data:new Uint8Array(bytes),image});
    const media={relId:this.#rel(relType.image,`media/${name}`,false),name,image};this.#images.set(key,media);return media;
  }
  #table(node:JsonElement,ctx:Ctx,depth:number):string {
    const elements=node.children.map(checkNode);elements.forEach(()=>this.#visit());
    if(elements.some(e=>e.kind!=="element"))fail("invalid-source");
    const els=elements as JsonElement[],last=els.at(-1),caption=last?.type==="breditor/paragraph"?last:undefined,rows=caption?els.slice(0,-1):els;
    const columnsRaw=prop(node,"columns"),mergesRaw=prop(node,"merges")??[];
    if(!Array.isArray(columnsRaw)||!Array.isArray(mergesRaw))fail("invalid-source");
    const columns=columnsRaw.map((c:unknown)=>{
      if(!isRecord(c)||typeof c["id"]!=="string")fail("invalid-source");
      let width=c["width"];if(!intIn(width,32,4096)){this.losses.add("table-geometry");width=typeof width==="number"&&Number.isFinite(width)?Math.min(4096,Math.max(32,Math.round(width))):120;}
      return{id:c["id"],width:width as number};
    });
    if(rows.length>docxLimits.rows||columns.length>docxLimits.columns||rows.length*columns.length>docxLimits.cells)fail("resource-limit");
    const captionXml=caption?this.#paragraph(caption,"Caption",this.inline(caption.children),{...rootCtx,quote:ctx.quote,listLevel:ctx.listLevel}):"";
    if(!rows.length||!columns.length){this.losses.add("table-geometry");return captionXml;}
    if(rows.some(r=>r.type!=="breditor/table-row"))fail("invalid-source");
    const rowIds=rows.map(r=>{const id=prop(r,"row-id");if(typeof id!=="string")fail("invalid-source");return id;}),columnIds=columns.map(c=>c.id);
    const cells=rows.map(row=>columnIds.map(column=>{
      const cell=row.children.map(checkNode).find((n):n is JsonElement=>n.kind==="element"&&n.type==="breditor/table-cell"&&prop(n,"column-id")===column);
      return cell??fail("invalid-source");
    }));
    for(const row of rows)if(row.children.length!==columnIds.length)fail("invalid-source");
    const occupied=new Map<string,{r:number;c:number;rs:number;cs:number}>();
    for(const m of mergesRaw as unknown[]){
      if(!isRecord(m))fail("invalid-source");
      const r=rowIds.indexOf(String(m["first-row"])),er=rowIds.indexOf(String(m["last-row"])),c=columnIds.indexOf(String(m["first-column"])),ec=columnIds.indexOf(String(m["last-column"]));
      if(r<0||c<0||er<r||ec<c)fail("invalid-source");
      const bounds={r,c,rs:er-r+1,cs:ec-c+1};
      for(let y=r;y<=er;y++)for(let x=c;x<=ec;x++){if(occupied.has(`${y}:${x}`))fail("invalid-source");occupied.set(`${y}:${x}`,bounds);}
    }
    const header=(cell:JsonElement)=>prop(cell,"header")===true;
    let headerRows=0;while(headerRows<rows.length&&cells[headerRows]!.every(header))headerRows++;
    const cellCtx:Ctx=rootCtx,empty=(cell:JsonElement)=>cell.children.every(c=>isRecord(c)&&c["kind"]==="element"&&c["type"]==="breditor/paragraph"&&textOf(c as unknown as JsonElement)==="");
    const finish=(xml:string)=>xml.endsWith("</w:p>")?xml:`${xml}<w:p/>`;
    const span=(c:number,cs:number)=>columns.slice(c,c+cs).reduce((s,col)=>s+col.width*twipsPerPixel,0);
    const tcPr=(c:number,cs:number,vMerge:""|"restart"|"continue",shade:boolean)=>`<w:tcPr><w:tcW w:w="${span(c,cs)}" w:type="dxa"/>${cs>1?`<w:gridSpan w:val="${cs}"/>`:""}${vMerge==="restart"?'<w:vMerge w:val="restart"/>':vMerge==="continue"?"<w:vMerge/>":""}${shade?'<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>':""}</w:tcPr>`;
    let body="";
    for(let r=0;r<rows.length;r++){
      let tr=r<headerRows?"<w:trPr><w:tblHeader/></w:trPr>":"";
      for(let c=0;c<columns.length;c++){
        const m=occupied.get(`${r}:${c}`);
        if(m&&m.c!==c)continue;
        if(m&&m.r!==r){tr+=`<w:tc>${tcPr(c,m.cs,"continue",false)}<w:p/></w:tc>`;continue;}
        const cell=cells[r]![c]!,isHeader=header(cell);
        if(isHeader&&r>=headerRows)this.losses.add("style-approximation");
        let content=this.blocks(cell.children,cellCtx,depth+3);
        if(m){
          // Covered source cells keep independent content natively; DOCX has one body per merged cell.
          for(let y=m.r;y<m.r+m.rs;y++)for(let x=m.c;x<m.c+m.cs;x++){
            if(y===r&&x===c)continue;const covered=cells[y]![x]!;
            if(!empty(covered)){this.losses.add("table-geometry");content+=this.blocks(covered.children,cellCtx,depth+3);}
          }
        }
        tr+=`<w:tc>${tcPr(c,m?.cs??1,m&&m.rs>1?"restart":"",isHeader)}${finish(content)}</w:tc>`;
      }
      body+=`<w:tr>${tr}</w:tr>`;
    }
    const indent=(ctx.listLevel>=0?720*(ctx.listLevel+1):0)+720*ctx.quote,width=columns.reduce((s,c)=>s+c.width*twipsPerPixel,0);
    const border=(side:string)=>`<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
    const tblPr=`<w:tblPr><w:tblW w:w="${width}" w:type="dxa"/>${indent?`<w:tblInd w:w="${indent}" w:type="dxa"/>`:""}<w:tblBorders>${["top","left","bottom","right","insideH","insideV"].map(border).join("")}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`;
    const grid=`<w:tblGrid>${columns.map(c=>`<w:gridCol w:w="${c.width*twipsPerPixel}"/>`).join("")}</w:tblGrid>`;
    return captionXml+this.#emit(`<w:tbl>${tblPr}${grid}${body}</w:tbl>`);
  }
  /** Body XML; a trailing table gets the empty paragraph Word itself would add. */
  body(root:JsonElement):string {
    const collect=(node:JsonNode,depth:number):void=>{if(depth>docxLimits.depth||node.kind!=="element")return;const name=node.properties[bookmarkProperty];if(isBookmarkName(name))this.#bookmarks.add(name);for(const child of node.children)collect(child,depth+1);};
    collect(root,0);
    const xml=this.blocks(root.children,rootCtx,1);
    return xml.endsWith("</w:p>")?xml:`${xml}<w:p/>`;
  }
}
