import {describe,expect,it} from "vitest";
import {resolveInlineFormatRenderAttributes} from "@breditor/browser/presentation";
import {inputRuleSelection,needsInputRuleSets,publishMarkdownInput,requireInputRules,requireMarkdownInputRules,validateMarkdownInputPolicy,type MarkdownInputCore} from "../src/input_rule_intent.js";
import {standardInlinePropertiesV1} from "../src/standard_inline_v1.js";

const markdownCore=()=>({supportsMarkdownInputRules:()=>true,supportsMarkdownInputRouting:()=>true,insertPlainTextWithMarkdownRules:()=>"inserted" as const,insertTypingTextWithMarkdownRules:()=>"inserted" as const});
const fullCore=(calls:unknown[][]=[])=>({...markdownCore(),supportsInputRuleSets:()=>true,
 insertPlainTextWithInputRules:(...args:unknown[])=>{calls.push(["plain",...args]);return "applied" as const;},
 insertTypingTextWithInputRules:(...args:unknown[])=>{calls.push(["typing",...args]);return "refused" as const;}}) satisfies MarkdownInputCore;

describe("autolink-v1 browser selection",()=>{
 it("accepts one id or a nonempty duplicate-free list, in canonical order",()=>{
  expect(inputRuleSelection(undefined)).toBeNull();
  expect(inputRuleSelection("markdown-v1")).toEqual(["markdown-v1"]);
  expect(inputRuleSelection("autolink-v1")).toEqual(["autolink-v1"]);
  expect(inputRuleSelection(["autolink-v1","markdown-v1"])).toEqual(["markdown-v1","autolink-v1"]);
  for(const bad of ["autolink","autolink-v2",[],["autolink-v1","autolink-v1"],["markdown-v1","autolink-v1","markdown-v1"],[null],null,1,{}])expect(()=>inputRuleSelection(bad)).toThrow(TypeError);
  expect(validateMarkdownInputPolicy("autolink-v1")).toBe(true);expect(validateMarkdownInputPolicy(undefined)).toBe(false);
  expect(Object.isFrozen(inputRuleSelection("autolink-v1"))).toBe(true);
 });
 it("requires the version1 rule-set calls only when autolink is selected",()=>{
  expect(requireMarkdownInputRules("markdown-v1",markdownCore())).toBe(true);
  expect(()=>requireInputRules("autolink-v1",markdownCore())).toThrow("input rule sets");
  expect(()=>requireInputRules(["markdown-v1","autolink-v1"],{...fullCore(),insertTypingTextWithInputRules:undefined})).toThrow("input rule sets");
  expect(requireInputRules("autolink-v1",fullCore())).toEqual(["autolink-v1"]);
  expect(needsInputRuleSets(["markdown-v1"])).toBe(false);expect(needsInputRuleSets(["autolink-v1"])).toBe(true);expect(needsInputRuleSets(null)).toBe(false);
 });
 it("routes one exclusive native call with explicit rules; Markdown-only keeps the original pair",()=>{
  const calls:unknown[][]=[],core=fullCore(calls);
  expect(publishMarkdownInput(core,{text:" ",namespace:"n",rules:["autolink-v1"]},"3")).toBe("applied");
  expect(publishMarkdownInput(core,{text:" ",namespace:"m",clockMs:"9",rules:["markdown-v1","autolink-v1"]},"4")).toBe("refused");
  expect(calls).toEqual([["plain"," ",["autolink-v1"],"n","3"],["typing"," ","9",["markdown-v1","autolink-v1"],"m","4"]]);
  expect(publishMarkdownInput(core,{text:" ",namespace:"o"},"5")).toBe("inserted");expect(calls).toHaveLength(2);
 });
});

/** Every Rust-admitted autolink target is a fixed point of the same safeLinkV1 renderer policy. */
describe("autolink-v1 target policy parity with safeLinkV1",()=>{
 const policy={kind:"safeLinkV1" as const,hrefProperty:standardInlinePropertiesV1.href,openInNewWindowProperty:standardInlinePropertiesV1.newWindow};
 const href=(value:string)=>resolveInlineFormatRenderAttributes(policy,[{name:policy.hrefProperty,value},{name:policy.openInNewWindowProperty,value:false}]).find(a=>a.name==="href")?.value??null;
 it("renders admitted canonical targets byte for byte and never opens a new window",()=>{
  // Same targets as the native accept table in rich_autolink_input_rules.rs / autolink.rs.
  for(const target of ["https://example.com/","https://example.com/a?b=c#d","http://localhost:8080/x","https://www.example.com/","https://en.example.org/wiki/A_(b)","https://example.com/?q","http://localhost:3000/"]){
   expect(href(target)).toBe(target);
   expect(resolveInlineFormatRenderAttributes(policy,[{name:policy.hrefProperty,value:target},{name:policy.openInNewWindowProperty,value:false}]).some(a=>a.name==="target")).toBe(false);
  }
 });
 it("rejects the unsafe schemes the native table rejects",()=>{
  for(const target of ["javascript:alert(1)","data:text/html,x","mailto:a@example.com","ftp://example.com/","https://user:pw@example.com/","https://example.com/a\\b"])expect(href(target)).toBeNull();
 });
});
