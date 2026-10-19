/** Native packet dependency metadata. It is not a saved packet, authenticated receipt or GC permit. */
import type {RichRetainedAssetReference,RichRetainedAssetReferencesRead} from "@breditor/experimental-rich-content";
export type SharedPacketAssetIdentity=
 |Readonly<{kind:"version"|"suggestion";id:string}>
 |Readonly<{kind:"suggestion_revision";id:string;previousSuggestionId:string;suggestionId:string}>;
export type SharedPacketAssetOutcome=
 |Readonly<{kind:"ready";references:readonly RichRetainedAssetReference[]}>
 |Readonly<{kind:"pending";missing:readonly Readonly<{writer:string;counter:string}>[]}>;
export interface SharedPacketAssetReferencesRead {
 readonly format:"breditor/shared-packet-asset-references";readonly formatVersion:1;
 readonly schema:RichRetainedAssetReferencesRead["schema"];readonly document:string;readonly revision:string;
 readonly packet:SharedPacketAssetIdentity;readonly outcome:SharedPacketAssetOutcome;
}
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const fields=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const identity=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const digest=(v:unknown):v is string=>typeof v==="string"&&/^sha256:[a-f0-9]{64}$/.test(v);
const decimal=(v:unknown,min:bigint,max:bigint):v is string=>typeof v==="string"&&/^(?:0|[1-9][0-9]{0,19})$/.test(v)&&BigInt(v)>=min&&BigInt(v)<=max;
export function parseSharedPacketAssetReferences(input:string):SharedPacketAssetReferencesRead {
 const invalid=()=>new TypeError("Invalid native packet asset references");
 if(typeof input!=="string"||input.length>8*1024*1024||new TextEncoder().encode(input).byteLength>8*1024*1024)throw invalid();
 let raw:unknown;try{raw=JSON.parse(input);}catch{throw invalid();}
 if(!object(raw)||!fields(raw,["format","formatVersion","schema","document","revision","packet","outcome"])||raw["format"]!=="breditor/shared-packet-asset-references"||raw["formatVersion"]!==1||!identity(raw["document"])||!decimal(raw["revision"],0n,18446744073709551615n)||!object(raw["schema"])||!fields(raw["schema"],["name","version","fingerprint"])||typeof raw["schema"]["name"]!=="string"||raw["schema"]["name"].length>128||!/^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/.test(raw["schema"]["name"])||!Number.isInteger(raw["schema"]["version"])||Number(raw["schema"]["version"])<1||Number(raw["schema"]["version"])>0xffffffff||!digest(raw["schema"]["fingerprint"])||!object(raw["packet"])||!object(raw["outcome"]))throw invalid();
 const p=raw["packet"];let packet:SharedPacketAssetIdentity;
 if((p["kind"]==="version"||p["kind"]==="suggestion")&&fields(p,["kind","id"])&&digest(p["id"]))packet=Object.freeze({kind:p["kind"],id:p["id"]});
 else if(p["kind"]==="suggestion_revision"&&fields(p,["kind","id","previousSuggestionId","suggestionId"])&&digest(p["id"])&&digest(p["previousSuggestionId"])&&digest(p["suggestionId"])&&p["previousSuggestionId"]!==p["suggestionId"])packet=Object.freeze({kind:p["kind"],id:p["id"],previousSuggestionId:p["previousSuggestionId"],suggestionId:p["suggestionId"]});
 else throw invalid();
 const value=raw["outcome"];let outcome:SharedPacketAssetOutcome;
 if(value["kind"]==="ready"&&fields(value,["kind","references"])&&Array.isArray(value["references"])&&value["references"].length<=100000){
  let previous:RichRetainedAssetReference|undefined;const references=value["references"].map((v:unknown):RichRetainedAssetReference=>{if(!object(v)||!fields(v,["asset","generation"])||!identity(v["asset"])||!identity(v["generation"]))throw invalid();const pair={asset:v["asset"],generation:v["generation"]};if(previous&&(previous.asset>pair.asset||previous.asset===pair.asset&&previous.generation>=pair.generation))throw invalid();previous=pair;return Object.freeze(pair);});outcome=Object.freeze({kind:"ready",references:Object.freeze(references)});
 }else if(packet.kind!=="version"&&value["kind"]==="pending"&&fields(value,["kind","missing"])&&Array.isArray(value["missing"])&&value["missing"].length>0&&value["missing"].length<=1024){
  let previous=0n;const missing=value["missing"].map((v:unknown)=>{if(!object(v)||!fields(v,["writer","counter"])||!decimal(v["writer"],1n,18446744073709551614n)||!decimal(v["counter"],1n,2147483647n)||BigInt(v["writer"])<=previous)throw invalid();previous=BigInt(v["writer"]);return Object.freeze({writer:v["writer"],counter:v["counter"]});});outcome=Object.freeze({kind:"pending",missing:Object.freeze(missing)});
 }else throw invalid();
 return Object.freeze({format:"breditor/shared-packet-asset-references",formatVersion:1,schema:Object.freeze({name:raw["schema"]["name"],version:Number(raw["schema"]["version"]),fingerprint:raw["schema"]["fingerprint"]}),document:raw["document"],revision:raw["revision"],packet,outcome});
}
/** @internal Exact owner/publication provenance; parsed/copied records alone are not proofs. */
export class SharedPacketAssetReferenceRegistry {
 readonly #reads=new WeakSet<SharedPacketAssetReferencesRead>();
 retain(input:string,revision:string,kind:SharedPacketAssetIdentity["kind"],documentJson:string):SharedPacketAssetReferencesRead {
  const read=parseSharedPacketAssetReferences(input),document=JSON.parse(documentJson) as {schema:{name:string;version:number};schemaFingerprint:string;root:{properties:Record<string,unknown>}};
  if(read.revision!==revision||read.packet.kind!==kind||read.schema.name!==document.schema.name||read.schema.version!==document.schema.version||read.schema.fingerprint!==document.schemaFingerprint||read.document!==document.root.properties["breditor/document-id"])throw Error("Packet asset references belong to another source publication");
  this.#reads.add(read);return read;
 }
 check(read:SharedPacketAssetReferencesRead,revision:string):void{if(!this.#reads.has(read)||read.revision!==revision)throw Error("Use this owner's exact current packet asset reference read");}
}
