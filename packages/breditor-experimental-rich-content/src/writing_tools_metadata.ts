/** Shape-strict bounded native metadata parsing; no JavaScript text segmentation. */
import type {RichWritingToolsRead,RichWritingHeading} from "./writing_tools_types.js";
const maximum=8*1024*1024,textMaximum=4*1024*1024,domainMaximum=8192;
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const fields=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const decimal=(value:unknown,max:bigint):value is string=>typeof value==="string"&&/^(?:0|[1-9][0-9]{0,19})$/.test(value)&&BigInt(value)<=max;
const identity=(value:unknown):value is string=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const wellFormed=(text:string)=>{for(const scalar of text){const code=scalar.codePointAt(0)!;if(code>=0xd800&&code<=0xdfff)return false;}return true;};
export function parseRichWritingTools(input:string):RichWritingToolsRead {
 const rejected=()=>new TypeError("Invalid native writing metadata");
 if(typeof input!=="string"||input.length>maximum||new TextEncoder().encode(input).byteLength>maximum)throw rejected();
 let value:unknown;try{value=JSON.parse(input);}catch{throw rejected();}
 if(!object(value)||!fields(value,["format","formatVersion","schema","document","revision","counts","outline"])||value["format"]!=="breditor/rich-writing-tools"||value["formatVersion"]!==1||!object(value["schema"])||!fields(value["schema"],["name","version","fingerprint"])||typeof value["schema"]["name"]!=="string"||value["schema"]["name"].length===0||value["schema"]["name"].length>256||!Number.isInteger(value["schema"]["version"])||Number(value["schema"]["version"])<1||Number(value["schema"]["version"])>0xffffffff||typeof value["schema"]["fingerprint"]!=="string"||!/^sha256:[0-9a-f]{64}$/.test(value["schema"]["fingerprint"])||!identity(value["document"])||!decimal(value["revision"],18446744073709551615n)||!object(value["counts"])||!fields(value["counts"],["words","graphemes","unicodeScalars","utf16Units","utf8Bytes","textBlocks"])||!Array.isArray(value["outline"])||value["outline"].length>domainMaximum)throw rejected();
 const raw=value["counts"],keys=["words","graphemes","unicodeScalars","utf16Units","utf8Bytes","textBlocks"] as const;
 for(const key of keys)if(!decimal(raw[key],BigInt(key==="textBlocks"?domainMaximum:textMaximum)))throw rejected();
 const counts={words:raw["words"] as string,graphemes:raw["graphemes"] as string,unicodeScalars:raw["unicodeScalars"] as string,utf16Units:raw["utf16Units"] as string,utf8Bytes:raw["utf8Bytes"] as string,textBlocks:raw["textBlocks"] as string},n=Object.fromEntries(keys.map(key=>[key,BigInt(counts[key])])) as Record<typeof keys[number],bigint>;
 if(n.words>n.unicodeScalars||n.graphemes>n.unicodeScalars||n.utf16Units<n.unicodeScalars||n.utf16Units>2n*n.unicodeScalars||n.utf8Bytes<n.utf16Units||n.utf8Bytes>4n*n.unicodeScalars||BigInt(value["outline"].length)>n.textBlocks||n.textBlocks===0n&&n.utf8Bytes!==0n)throw rejected();
 const seen=new Set<string>();let labelBytes=0;
 const outline=value["outline"].map((entry:unknown):RichWritingHeading=>{
  if(!object(entry)||!fields(entry,["block","level","label","labelTruncated"])||!identity(entry["block"])||seen.has(entry["block"])||!Number.isInteger(entry["level"])||Number(entry["level"])<1||Number(entry["level"])>6||typeof entry["label"]!=="string"||entry["label"].length>1024||!wellFormed(entry["label"])||typeof entry["labelTruncated"]!=="boolean")throw rejected();
  const bytes=new TextEncoder().encode(entry["label"]).byteLength;if(bytes>1024)throw rejected();labelBytes+=bytes;seen.add(entry["block"]);
  return Object.freeze({block:entry["block"],level:Number(entry["level"]),label:entry["label"],labelTruncated:entry["labelTruncated"]});
 });
 if(BigInt(labelBytes)>n.utf8Bytes)throw rejected();
 return Object.freeze({format:"breditor/rich-writing-tools",formatVersion:1,schema:Object.freeze({name:value["schema"]["name"],version:Number(value["schema"]["version"]),fingerprint:value["schema"]["fingerprint"]}),document:value["document"],revision:value["revision"],counts:Object.freeze(counts),outline:Object.freeze(outline)});
}
