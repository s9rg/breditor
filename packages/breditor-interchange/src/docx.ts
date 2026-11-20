/**
 * `@breditor/interchange/docx`: explicit, self-contained DOCX (ECMA-376 WordprocessingML) export of
 * a native rich document. Separate entry point: it imports no HTML/Markdown parser, performs no
 * network or storage access, and never loads unless a host imports it. See docs/DOCUMENT_CONVERSION.md.
 */
import {ConversionFailure} from "./budget.js";
import {isCanonicalLanguageTagV1} from "./language_tag.js";
import {collectImageBindings,documentRoot,docxLimits,DocxWriter,esc,LossLedger,type DocxImageBinding,type DocxLoss} from "./docx/convert.js";
import {appXml,contentTypes,coreXml,documentRels,documentXml,docxContentType,numberingXml,packageRels,pageMargin,pageSizes,settingsXml,stylesXml} from "./docx/parts.js";
import {zipStore,type ZipEntry} from "./docx/zip.js";
export type {DocxImageBinding,DocxLoss,DocxLossCode} from "./docx/convert.js";
export {docxLimits,docxContentType};
/** Contract revision of the DOCX writer's fidelity map (independent of interchange HTML/Markdown). */
export const docxContractV1=Object.freeze({version:1,format:"ecma-376-transitional-wordprocessingml",zip:"store-only-fixed-timestamp-v1"} as const);
export type DocxErrorCode="invalid-source"|"resource-limit"|"asset-policy";
export type DocxResult<T>=Readonly<{ok:true;value:T;losses:readonly DocxLoss[]}>|Readonly<{ok:false;error:DocxErrorCode;losses:readonly DocxLoss[]}>;
export interface DocxExportOptions {
  /** Synchronous host lookup of immutable image bytes for one native asset binding. `undefined`
   * reports `image-reference` and keeps the alt text; PNG, JPEG and GIF are embedded, any other
   * signature reports `image-format`. The library never fetches. Throwing fails with `asset-policy`. */
  readonly image?:(binding:DocxImageBinding)=>Uint8Array|undefined;
  /** Optional `dc:title` (at most 1,024 characters). */
  readonly title?:string;
  /** Canonical BCP 47 tag for the document default language (`w:lang` in docDefaults). */
  readonly language?:string;
  /** Page geometry with 1-inch margins; default `letter`. */
  readonly pageSize?:"letter"|"a4";
}
export interface DocxAsyncExportOptions extends Omit<DocxExportOptions,"image"> {
  /** Asynchronous host loader (for example `RichAssetStore.blob`). Called once per distinct binding, in document order. */
  readonly loadImage?:(binding:DocxImageBinding)=>Promise<Uint8Array|ArrayBuffer|Blob|undefined>|Uint8Array|ArrayBuffer|Blob|undefined;
}
const failure=(error:unknown,losses:readonly DocxLoss[]):DocxResult<never>=>{
  if(error instanceof ConversionFailure&&["invalid-source","resource-limit","asset-policy"].includes(error.code))return Object.freeze({ok:false,error:error.code as DocxErrorCode,losses});
  if(error instanceof RangeError)return Object.freeze({ok:false,error:"resource-limit",losses});
  return Object.freeze({ok:false,error:"invalid-source",losses});
};
/** Distinct image bindings in document order, so a host can preload bytes before `exportDocx`. */
export function docxImageBindings(documentJson:string):DocxResult<readonly DocxImageBinding[]> {
  try{return Object.freeze({ok:true,value:Object.freeze(collectImageBindings(documentRoot(documentJson))),losses:Object.freeze([])});}
  catch(error){return failure(error,Object.freeze([]));}
}
/**
 * Convert native document JSON (an editor view's `documentJson`, a `breditor/document` record, a
 * clipboard `structuredJson` or the root element itself) into DOCX bytes. Deterministic: identical
 * input and image bytes give identical output bytes.
 */
export function exportDocx(documentJson:string,options:DocxExportOptions={}):DocxResult<Uint8Array> {
  let ledger=new LossLedger();
  try{
    const title=options.title,language=options.language,pageSize=options.pageSize??"letter";
    if(title!==undefined&&(typeof title!=="string"||title.length>1024))return failure(new ConversionFailure("invalid-source"),ledger.list());
    if(pageSize!=="letter"&&pageSize!=="a4")return failure(new ConversionFailure("invalid-source"),ledger.list());
    if(options.image!==undefined&&typeof options.image!=="function")return failure(new ConversionFailure("asset-policy"),ledger.list());
    const root=documentRoot(documentJson),page=pageSizes[pageSize];
    const writer=new DocxWriter({image:options.image,contentWidthTwips:page.width-2*pageMargin});ledger=writer.losses;
    let lang:string|undefined;
    if(language!==undefined){if(isCanonicalLanguageTagV1(language))lang=language;else ledger.add("unsupported-attribute");}
    const body=writer.body(root);
    const encoder=new TextEncoder(),xml=(name:string,text:string):ZipEntry=>({name,data:encoder.encode(text)});
    const extensions=new Map<string,string>();for(const m of writer.media)extensions.set(m.image.extension,m.image.contentType);
    const titleXml=title!==undefined?esc(title.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g,"")):undefined;
    const entries:ZipEntry[]=[
      xml("[Content_Types].xml",contentTypes([...extensions].sort(([a],[b])=>a<b?-1:1).map(([extension,contentType])=>({extension,contentType})))),
      xml("_rels/.rels",packageRels),
      xml("docProps/core.xml",coreXml(titleXml,lang)),
      xml("docProps/app.xml",appXml),
      xml("word/document.xml",documentXml(body,page)),
      xml("word/styles.xml",stylesXml(lang)),
      xml("word/numbering.xml",numberingXml(writer.abstracts,writer.nums)),
      xml("word/settings.xml",settingsXml),
      xml("word/_rels/document.xml.rels",documentRels(writer.rels)),
      ...writer.media.map(m=>({name:`word/media/${m.name}`,data:m.data})),
    ];
    return Object.freeze({ok:true,value:zipStore(entries),losses:ledger.list()});
  }catch(error){return failure(error,ledger.list());}
}
/** Load every distinct image binding through an asynchronous host loader, then `exportDocx`. */
export async function exportDocxWithImages(documentJson:string,options:DocxAsyncExportOptions={}):Promise<DocxResult<Uint8Array>> {
  const {loadImage,...rest}=options;
  const bindings=docxImageBindings(documentJson);if(!bindings.ok)return bindings;
  const loaded=new Map<string,Uint8Array|undefined>();
  if(loadImage!==undefined){
    if(typeof loadImage!=="function")return failure(new ConversionFailure("asset-policy"),[]);
    let total=0;
    for(const binding of bindings.value){
      let value:Uint8Array|ArrayBuffer|Blob|undefined;
      try{value=await loadImage(binding);}catch{return failure(new ConversionFailure("asset-policy"),[]);}
      let bytes:Uint8Array|undefined;
      if(value===undefined)bytes=undefined;
      else if(value instanceof Uint8Array)bytes=value;
      else if(value instanceof ArrayBuffer)bytes=new Uint8Array(value);
      else if(typeof Blob!=="undefined"&&value instanceof Blob){
        if(value.size>docxLimits.imageBytes)return failure(new ConversionFailure("resource-limit"),[]);
        try{bytes=new Uint8Array(await value.arrayBuffer());}catch{return failure(new ConversionFailure("asset-policy"),[]);}
      }else return failure(new ConversionFailure("asset-policy"),[]);
      if(bytes&&(bytes.length>docxLimits.imageBytes||(total+=bytes.length)>docxLimits.totalImageBytes))return failure(new ConversionFailure("resource-limit"),[]);
      loaded.set(`${binding.asset}\u0000${binding.generation}`,bytes);
    }
  }
  return exportDocx(documentJson,{...rest,image:binding=>loaded.get(`${binding.asset}\u0000${binding.generation}`)});
}
