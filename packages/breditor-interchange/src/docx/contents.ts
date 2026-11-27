/**
 * Opt-in DOCX table of contents: one Word `TOC` complex field at the start of the body whose cached
 * result is pre-filled with one hyperlinked paragraph per heading, so the list reads correctly before
 * Word (or another consumer) updates fields. Each listed heading carries a hidden `_Toc…` bookmark
 * that the entry's `w:hyperlink w:anchor` targets.
 *
 * Heading selection and labels follow the static HTML contents (`@breditor/editor/static`):
 * headings in document order (including those nested in lists, quotes, sections and table cells),
 * one entry per heading block identity, at most 512 entries, labels from the heading's direct text
 * with leading/trailing whitespace trimmed, bounded to 512 UTF-16 units (`…` marks a cut) and
 * "Untitled heading" for an empty label. Bookmark names derive from the block identity, so they are
 * stable when labels or neighbouring headings change. They start with `_`, which the native bookmark
 * grammar (`[A-Za-z][A-Za-z0-9_-]{0,63}`) can never produce, so they never clash with user bookmarks.
 */
import {fail} from "../budget.js";
import {escAttr,esc,type JsonElement} from "./convert.js";

export interface DocxContentsOptions {
  /** Paragraph shown above the list (style `TOC Heading`). Nonempty after trimming, at most 256
   * characters, no control characters or lone surrogates. Defaults to "Table of contents". */
  readonly title?:string;
  /** Shallowest heading level listed (1–6, default 1). */
  readonly minLevel?:number;
  /** Deepest heading level listed (1–6, default 6, at least `minLevel`). */
  readonly maxLevel?:number;
  /** Placement; only `"start"` (before the first body block) is defined. */
  readonly position?:"start";
  /** Also write `w:updateFields` in settings so Word offers to refresh fields (adding page numbers)
   * when the file is opened. Default `false`; see docs/DOCUMENT_CONVERSION.md for the trade-off. */
  readonly updateFields?:boolean;
}
export interface ResolvedContents {
  readonly title:string;readonly minLevel:number;readonly maxLevel:number;readonly updateFields:boolean;
}
export const docxContentsLimits=Object.freeze({entries:512,labelUnits:512,titleChars:256});
const defaultTitle="Table of contents";
const loneSurrogate=/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const level=(v:unknown):v is number=>typeof v==="number"&&Number.isInteger(v)&&v>=1&&v<=6;
const keys=new Set(["title","minLevel","maxLevel","position","updateFields"]);

/** Validate the `contents` export option; any malformed value fails with `invalid-source`. */
export function resolveContents(value:unknown):ResolvedContents|undefined {
  if(value===undefined||value===false)return undefined;
  if(value===true)return Object.freeze({title:defaultTitle,minLevel:1,maxLevel:6,updateFields:false});
  if(value===null||typeof value!=="object"||Array.isArray(value))fail("invalid-source");
  const record=value as Record<string,unknown>;
  for(const key of Object.keys(record))if(!keys.has(key))fail("invalid-source");
  const {title,minLevel=1,maxLevel=6,position="start",updateFields=false}=record;
  if(title!==undefined&&(typeof title!=="string"||!title.trim()||title.length>docxContentsLimits.titleChars||loneSurrogate.test(title)||/[\u0000-\u001F\u007F]/.test(title)))fail("invalid-source");
  if(!level(minLevel)||!level(maxLevel)||minLevel>maxLevel||position!=="start"||typeof updateFields!=="boolean")fail("invalid-source");
  return Object.freeze({title:(title as string|undefined)??defaultTitle,minLevel,maxLevel,updateFields});
}

/** Same rule as the static HTML contents: direct text only, trimmed, bounded, never empty. */
export function contentsLabel(node:JsonElement):{label:string;approximate:boolean} {
  const max=docxContentsLimits.labelUnits;let label="";
  for(const child of node.children){
    if(child.kind!=="text")continue;
    const chunk=label.length===0?child.text.trimStart():child.text;
    label+=chunk.slice(0,max+1-label.length);
    if(label.length>max)break;
  }
  const truncated=label.length>max;
  label=label.slice(0,max).replace(/[\uD800-\uDBFF]$/,"").trim();
  return label?{label:label+(truncated?"…":""),approximate:truncated}:{label:"Untitled heading",approximate:true};
}

/** FNV-1a (32-bit) of the block identity: a deterministic, label-independent bookmark name. */
function fnv(text:string):number{let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h;}
export class ContentsCollector {
  readonly entries:{bookmark:string;label:string;level:number}[]=[];
  #blocks=new Set<string>();#names=new Set<string>();
  constructor(readonly options:ResolvedContents){}
  /** The `_Toc` bookmark for one heading, or `undefined` when it is not listed. `approximate` is
   * called when the cached entry differs from what Word would regenerate on update. */
  admit(node:JsonElement,headingLevel:number,ordinal:number,approximate:()=>void):string|undefined {
    if(headingLevel<this.options.minLevel||headingLevel>this.options.maxLevel)return undefined;
    const id=node.properties["breditor/block-id"],block=typeof id==="string"?`b:${id}`:`n:${ordinal}`;
    // A repeated block identity or the 513th entry is left out of the cached list (Word would list it).
    if(this.#blocks.has(block)||this.entries.length>=docxContentsLimits.entries){approximate();return undefined;}
    this.#blocks.add(block);
    let hash=fnv(block),bookmark:string;
    for(;;){bookmark=`_Toc${hash.toString(16).padStart(8,"0")}`;if(!this.#names.has(bookmark))break;hash=(hash+1)>>>0;}
    this.#names.add(bookmark);
    const {label,approximate:approx}=contentsLabel(node);if(approx)approximate();
    this.entries.push({bookmark,label,level:headingLevel});
    return bookmark;
  }
  /** Title paragraph plus the field; empty when no heading is listed (like the HTML navigation). */
  xml():string {
    if(!this.entries.length)return "";
    // The heading itself already reports stripped controls; the entry shows breaks and tabs as spaces.
    const clean=(text:string)=>esc(text.replace(/[\t\n\r]/g," ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,""));
    const instruction=` TOC \\o "${this.options.minLevel}-${this.options.maxLevel}" \\h \\z \\u `;
    let out=`<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t xml:space="preserve">${clean(this.options.title)}</w:t></w:r></w:p>`;
    this.entries.forEach((entry,index)=>{
      const begin=index===0?`<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${esc(instruction)}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`:"";
      out+=`<w:p><w:pPr><w:pStyle w:val="TOC${entry.level}"/></w:pPr>${begin}<w:hyperlink w:anchor="${escAttr(entry.bookmark)}" w:history="1"><w:r><w:t xml:space="preserve">${clean(entry.label)}</w:t></w:r></w:hyperlink></w:p>`;
    });
    return out+'<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
  }
}
