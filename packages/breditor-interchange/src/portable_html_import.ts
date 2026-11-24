import {inspectRichRaster,type RichRasterInspection} from "@breditor/experimental-rich-content";
import {ConversionFailure,fail,limits,sourceWithinBudget} from "./budget.js";
import {createRichInterchange} from "./index.js";
import {portableHtmlRasterLimits} from "./portable_html.js";
import type {ImportedAsset,InterchangeErrorCode,InterchangeLoss,InterchangeOwner} from "./types.js";
import {stringProperty,type Element,type Node} from "./wire.js";

export interface PortableHtmlDocumentOwner extends InterchangeOwner {
  view():{readonly revision:string;readonly readOnly?:boolean;readonly selection:{readonly kind:string}|null};
  pasteDocumentClipboard(clipboardJson:string,prefix:string,expectedRevision:string):unknown;
}

export type PortableHtmlImportResult<T>=
  Readonly<{ok:true;value:T;losses:readonly InterchangeLoss[]}>|
  Readonly<{ok:false;error:InterchangeErrorCode|"stale-observation"|"invalid-raster";losses:readonly InterchangeLoss[]}>;

export interface PreparedPortableHtmlImport {
  readonly sourceRevision:string;
  readonly rasters:readonly RichRasterInspection[];
  /** Call after retaining the complete raster set under these exact asset identities. */
  publish(bindings:readonly ImportedAsset[],idPrefix:string):PortableHtmlImportResult<undefined>;
}

class ImportFailure extends Error {
  constructor(readonly code:"stale-observation"|"invalid-raster"){super(code);}
}

function rejected(error:unknown,losses:readonly InterchangeLoss[]):PortableHtmlImportResult<never> {
  return Object.freeze({ok:false,error:error instanceof ConversionFailure||error instanceof ImportFailure?error.code:"native-admission",losses});
}

function checkTarget(owner:PortableHtmlDocumentOwner,revision:string):void {
  const current=owner.view();
  if(typeof revision!=="string"||!revision||current.revision!==revision)throw new ImportFailure("stale-observation");
  if(current.readOnly||current.selection?.kind!=="document"||typeof owner.pasteDocumentClipboard!=="function")fail("native-admission");
}

function images(root:Element):Element[] {
  const pending:Node[]=[root],result:Element[]=[];
  let visited=0;
  while(pending.length){
    const node=pending.pop()!;
    if(++visited>limits.outputNodes)fail("resource-limit");
    if(node.kind!=="element")continue;
    if(node.type==="breditor/image")result.push(node);
    for(let i=node.children.length-1;i>=0;i--)pending.push(node.children[i]!);
  }
  return result;
}

function decodeRaster(source:string,remaining:number):Blob {
  const uri=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(source);
  if(!uri||uri[0].length!==source.length)throw new ImportFailure("invalid-raster");
  const payload=uri[2]!;
  if(payload.length%4)throw new ImportFailure("invalid-raster");
  const size=payload.length/4*3-(payload.endsWith("==")?2:payload.endsWith("=")?1:0);
  if(size>remaining)fail("resource-limit");
  const binary=atob(payload);
  if(btoa(binary)!==payload)throw new ImportFailure("invalid-raster");
  return new Blob([Uint8Array.from(binary,character=>character.charCodeAt(0))],{type:uri[1]!.toLowerCase()});
}

function retainedBindings(rasters:readonly RichRasterInspection[],bindings:readonly ImportedAsset[]):Map<string,string> {
  if(!Array.isArray(bindings)||bindings.length!==rasters.length)fail("asset-policy");
  const expected=new Set(rasters.map(raster=>raster.asset)),retained=new Map<string,string>();
  for(const binding of bindings){
    if(!binding)fail("asset-policy");
    const {asset,generation}=binding;
    if(!expected.delete(asset)||typeof generation!=="string"||generation.length>128||!(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).test(generation))fail("asset-policy");
    retained.set(asset,generation);
  }
  return retained;
}

/** Prepare an inert clipboard snapshot for an exact native whole-document selection. */
export async function preparePortableHtmlImport(owner:PortableHtmlDocumentOwner,source:string,expectedRevision:string):Promise<PortableHtmlImportResult<PreparedPortableHtmlImport>> {
  let losses:readonly InterchangeLoss[]=Object.freeze([]);
  try{
    checkTarget(owner,expectedRevision);
    const sources=new Map<string,string>(),placeholders=new Map<string,string>();
    const initial=createRichInterchange(owner,{resolveImage:({src})=>{
      if(!/^[\t\n\f\r ]*data:/i.test(src))return undefined;
      let asset=placeholders.get(src);
      if(asset===undefined){asset=`portable-html-${sources.size+1}`;placeholders.set(src,asset);sources.set(asset,src);}
      return {asset,generation:"portable-html"};
    }}).importHtml(source,{kind:"flow"});
    if(!initial.ok)return initial;
    losses=initial.losses;
    const transfer=initial.value;
    if(transfer.format!=="breditor/rich-clipboard-transfer"||transfer.formatVersion!==1||transfer.kind!=="flow")fail("native-admission");
    sourceWithinBudget(transfer.structuredJson);
    const snapshot=JSON.parse(transfer.structuredJson) as {document:{root:Element}};
    if(snapshot.document.root.type!=="breditor/document")fail("native-admission");
    const bindings=new Map<string,string>();
    const assets=new Map<string,RichRasterInspection>();
    const {images:maxImages,totalBytes:maxFileBytes,maxPixels,maxDimension}=portableHtmlRasterLimits;
    let remaining=maxFileBytes;
    for(const node of images(snapshot.document.root)){
      const placeholder=stringProperty(node,"asset-id");
      if(bindings.has(placeholder))continue;
      if(bindings.size===maxImages)fail("resource-limit");
      const url=sources.get(placeholder);
      if(url===undefined)fail("native-admission");
      const file=decodeRaster(url,remaining);remaining-=file.size;
      let inspected:RichRasterInspection;
      try{inspected=await inspectRichRaster(file,{limits:{maxFileBytes,maxPixels,maxDimension}});}
      catch{throw new ImportFailure("invalid-raster");}
      checkTarget(owner,expectedRevision);
      bindings.set(placeholder,inspected.asset);
      if(!assets.has(inspected.asset))assets.set(inspected.asset,inspected);
    }
    const rasters=Object.freeze([...assets.values()]);
    const publish=(retained:readonly ImportedAsset[],idPrefix:string):PortableHtmlImportResult<undefined>=>{
      try{
        checkTarget(owner,expectedRevision);
        const generations=retainedBindings(rasters,retained),admit=owner.admitClipboardRoot;
        if(typeof admit!=="function")fail("native-admission");
        // Keep the captured transfer immutable, including when a rejected publication is retried.
        const {document:{root}}=JSON.parse(transfer.structuredJson) as {document:{root:Element}};
        for(const node of images(root)){
          const asset=bindings.get(stringProperty(node,"asset-id")),generation=asset===undefined?undefined:generations.get(asset);
          if(asset===undefined||generation===undefined)fail("asset-policy");
          node.properties["breditor/asset-id"]=asset;node.properties["breditor/asset-generation"]=generation;
        }
        const rebound=JSON.stringify(root);
        sourceWithinBudget(rebound);
        const admitted=admit.call(owner,"flow",rebound);
        if(admitted.format!=="breditor/rich-clipboard-transfer"||admitted.formatVersion!==1||admitted.kind!=="flow")fail("native-admission");
        checkTarget(owner,expectedRevision);
        const outcome=owner.pasteDocumentClipboard(admitted.structuredJson,idPrefix,expectedRevision);
        if(outcome!=="content"&&outcome!==true)fail("native-admission");
        return Object.freeze({ok:true,value:undefined,losses});
      }catch(error){return rejected(error,losses);}
    };
    checkTarget(owner,expectedRevision);
    return Object.freeze({ok:true,value:Object.freeze({sourceRevision:expectedRevision,rasters,publish}),losses});
  }catch(error){return rejected(error,losses);}
}
