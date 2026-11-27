import {describe,it,expect,vi} from "vitest";
import {detectMarkdownPaste,markdownPasteDetectorV1} from "../../breditor-experimental-rich-content/src/markdown_paste_detection.js";
import {readClipboardInput,RICH_CLIPBOARD_MIME,type RichClipboardInterchange} from "../../breditor-experimental-rich-content/src/clipboard_interchange.js";
import {requireMarkdownPaste,isPastePlainChord} from "../../breditor-experimental-rich-content/src/markdown_paste.js";
import corpusJson from "./fixtures/markdown-paste-corpus.json";

interface Sample {readonly id:string;readonly text:string;readonly signals?:readonly string[];readonly veto?:string}
const corpus=corpusJson as {detector:string;positive:Sample[];negative:Sample[]};
const transfer={format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:"flow",structuredJson:'{"kind":"flow"}',plainText:"native text"} as const;
function adapter(ok=true):RichClipboardInterchange{return{importHtml:vi.fn(()=>({ok:true,value:transfer,losses:[]})),importMarkdown:vi.fn(()=>ok?{ok:true,value:transfer,losses:[]}:{ok:false,error:"budget",losses:[]}),exportHtml:vi.fn(),exportMarkdown:vi.fn()} as unknown as RichClipboardInterchange;}
function data(values:Record<string,string>):DataTransfer{const map=new Map(Object.entries(values));return{get types(){return [...map.keys()];},getData:vi.fn((type:string)=>map.get(type)??""),setData:vi.fn()} as unknown as DataTransfer;}

describe("markdown-paste-detect-v1 corpus",()=>{
 it("is the documented detector version",()=>{expect(corpus.detector).toBe(markdownPasteDetectorV1);});
 for(const sample of corpus.positive)it(`detects ${sample.id}`,()=>{
  const result=detectMarkdownPaste(sample.text);
  expect(result.markdown,JSON.stringify(result)).toBe(true);
  expect(result.score).toBeGreaterThanOrEqual(4);
  expect([...result.signals].sort()).toEqual([...sample.signals!].sort());
 });
 for(const sample of corpus.negative)it(`keeps ${sample.id} literal`,()=>{
  const result=detectMarkdownPaste(sample.text);
  expect(result.markdown,JSON.stringify(result)).toBe(false);
  if(sample.veto)expect(result.veto).toBe(sample.veto);
 });
});

describe("detector contract",()=>{
 it("is deterministic and returns frozen results",()=>{
  const text=corpus.positive[1]!.text,a=detectMarkdownPaste(text),b=detectMarkdownPaste(text);
  expect(a).toEqual(b);expect(Object.isFrozen(a)).toBe(true);expect(Object.isFrozen(a.signals)).toBe(true);
 });
 it("vetoes oversized input before scanning",()=>{
  expect(detectMarkdownPaste(`# Big\n\n${"- item\n".repeat(40000)}`)).toMatchObject({markdown:false,veto:"too-large"});
 });
 it("vetoes code-like bodies even with Markdown-looking lines",()=>{
  expect(detectMarkdownPaste("# Setup\n\nimport os\nimport sys\nfrom x import y\n- a\n- b")).toMatchObject({markdown:false,veto:"code"});
 });
 it("masks fenced content from other signals",()=>{
  const result=detectMarkdownPaste("```\n# not a heading\n- not\n- a list\n```\nplain");
  expect(result.signals).toEqual(["fence"]);expect(result.markdown).toBe(false);
 });
 it("needs two kinds unless the only kind is a table or task list",()=>{
  expect(detectMarkdownPaste("# One\n\n# Two\n\n# Three").markdown).toBe(false);
  expect(detectMarkdownPaste("- a\n- b\n\n- c\n- d").markdown).toBe(false);
  expect(detectMarkdownPaste("a | b\n--- | ---").markdown).toBe(true);
 });
 it("refuses a non-string",()=>{expect(()=>detectMarkdownPaste(1 as never)).toThrow(TypeError);});
});

describe("opt-in text/plain routing",()=>{
 const markdown="## Release notes\n\n- First item\n- Second item";
 it("stays literal by default and without the option",()=>{
  const a=adapter();
  expect(readClipboardInput(data({"text/plain":markdown}),a,false)).toEqual({fragment:"",plain:markdown,formats:[]});
  expect(readClipboardInput(data({"text/plain":markdown}),a,false,"default")).toEqual({fragment:"",plain:markdown,formats:[]});
  expect(a.importMarkdown).not.toHaveBeenCalled();
 });
 it("converts detected plain-only text through the explicit Markdown import",()=>{
  const a=adapter(),input=readClipboardInput(data({"text/plain":markdown}),a,false,"detect");
  expect(a.importMarkdown).toHaveBeenCalledWith(markdown,{kind:"auto"});
  expect(input.fragment).toBe(transfer.structuredJson);expect(input.formats).toEqual([{kind:"markdown",losses:[]}]);
  expect(input.markdownPaste).toMatchObject({plain:markdown,detection:{markdown:true,signals:["heading","bullet-list"]}});
 });
 it("applies only when there is no HTML, Markdown or private flavor",()=>{
  for(const extra of [{"text/html":"<p>x</p>"},{"text/markdown":"# x"},{[RICH_CLIPBOARD_MIME]:"native"}]){
   const a=adapter(),input=readClipboardInput(data({...extra,"text/plain":markdown}),a,false,"detect");
   expect(input.markdownPaste).toBeUndefined();
  }
 });
 it("keeps undetected text, grid targets and rejected imports literal",()=>{
  const a=adapter();
  expect(readClipboardInput(data({"text/plain":"just prose\nmore prose"}),a,false,"detect")).toEqual({fragment:"",plain:"just prose\nmore prose",formats:[]});
  expect(a.importMarkdown).not.toHaveBeenCalled();
  expect(readClipboardInput(data({"text/plain":markdown}),a,true,"detect").plain).toBe(markdown);
  expect(a.importMarkdown).not.toHaveBeenCalled();
  const rejecting=adapter(false);
  expect(readClipboardInput(data({"text/plain":markdown}),rejecting,false,"detect")).toEqual({fragment:"",plain:markdown,formats:[]});
 });
 it("pastes only text/plain for the one-shot literal escape",()=>{
  const a=adapter(),input=readClipboardInput(data({[RICH_CLIPBOARD_MIME]:"native","text/html":"<b>x</b>","text/plain":markdown}),a,false,"literal");
  expect(input).toEqual({fragment:"",plain:markdown,formats:[]});expect(a.importHtml).not.toHaveBeenCalled();expect(a.importMarkdown).not.toHaveBeenCalled();
 });
 it("requires the explicit interchange port to enable detection",()=>{
  expect(requireMarkdownPaste(undefined,undefined)).toBe(false);expect(requireMarkdownPaste("literal",undefined)).toBe(false);
  expect(()=>requireMarkdownPaste("detect",undefined)).toThrow(/clipboardInterchange/);
  expect(requireMarkdownPaste("detect",adapter())).toBe(true);
  expect(()=>requireMarkdownPaste("markdown" as never,adapter())).toThrow(TypeError);
 });
 it("recognizes only the primary+Shift+V chord as the plain-text escape",()=>{
  const key=(init:Partial<KeyboardEvent>)=>({key:"V",ctrlKey:false,metaKey:false,shiftKey:true,altKey:false,...init}) as KeyboardEvent;
  expect(isPastePlainChord(key({ctrlKey:true}))).toBe(true);expect(isPastePlainChord(key({metaKey:true,key:"v"}))).toBe(true);
  expect(isPastePlainChord(key({}))).toBe(false);expect(isPastePlainChord(key({ctrlKey:true,shiftKey:false,key:"v"}))).toBe(false);
  expect(isPastePlainChord(key({ctrlKey:true,altKey:true}))).toBe(false);
 });
});
