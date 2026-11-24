/** Explicit browser exporter for host-owned raster bytes in a native clipboard snapshot. */
import {inspectRichRaster} from "@breditor/experimental-rich-content";
import {Budget,ConversionFailure,fail,limits,sourceWithinBudget} from "./budget.js";
import {exportHtmlRoot,imageBinding} from "./html_export.js";
import type {ImportedAsset,InterchangeOwner,InterchangeResult} from "./types.js";
import type {Node} from "./wire.js";

export const portableHtmlRasterLimits=Object.freeze({images:64,totalBytes:512*1024,maxPixels:8*1024*1024,maxDimension:4096});
export interface PortableHtmlRasterOptions {
  /** Look up immutable bytes for this exact asset and generation. */
  readonly loadImage:(binding:ImportedAsset)=>Blob|undefined|Promise<Blob|undefined>;
}

const bindingKey=({asset,generation}:ImportedAsset):string=>JSON.stringify([asset,generation]);

function collectBindings(nodes:readonly Node[]):Map<string,ImportedAsset> {
  const pending=[...nodes].reverse(),bindings=new Map<string,ImportedAsset>();
  let visited=0;
  while(pending.length){
    const node=pending.pop()!;
    if(++visited>limits.outputNodes)fail("resource-limit");
    if(node.kind!=="element")continue;
    if(node.type==="breditor/image"){
      const binding=imageBinding(node),key=bindingKey(binding);
      if(!bindings.has(key))bindings.set(key,binding);
      if(bindings.size>portableHtmlRasterLimits.images)fail("resource-limit");
    }
    for(let i=node.children.length-1;i>=0;i--)pending.push(node.children[i]!);
  }
  return bindings;
}

function base64(bytes:Uint8Array):string {
  const chunks:string[]=[];
  for(let at=0;at<bytes.length;at+=8192)chunks.push(String.fromCharCode(...bytes.subarray(at,at+8192)));
  return btoa(chunks.join(""));
}

/** Validate before awaiting host bytes. Image decoding and Base64 encoding are local to the browser. */
export async function exportPortableHtml(owner:InterchangeOwner,clipboardJson:string,options:PortableHtmlRasterOptions):Promise<InterchangeResult<string>> {
  const budget=new Budget();
  try{
    sourceWithinBudget(clipboardJson);
    const validate=owner.validateClipboard;
    if(owner.supportsClipboardInterchange?.()!==true||typeof validate!=="function")fail("native-admission");
    const {format,formatVersion,kind,structuredJson}=validate.call(owner,clipboardJson);
    if(format!=="breditor/rich-clipboard-transfer"||formatVersion!==1||(kind!=="text"&&kind!=="flow"&&kind!=="grid"))fail("native-admission");
    sourceWithinBudget(structuredJson);
    const {document:{root}}=JSON.parse(structuredJson) as {document:{root:{type:string;children:Node[]}}};
    if(root.type!=="breditor/document")fail("native-admission");
    const bindings=collectBindings(root.children),bookmarks=owner.supportsBookmarks?.()===true;
    const loadImage=options?.loadImage;
    if(typeof loadImage!=="function")fail("asset-policy");
    const prepared=new Map<string,string>();
    const {totalBytes:maxFileBytes,maxPixels,maxDimension}=portableHtmlRasterLimits;
    let total=0;
    for(const [key,binding] of bindings){
      let blob:Blob|undefined;
      try{blob=await loadImage.call(options,binding);}catch{fail("asset-policy");}
      if(blob===undefined)continue;
      if(!(blob instanceof Blob))fail("asset-policy");
      total+=blob.size;if(total>portableHtmlRasterLimits.totalBytes)fail("resource-limit");
      let admitted:Awaited<ReturnType<typeof inspectRichRaster>>;
      try{admitted=await inspectRichRaster(blob,{limits:{maxFileBytes,maxPixels,maxDimension}});}catch{continue;}
      if(binding.asset.startsWith("sha256:")&&binding.asset!==admitted.asset)continue;
      const payload=new Uint8Array(await admitted.blob.arrayBuffer());
      prepared.set(key,`data:${admitted.mime};base64,${base64(payload)}`);
    }
    let embeddedBytes=0;
    const value=exportHtmlRoot(root.children,budget,{},kind,bookmarks,binding=>{
      const url=prepared.get(bindingKey(binding));
      if(url!==undefined&&(embeddedBytes+=url.length)>limits.outputBytes)fail("resource-limit");
      return url;
    });
    return Object.freeze({ok:true,value,losses:budget.losses()});
  }catch(error){return Object.freeze({ok:false,error:error instanceof ConversionFailure?error.code:"native-admission",losses:budget.losses()});}
}
