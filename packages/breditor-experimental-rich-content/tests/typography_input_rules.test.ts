import {describe,expect,it} from "vitest";
import {inputRuleSelection,inputRuleTypography,needsInputRuleSets,publishMarkdownInput,requireInputRules,validateMarkdownInputPolicy,TYPOGRAPHY_RULE_GROUPS,TYPOGRAPHY_DEFAULT_GROUPS,type MarkdownInputCore} from "../src/input_rule_intent.js";

const ruleSetCore=(calls:unknown[][]=[])=>({supportsMarkdownInputRules:()=>true,supportsMarkdownInputRouting:()=>true,insertPlainTextWithMarkdownRules:()=>"inserted" as const,insertTypingTextWithMarkdownRules:()=>"inserted" as const,supportsInputRuleSets:()=>true,
 insertPlainTextWithInputRules:(...args:unknown[])=>{calls.push(["plain",...args]);return "applied" as const;},
 insertTypingTextWithInputRules:(...args:unknown[])=>{calls.push(["typing",...args]);return "inserted" as const;}}) satisfies MarkdownInputCore;
const fullCore=(calls:unknown[][]=[])=>({...ruleSetCore(calls),supportsTypographyInputRules:()=>true}) satisfies MarkdownInputCore;

describe("typography-v1 browser selection",()=>{
 it("accepts the id, a configured entry or a list in canonical order",()=>{
  expect(inputRuleSelection("typography-v1")).toEqual(["typography-v1"]);
  expect(inputRuleSelection(["typography-v1","autolink-v1","markdown-v1"])).toEqual(["markdown-v1","autolink-v1","typography-v1"]);
  expect(inputRuleSelection({rule:"typography-v1",quotes:"german"})).toEqual(["typography-v1"]);
  expect(inputRuleSelection(["markdown-v1",{rule:"typography-v1",include:["quotes","ellipsis"],exclude:["quotesSecondary"]}])).toEqual(["markdown-v1","typography-v1"]);
  expect(validateMarkdownInputPolicy({rule:"typography-v1"})).toBe(true);
  expect(inputRuleTypography("typography-v1")).toBeNull();
  expect(inputRuleTypography("markdown-v1")).toBeNull();
  expect(inputRuleTypography(undefined)).toBeNull();
  const config=inputRuleTypography(["markdown-v1",{rule:"typography-v1",exclude:["misc","mathematical"],quotes:{double:["«","»"],single:["‹","›"],space:"nbsp"}}]);
  expect(config).toEqual({exclude:["misc","mathematical"],quotes:{double:["«","»"],single:["‹","›"],space:"nbsp"}});
  expect(Object.isFrozen(config)).toBe(true);expect(Object.isFrozen(config!.quotes)).toBe(true);
 });
 it("rejects unknown names, duplicates, empty selections and unsafe quotes before mounting",()=>{
  for(const bad of [
   "typography-v2",["typography-v1","typography-v1"],["typography-v1",{rule:"typography-v1"}],{rule:"markdown-v1"},{},
   {rule:"typography-v1",include:["nope"]},{rule:"typography-v1",include:"quotes"},{rule:"typography-v1",include:["quotes","quotes"]},
   {rule:"typography-v1",include:[]},{rule:"typography-v1",exclude:[...TYPOGRAPHY_DEFAULT_GROUPS]},{rule:"typography-v1",include:["quotes"],exclude:["quotesPrimary","quotesSecondary"]},
   {rule:"typography-v1",quotes:"klingon"},{rule:"typography-v1",quotes:{double:["\"","”"],single:["‘","’"]}},{rule:"typography-v1",quotes:{double:["««","»"],single:["‘","’"]}},
   {rule:"typography-v1",quotes:{double:["«","»"],single:["‹","›"],space:" "}},{rule:"typography-v1",quotes:{double:["«"],single:["‹","›"]}},{rule:"typography-v1",extra:[]},
  ])expect(()=>inputRuleSelection(bad),JSON.stringify(bad)).toThrow(TypeError);
 });
 it("mirrors the native rule table: 18 default rules and a non-default misc group",()=>{
  const all=Object.values(TYPOGRAPHY_RULE_GROUPS).flat();
  expect(new Set(all).size).toBe(24);
  expect(TYPOGRAPHY_DEFAULT_GROUPS.flatMap(g=>TYPOGRAPHY_RULE_GROUPS[g]!)).toHaveLength(18);
  expect(Object.keys(TYPOGRAPHY_RULE_GROUPS)).toEqual(["typography","quotes","symbols","mathematical","misc"]);
 });
 it("requires the typography capability only when typography is selected",()=>{
  expect(needsInputRuleSets(["typography-v1"])).toBe(true);
  expect(()=>requireInputRules("typography-v1",ruleSetCore())).toThrow("typography-v1");
  expect(requireInputRules("autolink-v1",ruleSetCore())).toEqual(["autolink-v1"]);
  expect(requireInputRules({rule:"typography-v1",quotes:"french"},fullCore())).toEqual(["typography-v1"]);
 });
 it("passes a configured typography request only when one was given",()=>{
  const calls:unknown[][]=[],core=fullCore(calls),typography=inputRuleTypography({rule:"typography-v1",quotes:"german"})!;
  expect(publishMarkdownInput(core,{text:"\"",namespace:"n",rules:["typography-v1"]},"3")).toBe("applied");
  expect(publishMarkdownInput(core,{text:"\"",namespace:"m",rules:["typography-v1"],typography},"4")).toBe("applied");
  expect(publishMarkdownInput(core,{text:"'",namespace:"o",clockMs:"9",rules:["markdown-v1","typography-v1"],typography},"5")).toBe("inserted");
  expect(calls).toEqual([["plain","\"",["typography-v1"],"n","3"],["plain","\"",["typography-v1"],"m","4",{quotes:"german"}],["typing","'","9",["markdown-v1","typography-v1"],"o","5",{quotes:"german"}]]);
 });
});
