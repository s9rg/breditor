/**
 * `@breditor/interchange/epub`: explicit, self-contained EPUB 3 export of a native rich document.
 * Separate entry point: it imports no HTML/Markdown parser, performs no network or storage access,
 * reads no clock, and never loads unless a host imports it. Content documents come from the same
 * semantic HTML exporter as `exportHtml`, serialized as XHTML. See docs/DOCUMENT_CONVERSION.md.
 */
import {Budget,ConversionFailure,fail,limits} from "./budget.js";
import {isCanonicalLanguageTagV1} from "./language_tag.js";
import {collectImageBindings,documentRoot,docxLimits,esc,type JsonElement,type JsonNode} from "./docx/convert.js";
import {sniffImage} from "./docx/image.js";
import {zipStore,type ZipEntry} from "./docx/zip.js";
import {epubSplits,renderFlow,splitFlow,type EpubSplit} from "./epub/chapters.js";
import {containerXml,epubContentType,navBody,packageRoot,packageXml,stylesheet,xhtmlDocument,type ManifestItem} from "./epub/parts.js";
import {invalidXmlCharacters} from "./epub/xhtml.js";
import type {InterchangeLossCode} from "./types.js";
import type {Node} from "./wire.js";
export type {EpubSplit} from "./epub/chapters.js";
export {epubContentType};

/** Contract revision of the EPUB writer (independent of the HTML/Markdown grammar it reuses). */
export const epubContractV1=Object.freeze({version:1,format:"epub-3.3",content:"bounded-semantic-html-v1-as-xhtml",zip:"store-only-fixed-timestamp-v1"} as const);
export const epubLimits=Object.freeze({
  /** UTF-16 code units of the native document JSON (same as DOCX). */
  documentChars:docxLimits.documentChars,
  /** Visited native nodes in the whole document, and per content document (the HTML exporter bound). */
  nodes:docxLimits.nodes,chapterNodes:limits.outputNodes,
  depth:docxLimits.depth,
  chapters:1024,
  images:docxLimits.images,imageBytes:docxLimits.imageBytes,totalImageBytes:docxLimits.totalImageBytes,
  /** Generated XHTML (UTF-16 code units) across all content documents. */
  xhtmlChars:32*1024*1024,
  titleChars:1024,authorChars:1024,identifierChars:256,
});
/** Reused interchange codes plus `image-format` (host bytes are not PNG, JPEG or GIF). */
export type EpubLossCode=Exclude<InterchangeLossCode,"html-repaired"|"markdown-feature">|"image-format";
export interface EpubLoss {readonly code:EpubLossCode;readonly count:number;readonly effect:"loss"}
export interface EpubImageBinding {readonly asset:string;readonly generation:string}
export type EpubErrorCode="invalid-source"|"resource-limit"|"asset-policy";
export type EpubResult<T>=Readonly<{ok:true;value:T;losses:readonly EpubLoss[]}>|Readonly<{ok:false;error:EpubErrorCode;losses:readonly EpubLoss[]}>;
export interface EpubMetadata {
  /** `dc:title`: 1-1,024 characters, not blank, no control characters. */
  readonly title:string;
  /** Canonical BCP 47 tag: `dc:language` and the content documents' `lang`/`xml:lang`. */
  readonly language:string;
  /** `dc:identifier` (the unique identifier), for example `urn:uuid:...`: 1-256 characters, no
   * leading/trailing whitespace or control characters. The host owns its stability across exports. */
  readonly identifier:string;
  /** Optional `dc:creator`: 1-1,024 characters, not blank, no control characters. */
  readonly author?:string;
  /** `dcterms:modified`, supplied by the caller (never read from a clock): `YYYY-MM-DDThh:mm:ssZ`. */
  readonly modified:string;
}
export interface EpubExportOptions extends EpubMetadata {
  /** Where content documents split; default `heading-1`. */
  readonly split?:EpubSplit;
  /** Synchronous host lookup of image bytes for one immutable native asset binding, called once per
   * distinct binding in document order. `undefined` reports `image-reference` and keeps the alt text;
   * PNG, JPEG and GIF are embedded, any other signature reports `image-format`. Throwing or returning
   * a non-byte value fails with `asset-policy`. The library never fetches. */
  readonly image?:(binding:EpubImageBinding)=>Uint8Array|undefined;
}
export interface EpubAsyncExportOptions extends Omit<EpubExportOptions,"image"> {
  /** Called once per distinct binding, in document order. Returned bytes are copied before the next lookup. */
  readonly loadImage?:(binding:EpubImageBinding)=>Promise<Uint8Array|ArrayBuffer|Blob|undefined>|Uint8Array|ArrayBuffer|Blob|undefined;
}

const frozen=Object.freeze([]) as readonly EpubLoss[];
const failure=(error:unknown,losses:readonly EpubLoss[]):EpubResult<never>=>{
  const code=error instanceof ConversionFailure?error.code:error instanceof RangeError?"resource-limit":"invalid-source";
  return Object.freeze({ok:false,error:code==="resource-limit"||code==="asset-policy"?code:"invalid-source",losses});
};
const control=/[\u0000-\u001F\u007F-\u009F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function metadataText(value:unknown,max:number,exactEdges:boolean):string {
  if(typeof value!=="string"||value.length<1||value.length>max||control.test(value)||!value.trim()||exactEdges&&value.trim()!==value)fail("invalid-source");
  return value;
}
/** EPUB 3.3 requires exactly `CCYY-MM-DDThh:mm:ssZ`; the date must exist in the proleptic Gregorian calendar. */
function modifiedDate(value:unknown):string {
  const m=typeof value==="string"?/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(value):null;
  if(!m)fail("invalid-source");
  const [year,month,day,hour,minute,second]=m.slice(1).map(Number) as [number,number,number,number,number,number];
  const date=new Date(Date.UTC(year,month-1,day,hour,minute,second));
  if(year<1||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||hour>23||minute>59||second>59)fail("invalid-source");
  return value as string;
}
interface Validated {readonly title:string;readonly language:string;readonly identifier:string;readonly author:string|undefined;readonly modified:string;readonly split:EpubSplit}
/** Every option is checked before any host image callback runs. */
function validateOptions(options:unknown):Validated {
  if(options===null||typeof options!=="object")fail("invalid-source");
  const o=options as Record<string,unknown>,split=o["split"]??"heading-1";
  if(!epubSplits.includes(split as EpubSplit)||!isCanonicalLanguageTagV1(o["language"]))fail("invalid-source");
  return Object.freeze({
    title:metadataText(o["title"],epubLimits.titleChars,false),
    language:o["language"] as string,
    identifier:metadataText(o["identifier"],epubLimits.identifierChars,true),
    author:o["author"]===undefined?undefined:metadataText(o["author"],epubLimits.authorChars,false),
    modified:modifiedDate(o["modified"]),
    split:split as EpubSplit,
  });
}
/** Remove XML-invalid characters from every string the writer may emit (reported as `removed-content`). */
function stripInvalidXml(root:JsonElement):number {
  let removed=0;
  const clean=(value:string):string=>value.replace(invalidXmlCharacters,()=>{removed++;return "";});
  const record=(properties:Record<string,unknown>)=>{for(const key of Object.keys(properties)){const v=properties[key];if(typeof v==="string")properties[key]=clean(v);}};
  const walk=(node:JsonNode):void=>{
    if(node.kind==="text"){node.text=clean(node.text);for(const f of node.formats)record(f.properties);return;}
    record(node.properties);for(const child of node.children)walk(child);
  };
  walk(root);return removed;
}
const bindingKey=(b:EpubImageBinding)=>`${b.asset}\u0000${b.generation}`;

/** Distinct image bindings in document order, so a host can preload bytes before `exportEpub`. */
export function epubImageBindings(documentJson:string):EpubResult<readonly EpubImageBinding[]> {
  try{return Object.freeze({ok:true,value:Object.freeze(collectImageBindings(documentRoot(documentJson))),losses:frozen});}
  catch(error){return failure(error,frozen);}
}

function build(documentJson:string,meta:Validated,loaded:ReadonlyMap<string,Uint8Array|undefined>):EpubResult<Uint8Array> {
  const budget=new Budget(),extra=new Map<EpubLossCode,number>();
  const losses=():readonly EpubLoss[]=>{
    const all=new Map<EpubLossCode,number>();
    for(const loss of budget.losses())all.set(loss.code as EpubLossCode,loss.count);
    for(const [code,count] of extra)all.set(code,(all.get(code)??0)+count);
    return Object.freeze([...all].filter(([,count])=>count>0).sort(([a],[b])=>a<b?-1:1).map(([code,count])=>Object.freeze({code,count,effect:"loss" as const})));
  };
  try{
    const root=documentRoot(documentJson),bindings=collectImageBindings(root);
    const removed=stripInvalidXml(root);if(removed)extra.set("removed-content",removed);
    // Images: only recognized raster signatures are admitted; names are assigned at first rendered
    // use, so the manifest lists exactly the images the content documents reference, in order.
    const admitted=new Map<string,{data:Uint8Array;extension:string;mediaType:string}>(),rejected=new Set<string>();
    for(const binding of bindings){
      const bytes=loaded.get(bindingKey(binding));if(bytes===undefined)continue;
      const sniffed=sniffImage(bytes);
      if(!sniffed){rejected.add(bindingKey(binding));continue;}
      admitted.set(bindingKey(binding),{data:bytes,extension:sniffed.extension==="jpeg"?"jpg":sniffed.extension,mediaType:sniffed.contentType});
    }
    const images=new Map<string,{href:string;data:Uint8Array;mediaType:string}>();
    let formatUses=0;
    const chapters=splitFlow(root.children as Node[],meta.split,epubLimits.chapters);
    const flow=renderFlow(chapters,budget,binding=>{
      const key=bindingKey(binding),known=images.get(key);if(known)return known.href;
      const image=admitted.get(key);
      if(!image){if(rejected.has(key))formatUses++;return undefined;}
      const href=`images/image-${images.size+1}.${image.extension}`;
      images.set(key,{href,data:image.data,mediaType:image.mediaType});return href;
    },index=>`chapter-${index+1}.xhtml`);
    // A rejected format is reported as `image-format` instead of the exporter's generic `image-reference`.
    if(formatUses){extra.set("image-format",formatUses);extra.set("image-reference",-formatUses);}
    if(flow.danglingLinks)extra.set("unsafe-link",flow.danglingLinks);
    const title=esc(meta.title),language=meta.language;
    const nav=flow.nav.length?flow.nav:[{level:1,href:flow.chapters[0]!.file,label:title}];
    const documents=[...flow.chapters.map(chapter=>({name:chapter.file,text:xhtmlDocument(title,language,chapter.body)})),
      {name:"nav.xhtml",text:xhtmlDocument(title,language,navBody(title,nav),true)}];
    let chars=0;for(const d of documents)if((chars+=d.text.length)>epubLimits.xhtmlChars)fail("resource-limit");
    for(const d of documents)if(new RegExp(invalidXmlCharacters.source).test(d.text))fail("invalid-source");
    const items:ManifestItem[]=[
      {id:"nav",href:"nav.xhtml",mediaType:"application/xhtml+xml",properties:"nav"},
      {id:"style",href:"style.css",mediaType:"text/css"},
      ...flow.chapters.map((chapter,i)=>({id:`chapter-${i+1}`,href:chapter.file,mediaType:"application/xhtml+xml"})),
      ...[...images.values()].map((image,i)=>({id:`image-${i+1}`,href:image.href,mediaType:image.mediaType})),
    ];
    const opf=packageXml({title,language,identifier:esc(meta.identifier),author:meta.author===undefined?undefined:esc(meta.author),modified:meta.modified},items,flow.chapters.map((_c,i)=>`chapter-${i+1}`));
    const encoder=new TextEncoder(),text=(name:string,value:string):ZipEntry=>({name,data:encoder.encode(value)});
    const entries:ZipEntry[]=[
      // OCF: `mimetype` first, stored, no extra field (the STORE writer never adds one).
      text("mimetype",epubContentType),
      text("META-INF/container.xml",containerXml),
      text(`${packageRoot}/package.opf`,opf),
      text(`${packageRoot}/nav.xhtml`,documents.at(-1)!.text),
      text(`${packageRoot}/style.css`,stylesheet),
      ...documents.slice(0,-1).map(d=>text(`${packageRoot}/${d.name}`,d.text)),
      ...[...images.values()].map(image=>({name:`${packageRoot}/${image.href}`,data:image.data})),
    ];
    return Object.freeze({ok:true,value:zipStore(entries),losses:losses()});
  }catch(error){return failure(error,losses());}
}

/**
 * Convert native document JSON (an editor view's `documentJson`, a `breditor/document` record, a
 * clipboard `structuredJson` or the root element itself) into EPUB 3 bytes. Deterministic:
 * identical input, options and image bytes give identical output bytes.
 */
export function exportEpub(documentJson:string,options:EpubExportOptions):EpubResult<Uint8Array> {
  let meta:Validated;try{meta=validateOptions(options);}catch(error){return failure(error,frozen);}
  const bindings=epubImageBindings(documentJson);if(!bindings.ok)return bindings;
  const image=options.image;
  if(image!==undefined&&typeof image!=="function")return failure(new ConversionFailure("asset-policy"),frozen);
  const loaded=new Map<string,Uint8Array|undefined>();let total=0;
  if(image!==undefined)for(const binding of bindings.value){
    let value:unknown;try{value=Reflect.apply(image,options,[Object.freeze({...binding})]);}catch{return failure(new ConversionFailure("asset-policy"),frozen);}
    if(value!==undefined&&!(value instanceof Uint8Array))return failure(new ConversionFailure("asset-policy"),frozen);
    if(value!==undefined&&(value.length>epubLimits.imageBytes||(total+=value.length)>epubLimits.totalImageBytes))return failure(new ConversionFailure("resource-limit"),frozen);
    let copy:Uint8Array|undefined;try{copy=value===undefined?undefined:new Uint8Array(value);}catch{return failure(new ConversionFailure("asset-policy"),frozen);}
    loaded.set(bindingKey(binding),copy);
  }
  return build(documentJson,meta,loaded);
}
/** Validate options, load every distinct image binding through an asynchronous host loader, then export. */
export async function exportEpubWithImages(documentJson:string,options:EpubAsyncExportOptions):Promise<EpubResult<Uint8Array>> {
  let meta:Validated;try{meta=validateOptions(options);}catch(error){return failure(error,frozen);}
  const bindings=epubImageBindings(documentJson);if(!bindings.ok)return bindings;
  const loadImage=options.loadImage,loaded=new Map<string,Uint8Array|undefined>();
  if(loadImage!==undefined){
    if(typeof loadImage!=="function")return failure(new ConversionFailure("asset-policy"),frozen);
    let total=0;
    for(const binding of bindings.value){
      let value:unknown;
      try{value=await Reflect.apply(loadImage,options,[Object.freeze({...binding})]);}catch{return failure(new ConversionFailure("asset-policy"),frozen);}
      let bytes:Uint8Array|undefined;
      try{
        if(value===undefined)bytes=undefined;
        else if(value instanceof Uint8Array||value instanceof ArrayBuffer)bytes=new Uint8Array(value);
        else if(typeof Blob!=="undefined"&&value instanceof Blob){
          if(value.size>epubLimits.imageBytes)return failure(new ConversionFailure("resource-limit"),frozen);
          bytes=new Uint8Array(await value.arrayBuffer());
        }else return failure(new ConversionFailure("asset-policy"),frozen);
      }catch{return failure(new ConversionFailure("asset-policy"),frozen);}
      if(bytes&&(bytes.length>epubLimits.imageBytes||(total+=bytes.length)>epubLimits.totalImageBytes))return failure(new ConversionFailure("resource-limit"),frozen);
      loaded.set(bindingKey(binding),bytes);
    }
  }
  return build(documentJson,meta,loaded);
}
