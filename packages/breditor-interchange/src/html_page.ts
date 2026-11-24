import {bytes,fail} from "./budget.js";
import {canonicalLanguageTagV1} from "./language_tag.js";
import {escapeAttribute,escapeText} from "./safe_url.js";

export interface HtmlPageMetadata {
  readonly title:string;
  readonly description?:string;
  /** A bounded language tag, canonicalized for the HTML lang attribute. */
  readonly language?:string;
  readonly direction?:"ltr"|"rtl"|"auto";
}

export const htmlPageMetadataLimits=Object.freeze({titleBytes:1024,descriptionBytes:4096});
const metadataFields=new Set(["title","description","language","direction"]);

function checkedText(value:unknown,maxBytes:number):string {
  if(typeof value!=="string"||value.includes("\u0000"))fail("unsupported-content");
  if(value.length>maxBytes||bytes(value)>maxBytes)fail("resource-limit");
  return value;
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
