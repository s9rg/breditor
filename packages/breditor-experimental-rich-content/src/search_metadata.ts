/** Strict bounded immutable native metadata. Parsing this value never creates native authority. */
import type {RichSearchMetadata} from "./core.js";
const maximum=4*1024*1024;
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const fields=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const decimal=(v:unknown):v is string=>typeof v==="string"&&/^(?:0|[1-9][0-9]{0,15})$/.test(v)&&BigInt(v)<=9007199254740991n;
const text=(v:unknown):v is string=>typeof v==="string"&&v.length>0;
const fingerprint=(v:unknown):v is string=>typeof v==="string"&&/^sha256:[0-9a-f]{64}$/.test(v);
export function parseRichSearchMetadata(input:string):RichSearchMetadata {
 const rejected=()=>new TypeError("Invalid native search metadata");
 if(typeof input!=="string"||input.length>maximum||new TextEncoder().encode(input).byteLength>maximum)throw rejected();
 let value:unknown;try{value=JSON.parse(input);}catch{throw rejected();}
 if(!object(value)||!fields(value,["format","formatVersion","schema","document","count","captureCount","matches"])||value["format"]!=="breditor/rich-search-results"||value["formatVersion"]!==1||!object(value["schema"])||!fields(value["schema"],["name","version","fingerprint"])||!text(value["schema"]["name"])||!Number.isInteger(value["schema"]["version"])||Number(value["schema"]["version"])<1||Number(value["schema"]["version"])>0xffffffff||!fingerprint(value["schema"]["fingerprint"])||!text(value["document"])||!decimal(value["count"])||Number(value["count"])>4096||!decimal(value["captureCount"])||Number(value["captureCount"])<1||Number(value["captureCount"])>65||!Array.isArray(value["matches"])||value["matches"].length!==Number(value["count"]))throw rejected();
 const matches=value["matches"].map((match:unknown)=>{
  if(!object(match)||!fields(match,["block","start","end"])||!text(match["block"])||!decimal(match["start"])||!decimal(match["end"])||BigInt(match["start"])>BigInt(match["end"]))throw rejected();
  return Object.freeze({block:match["block"],start:match["start"],end:match["end"]});
 });
 return Object.freeze({format:"breditor/rich-search-results",formatVersion:1,schema:Object.freeze({name:value["schema"]["name"],version:Number(value["schema"]["version"]),fingerprint:value["schema"]["fingerprint"]}),document:value["document"],count:value["count"],captureCount:value["captureCount"],matches:Object.freeze(matches)});
}
