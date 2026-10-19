/** Bounded native metadata admission; never reconstruct dependencies from a rendered document. */
import type {RichRetainedAssetReference,RichRetainedAssetReferencesRead} from "./retained_asset_references_types.js";
export const MAX_RETAINED_ASSET_REFERENCES_JSON_BYTES=8*1024*1024;
export const MAX_RETAINED_ASSET_REFERENCES=100000;
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const fields=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const identity=(value:unknown):value is string=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const decimal=(value:unknown):value is string=>typeof value==="string"&&/^(?:0|[1-9][0-9]{0,19})$/.test(value)&&BigInt(value)<=18446744073709551615n;
const schemaName=(value:unknown):value is string=>typeof value==="string"&&value.length<=128&&/^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/.test(value);
export function parseRichRetainedAssetReferences(input:string):RichRetainedAssetReferencesRead {
 const rejected=()=>new TypeError("Invalid native retained asset references");
 if(typeof input!=="string"||input.length>MAX_RETAINED_ASSET_REFERENCES_JSON_BYTES||new TextEncoder().encode(input).byteLength>MAX_RETAINED_ASSET_REFERENCES_JSON_BYTES)throw rejected();
 let value:unknown;try{value=JSON.parse(input);}catch{throw rejected();}
 if(!object(value)||!fields(value,["format","formatVersion","schema","document","revision","retention","references"])||value["format"]!=="breditor/rich-retained-asset-references"||value["formatVersion"]!==1||!identity(value["document"])||!decimal(value["revision"])||value["retention"]!=="local-history"&&value["retention"]!=="shared-causal"||!object(value["schema"])||!fields(value["schema"],["name","version","fingerprint"])||!schemaName(value["schema"]["name"])||!Number.isInteger(value["schema"]["version"])||Number(value["schema"]["version"])<1||Number(value["schema"]["version"])>0xffffffff||typeof value["schema"]["fingerprint"]!=="string"||!/^sha256:[0-9a-f]{64}$/.test(value["schema"]["fingerprint"])||!Array.isArray(value["references"])||value["references"].length>MAX_RETAINED_ASSET_REFERENCES)throw rejected();
 let previous:RichRetainedAssetReference|undefined;
 const references=value["references"].map((entry:unknown):RichRetainedAssetReference=>{
  if(!object(entry)||!fields(entry,["asset","generation"])||!identity(entry["asset"])||!identity(entry["generation"]))throw rejected();
  const pair={asset:entry["asset"],generation:entry["generation"]};
  if(previous&&(previous.asset>pair.asset||previous.asset===pair.asset&&previous.generation>=pair.generation))throw rejected();
  previous=pair;return Object.freeze(pair);
 });
 return Object.freeze({format:"breditor/rich-retained-asset-references",formatVersion:1,schema:Object.freeze({name:value["schema"]["name"],version:Number(value["schema"]["version"]),fingerprint:value["schema"]["fingerprint"]}),document:value["document"],revision:value["revision"],retention:value["retention"] as RichRetainedAssetReferencesRead["retention"],references:Object.freeze(references)});
}
