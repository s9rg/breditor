import {describe,expect,it} from "vitest";
import {
 createInlineFormatRenderAttributePolicy as create,
 inlineFormatRenderAttributePolicyMatchesFormatDescriptor as matches,
 inlineFormatRenderAttributesAreCanonicalForPolicy as canonical,
 resolveInlineFormatRenderAttributes as resolve,
 type InlineFormatRenderAttributePolicy,
} from "./inline_format_render_attributes.js";
import {createInlineFormatRenderManifest as manifest} from "./inline_format_render_manifest.js";
import {compileInlineFormatRecipes} from "./compiled_browser_presentation.js";
import type {BrowserProfileFormatDescriptor} from "./wasm_profile_descriptor.js";

const text=create({kind:"safeRgb24V1",propertyName:"example/value",channel:"text"});
const background=create({kind:"safeRgb24V1",propertyName:"example/value",channel:"background"});
const size=create({kind:"safeTextSizeV1",propertyName:"example/value"});
const properties=(value:unknown)=>[{name:"example/value",value}] as Parameters<typeof resolve>[1];
const descriptor=(minimum:number,maximum:number):BrowserProfileFormatDescriptor=>({kind:"example/format",revision:1,properties:[{name:"example/value",presence:"required",valueType:{kind:"integer",minimum,maximum}}]});

describe("closed scalar style policies",()=>{
 it("detaches exact inert declarations without inspecting accessors",()=>{
  const source={kind:"safeRgb24V1",propertyName:"example/value",channel:"background"};const policy=create(source);source.channel="text";
  expect(policy).toEqual({kind:"safeRgb24V1",propertyName:"example/value",channel:"background"});expect(Object.isFrozen(policy)).toBe(true);
  let calls=0;const accessor={kind:"safeTextSizeV1",get propertyName(){calls++;return "example/value";}};
  expect(()=>create(accessor)).toThrow();expect(calls).toBe(0);
  for(const invalid of [{kind:"safeRgb24V1",propertyName:"example/value",channel:"border"},{kind:"safeRgb24V1",propertyName:"example/value",channel:"text",style:"color:red"},{kind:"safeTextSizeV1",propertyName:"example/value",unit:"px"},{kind:"safeTextSizeV1",propertyName:"value"}])expect(()=>create(invalid)).toThrow();
 });
 it("requires the exact required integer domain and no extra semantic properties",()=>{
  expect(matches(text,descriptor(0,0xffffff))).toBe(true);expect(matches(background,descriptor(0,0xffffff))).toBe(true);expect(matches(size,descriptor(8,96))).toBe(true);
  for(const policy of [text,background,size]){
   const valid=policy===size?descriptor(8,96):descriptor(0,0xffffff);
   const property=valid.properties[0]!;
   const invalids:BrowserProfileFormatDescriptor[]=[{...valid,revision:0},{...valid,kind:"wrong"},{...valid,properties:[{...property,presence:"optional"}]},{...valid,properties:[property,property]},{...valid,properties:[{...property,valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:6}}]}];
   for(const invalid of invalids)expect(matches(policy,invalid)).toBe(false);
  }
  expect(matches(size,descriptor(7,96))).toBe(false);expect(matches(size,descriptor(8,97))).toBe(false);expect(matches(text,descriptor(0,0x1000000))).toBe(false);
 });
 it("emits only fixed lowercase RGB24 styles for both channels",()=>{
  for(const [value,hex]of [[0,"000000"],[0x336699,"336699"],[0xffffff,"ffffff"]] as const){
   expect(resolve(text,properties(value))).toEqual([{name:"style",value:`color:#${hex}`}]);
   expect(resolve(background,properties(value))).toEqual([{name:"style",value:`background-color:#${hex}`}]);
   for(const policy of [text,background]){const output=resolve(policy,properties(value));expect(canonical(policy,output)).toBe(true);expect(Object.isFrozen(output)&&Object.isFrozen(output[0])).toBe(true);}
  }
 });
 it("supports every admitted pixel value without a token-count workaround",()=>{
  for(let value=8;value<=96;value++){
   const output=resolve(size,properties(value));expect(output).toEqual([{name:"style",value:`font-size:${value}px`}]);expect(canonical(size,output)).toBe(true);
  }
 });
 it("rejects malformed projected values rather than interpreting CSS text",()=>{
  for(const policy of [text,background,size])for(const value of [-0,NaN,Infinity,-1,1.5,"16","16px","url(test)",null,{},true])expect(resolve(policy,properties(value))).toEqual([]);
  for(const value of [7,97])expect(resolve(size,properties(value))).toEqual([]);
  expect(resolve(text,properties(0x1000000))).toEqual([]);
  expect(resolve(text,[])).toEqual([]);expect(resolve(size,[...properties(16),...properties(16)])).toEqual([]);
 });
 it("admits only the exact inverse style output for its own policy",()=>{
  for(const value of ["font-size:08px","font-size:8.0px","font-size:8PX","font-size:7px","font-size:97px","font-size:16px;"," font-size:16px","font-size:var(--size)","font-size:16px;color:red"])
   expect(canonical(size,[{name:"style",value}])).toBe(false);
  for(const value of ["color:#ABCDEF","color:#abc","color: #abcdef","color:#abcdef;","color:#abcdef;background:red","background-color:#abcdef"])
   expect(canonical(text,[{name:"style",value}])).toBe(false);
  expect(canonical(background,[{name:"style",value:"color:#abcdef"}])).toBe(false);
  expect(canonical(size,[])).toBe(false);expect(canonical(size,[{name:"class",value:"font-size:16px"}])).toBe(false);
 });
 it("requires a canonical span/class and retains the old V1 exact color binding",()=>{
  for(const [policy,classes,minimum,maximum]of [[text,["breditor-inline-text-color"],0,0xffffff],[background,["breditor-inline-background-color"],0,0xffffff],[size,["breditor-inline-text-size"],8,96]] as const){
   const recipe={formatKind:"example/format",element:"span",classes,attributes:policy};
   expect(compileInlineFormatRecipes([descriptor(minimum,maximum)],manifest({recipes:[recipe]}))).toHaveLength(1);
   for(const bad of [{...recipe,element:"em"},{...recipe,classes:["other"]},{...recipe,classes:[...classes,"other"]},{...recipe,formatKind:"example/text-color"},{...recipe,classes:["breditor-text-color"]}])expect(()=>manifest({recipes:[bad]})).toThrow();
  }
 });
 it("does not invoke getters through direct forged policies or descriptors",()=>{
  let calls=0;const policy={kind:"safeTextSizeV1",get propertyName(){calls++;return "example/value";}} as InlineFormatRenderAttributePolicy;
  expect(resolve(policy,properties(16))).toEqual([]);expect(matches(policy,descriptor(8,96))).toBe(false);expect(canonical(policy,[{name:"style",value:"font-size:16px"}])).toBe(false);
  const d={kind:"example/format",revision:1,get properties(){calls++;return descriptor(8,96).properties;}};
  expect(matches(size,d)).toBe(false);expect(calls).toBe(0);
 });
});
