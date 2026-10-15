/** Schema-bound, callback-free presentation over the actual Rust format catalog. */
import {
 compileInlineFormatRecipes,createInlineFormatRenderManifest,resolveInlineFormatRenderAttributes,
 type BrowserProfileFormatDescriptor,type BrowserProfileFormatPropertyDescriptor,
 type BrowserProfileFormatPropertyValueType,type InlineFormatRenderAttribute,type InlineFormatRenderRecipe,
} from "@breditor/browser/presentation";
import type {FormatLiteral} from "./core.js";

export interface RichInlineSchema {readonly name:string;readonly version:number;readonly fingerprint:string}
/** This is a presentation identity, never a Rust schema proof or document authority. */
export interface RichInlinePresentation {
 readonly schema:RichInlineSchema;
 readonly recipesOuterToInner:readonly InlineFormatRenderRecipe[];
}
interface Metadata {formats:ReadonlyMap<string,BrowserProfileFormatDescriptor>}
const owned=new WeakMap<RichInlinePresentation,Metadata>();
const qualified=/^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/;
const utf8=new TextEncoder();
function requireValue(condition:unknown,message:string):asserts condition {
 if(!condition)throw new TypeError(`Rich inline presentation: ${message}`);
}
function record(value:unknown,keys:readonly string[]):Record<string,unknown>{
 requireValue(typeof value==="object"&&value!==null&&!Array.isArray(value),"invalid record");
 const result=value as Record<string,unknown>,actual=Object.keys(result);
 requireValue(actual.length===keys.length&&actual.every(key=>keys.includes(key)),"unexpected or missing field");return result;
}
function name(value:unknown):string{requireValue(typeof value==="string"&&value.length<=128&&qualified.test(value),"invalid qualified name");return value;}
function integer(value:unknown,minimum:number,maximum:number):number{requireValue(typeof value==="number"&&Number.isSafeInteger(value)&&value>=minimum&&value<=maximum,"invalid integer domain");return value;}
function domain(value:unknown):BrowserProfileFormatPropertyValueType {
 requireValue(typeof value==="object"&&value!==null,"invalid property domain");
 const kind=(value as Record<string,unknown>)["kind"];
 if(kind==="boolean"){record(value,["kind"]);return Object.freeze({kind});}
 if(kind==="integer"){
  const r=record(value,["kind","minimum","maximum"]),minimum=r["minimum"]===null?null:integer(r["minimum"],Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER),maximum=r["maximum"]===null?null:integer(r["maximum"],Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);
  requireValue(minimum===null||maximum===null||minimum<=maximum,"reversed integer domain");return Object.freeze({kind,minimum,maximum});
 }
 requireValue(kind==="string","unknown property domain");const r=record(value,["kind","minimumUtf8Bytes","maximumUtf8Bytes"]),minimumUtf8Bytes=integer(r["minimumUtf8Bytes"],0,65536),maximumUtf8Bytes=integer(r["maximumUtf8Bytes"],minimumUtf8Bytes,65536);
 return Object.freeze({kind,minimumUtf8Bytes,maximumUtf8Bytes});
}
function properties(value:unknown):readonly BrowserProfileFormatPropertyDescriptor[]{
 requireValue(Array.isArray(value)&&value.length<=32,"property catalog exceeds its bound");let previous="";
 return Object.freeze(value.map(item=>{const r=record(item,["name","presence","valueType"]),key=name(r["name"]),presence=r["presence"];
  requireValue(key>previous,"property catalog must be unique and lexically ordered");previous=key;requireValue(presence==="required"||presence==="optional","unknown property presence");
  return Object.freeze({name:key,presence,valueType:domain(r["valueType"])});
 }));
}
/**
 * Compile the complete Rust-emitted catalog and an inert render manifest.
 * Schema identity, all formats and property domains are copied and frozen.
 * Static tags, URL/color/integer policies and ordering reuse the default editor
 * implementation. No arbitrary HTML, attributes, CSS or callbacks are accepted.
 */
export function createRichInlinePresentation(catalogJson:string,manifest:unknown):RichInlinePresentation {
 requireValue(typeof catalogJson==="string"&&catalogJson.length<=2*1024*1024&&utf8.encode(catalogJson).length<=2*1024*1024,"catalog exceeds its byte bound");
 const catalog=record(JSON.parse(catalogJson) as unknown,["format","formatVersion","schema","formats"]);
 requireValue(catalog["format"]==="breditor/inline-format-catalog"&&catalog["formatVersion"]===1,"unsupported catalog format");
 const binding=record(catalog["schema"],["name","version","fingerprint"]),fingerprint=binding["fingerprint"];
 requireValue(typeof fingerprint==="string"&&/^sha256:[0-9a-f]{64}$/.test(fingerprint),"invalid schema fingerprint");
 const schema=Object.freeze({name:name(binding["name"]),version:integer(binding["version"],1,0xffffffff),fingerprint});
 const raw=catalog["formats"];requireValue(Array.isArray(raw)&&raw.length>=1&&raw.length<=256,"format catalog exceeds its bound");let previous="";
 const formats=raw.map(item=>{const r=record(item,["kind","revision","properties"]),kind=name(r["kind"]);requireValue(kind>previous,"format catalog must be unique and lexically ordered");previous=kind;
  return Object.freeze({kind,revision:integer(r["revision"],1,0xffffffff),properties:properties(r["properties"])});
 });
 const recipesOuterToInner=compileInlineFormatRecipes(formats,createInlineFormatRenderManifest(manifest));
 const presentation=Object.freeze({schema,recipesOuterToInner});owned.set(presentation,{formats:new Map(formats.map(format=>[format.kind,format]))});return presentation;
}
/** Reject forged or foreign presentations before a controller mutates its host. */
export function requireRichInlinePresentation(presentation:RichInlinePresentation,schema:RichInlineSchema):void {
 requireValue(owned.has(presentation)&&presentation.schema.name===schema.name&&presentation.schema.version===schema.version&&presentation.schema.fingerprint===schema.fingerprint,"presentation and document schema differ");
}
/** Internal immutable declaration read for versioned standard presentation checks. */
export function richInlineFormatDescriptor(presentation:RichInlinePresentation,kind:string):BrowserProfileFormatDescriptor|undefined {
 const metadata=owned.get(presentation);requireValue(metadata,"presentation identity is not owned");return metadata.formats.get(kind);
}
function validProperty(value:unknown,type:BrowserProfileFormatPropertyValueType):value is string|number|boolean {
 if(type.kind==="boolean")return typeof value==="boolean";
 if(type.kind==="integer")return typeof value==="number"&&Number.isSafeInteger(value)&&(type.minimum===null||value>=type.minimum)&&(type.maximum===null||value<=type.maximum);
 if(typeof value!=="string")return false;
 for(const scalar of value){const unit=scalar.charCodeAt(0);if(scalar.length===1&&unit>=0xd800&&unit<=0xdfff)return false;}
 const bytes=utf8.encode(value).length;return bytes>=type.minimumUtf8Bytes&&bytes<=type.maximumUtf8Bytes;
}
/** Resolve only schema-admitted literals into the shared closed attribute vocabulary. */
export function richInlineRecipes(presentation:RichInlinePresentation,literals:readonly FormatLiteral[]):readonly {recipe:InlineFormatRenderRecipe;attributes:readonly InlineFormatRenderAttribute[]}[]{
 const metadata=owned.get(presentation);requireValue(metadata,"presentation identity is not owned");
 requireValue(Array.isArray(literals)&&literals.length<=256,"invalid format literal list");const selected=new Map<string,FormatLiteral>();
 for(const literal of literals){
  const declaration=metadata.formats.get(literal.type);requireValue(declaration&&!selected.has(literal.type),"unknown or duplicate format literal");
  requireValue(typeof literal.properties==="object"&&literal.properties!==null&&!Array.isArray(literal.properties),"invalid literal properties");
  const keys=Object.keys(literal.properties);requireValue(keys.length<=32&&keys.every(key=>declaration.properties.some(property=>property.name===key)),"unknown literal property");
  for(const property of declaration.properties){const present=Object.hasOwn(literal.properties,property.name);requireValue(present||property.presence==="optional","required literal property is absent");if(present)requireValue(validProperty(literal.properties[property.name],property.valueType),"literal property is outside its declared domain");}
  selected.set(literal.type,literal);
 }
 return presentation.recipesOuterToInner.filter(recipe=>selected.has(recipe.formatKind)).map(recipe=>{
  const literal=selected.get(recipe.formatKind)!;
  const properties=Object.entries(literal.properties).map(([name,value])=>{requireValue(typeof value==="string"||typeof value==="boolean"||typeof value==="number","literal value is not scalar");return {name,value};});
  return {recipe,attributes:recipe.attributes?resolveInlineFormatRenderAttributes(recipe.attributes,properties):[]};
 });
}
