import {Budget,bytes,fail} from "./budget.js";
import {attribute,isElement,plainText,type HtmlNode} from "./html_tree.js";
import {canonicalLanguageTagV1} from "./language_tag.js";
import {escapeAttribute,escapeText} from "./safe_url.js";
import type {ClipboardTransfer} from "./types.js";

export interface HtmlPageMetadata {
  readonly title:string;
  readonly description?:string;
  /** A bounded language tag, canonicalized for the HTML lang attribute. */
  readonly language?:string;
  readonly direction?:"ltr"|"rtl"|"auto";
}
export interface ImportedHtmlPage {
  readonly metadata:HtmlPageMetadata;
  readonly body:ClipboardTransfer;
}

export const htmlPageMetadataLimits=Object.freeze({titleBytes:1024,descriptionBytes:4096});
const metadataFields=new Set(["title","description","language","direction"]);

function checkedText(value:unknown,maxBytes:number):string {
  if(typeof value!=="string"||value.includes("\u0000"))fail("unsupported-content");
  if(value.length>maxBytes||bytes(value)>maxBytes)fail("resource-limit");
  return value;
}

/** Read the explicit page fields from the inert tree and leave ordinary admitted body content. */
export function readHtmlPageMetadata(nodes:readonly HtmlNode[],budget:Budget):HtmlPageMetadata {
  const html=nodes[0];
  if(!html||!isElement(html)||html.tagName!=="html")fail("unsupported-content");
  const rawLanguage=attribute(html,"lang"),rawDirection=attribute(html,"dir");
  const language=rawLanguage===undefined||rawLanguage===""?undefined:canonicalLanguageTagV1(rawLanguage);
  const direction=rawDirection?.toLowerCase();
  const hasDirection=direction==="ltr"||direction==="rtl"||direction==="auto";
  if(language===null)budget.loss("unsupported-attribute");
  if(rawDirection!==undefined&&!hasDirection)budget.loss("unsupported-attribute");
  // Page-level metadata stays editable in the host instead of becoming inherited body marks.
  html.attrs=html.attrs.filter(attr=>{
    if(attr.name==="xml:lang"){budget.loss("unsupported-attribute");return false;}
    return !["lang","dir"].includes(attr.name);
  });
  const head=html.childNodes.find(node=>isElement(node)&&node.tagName==="head");
  let title:string|undefined,description:string|undefined;
  if(head&&isElement(head))head.childNodes=head.childNodes.filter(node=>{
    if(!isElement(node))return false;
    if(node.tagName==="style")return true;
    if(node.tagName==="title"){
      if(title!==undefined)budget.loss("removed-content");
      else title=checkedText(plainText(node),htmlPageMetadataLimits.titleBytes);
      if(node.attrs.length)budget.loss("unsupported-attribute",node.attrs.length);
    }else if(node.tagName==="meta"&&attribute(node,"name")?.toLowerCase()==="description"&&attribute(node,"http-equiv")===undefined){
      const content=attribute(node,"content");
      if(content===undefined||description!==undefined)budget.loss("removed-content");
      else description=checkedText(content,htmlPageMetadataLimits.descriptionBytes);
      const unsupported=node.attrs.filter(attr=>attr.name!=="name"&&attr.name!=="content").length;
      if(unsupported)budget.loss("unsupported-attribute",unsupported);
    }else if(node.tagName==="meta"&&node.attrs.length===1&&attribute(node,"charset")?.toLowerCase()==="utf-8"){
      // The input is already a Unicode string. The portable page writer emits UTF-8.
    }else if(node.tagName==="link"&&attribute(node,"rel")?.toLowerCase().split(/[\t\n\f\r ]+/).includes("stylesheet")){
      budget.loss("unsupported-style");
    }else budget.loss("removed-content");
    return false;
  });
  return Object.freeze({title:title??"",...(description===undefined?{}:{description}),...(language?{language}:{}),...(hasDirection?{direction}:{})});
}

export function htmlPageOpening(metadata:HtmlPageMetadata):string {
  if(!metadata||typeof metadata!=="object"||Array.isArray(metadata)||
    Object.keys(metadata).some(name=>!metadataFields.has(name)))fail("unsupported-content");
  const {title,description,language,direction}=metadata;
  const safeTitle=escapeText(checkedText(title,htmlPageMetadataLimits.titleBytes));
  const safeDescription=description===undefined?"":`<meta name="description" content="${escapeAttribute(checkedText(description,htmlPageMetadataLimits.descriptionBytes))}">`;
  const lang=language===undefined?undefined:canonicalLanguageTagV1(language);
  if(lang===null||direction!==undefined&&direction!=="ltr"&&direction!=="rtl"&&direction!=="auto")fail("unsupported-content");
  const langAttr=lang===undefined?"":` lang="${lang}"`,dirAttr=direction===undefined?"":` dir="${direction}"`;
  return `<!doctype html><html${langAttr}${dirAttr}><head><meta charset="utf-8"><title>${safeTitle}</title>${safeDescription}</head><body>`;
}
