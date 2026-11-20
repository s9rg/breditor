// @vitest-environment jsdom
import {describe,expect,it,vi} from "vitest";
import {compileStandardRichProfileV4} from "../index.js";
import {richTriggerCompositeKinds} from "../src/slash_command_session.js";
import type {RichCommand,RichWasmModule} from "../src/core.js";

const fingerprint=`sha256:${"ab".repeat(32)}`;
/** Mocked Wasm owner: only the capability probe and the command boundary matter here. */
function local(composite:unknown){
 const observation={revision:"1",blockLayoutStateJson:vi.fn(),free:vi.fn()};
 const editor:Record<string,unknown>={observe:()=>observation,blockLayoutVersion:()=>"1",listNumberingVersion:()=>"1",textLanguageVersion:()=>"1",imageLinkVersion:()=>"1",detailsVersion:()=>"1",mentionVersion:()=>"1",tableCaptionVersion:()=>"1",execute:vi.fn(()=>({status:"content",takeObservation:()=>observation,free:vi.fn()})),free:vi.fn()};
 if(composite!==undefined)editor["triggerCompositeVersion"]=()=>composite;
 const descriptor={kind:"rich",abiVersion:1,schema:{name:"t",version:1},schemaFingerprint:fingerprint,richLanguageVersion:4,taskStructureVersion:1,blockLayoutVersion:1,listNumberingVersion:1,textLanguageVersion:1,imageLinkVersion:1,detailsVersion:1,mentionVersion:1,tableCaptionVersion:1};
 const raw={descriptorJson:()=>({status:"value",takeValue:()=>JSON.stringify(descriptor),free:vi.fn()}),createEditor:()=>({status:"editor",takeEditor:()=>editor,free:vi.fn()}),free:vi.fn()};
 const factory=vi.fn(()=>({status:"profile",takeProfile:()=>raw,free:vi.fn()}));
 return {wasm:{BreditorRichProfile:{fromBootstrapJsonV4:factory,fromStandardBootstrapJsonV4:factory}} as unknown as RichWasmModule,editor};
}

describe("native slash composite boundary (replaceTriggerThen)",()=>{
 it("probes triggerCompositeVersion 1 only; older modules report no capability",()=>{
  for(const [value,expected] of [["1",true],["0",false],[undefined,false],[1,false]] as const){
   const a=local(value),core=compileStandardRichProfileV4(a.wasm,"bootstrap").createEditor("document");
   expect(core.supportsTriggerComposite?.()).toBe(expected);
  }
 });
 it("passes the composite and its nested command to the native owner unchanged",()=>{
  const a=local("1"),core=compileStandardRichProfileV4(a.wasm,"bootstrap").createEditor("document");
  const selection={kind:"text" as const,anchor:{block:"p",offset:"6",affinity:"after" as const},focus:{block:"p",offset:"10",affinity:"after" as const}};
  const command:RichCommand={kind:"replaceTriggerThen",data:{selection,command:{kind:"wrapBlockquote",data:{first:"p",last:"p",wrapper:"quote"}}}};
  expect(core.execute(command)).toBe("content");
  const execute=a.editor["execute"] as ReturnType<typeof vi.fn>;
  expect(JSON.parse(execute.mock.calls[0]![1] as string)).toEqual(command);
 });
 it("mirrors the Rust allowlist exactly",()=>{
  expect([...richTriggerCompositeKinds]).toEqual(["setHeading","setCodeBlock","wrapList","setListKind","wrapTaskList","wrapBlockquote","wrapDetails","insertHorizontalRule","insertTable","insertBlocks"]);
  expect(Object.isFrozen(richTriggerCompositeKinds)).toBe(true);
 });
});
