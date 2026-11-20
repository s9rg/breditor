import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createRichInterchange,interchangeContractV1,type InterchangeImportOptions,type InterchangeOwner} from "../src/index.js";
import {autolinkCandidate,autolinkOpeners,autolinkTrailing} from "../src/autolink.js";
/** Parser-unit staging owner (`v4` adds every candidate V4 capability). Native admission is covered elsewhere. */
function staging(v4=false){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},
  ...(v4?{supportsListNumbering:()=>true,supportsTextLanguage:()=>true,supportsImageLinks:()=>true,supportsDetails:()=>true,supportsMentions:()=>true,supportsTableCaptions:()=>true,supportsPageBreaks:()=>true}:{})};
 return createRichInterchange(owner);
}
type Result=ReturnType<ReturnType<typeof staging>["importMarkdown"]>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function root(value:Result):any{if(!value.ok)throw Error(value.error);return JSON.parse(value.value.structuredJson).document.root;}
function json(value:Result):string{if(!value.ok)throw Error(value.error);return value.value.structuredJson;}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runs=(n:any):any[]=>n.kind==="text"?[n]:n.children.flatMap(runs);
/** Text runs as `text` or `[text](href)` for linked runs, joined; other formats are named in braces. */
const shape=(value:Result)=>runs(root(value)).map(r=>{
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const link=r.formats.find((f:any)=>f.type==="breditor-inline/link"),other=r.formats.filter((f:any)=>f!==link).map((f:any)=>f.type.replace(/^breditor(-inline)?\//,""));
 const body=link?`[${r.text}](${link.properties["breditor-inline/href"]})`:r.text;return other.length?`{${other.join("+")}:${body}}`:body;
}).join("");
const on:InterchangeImportOptions={autolinks:true};
describe("autolink-v1 candidate mirror",()=>{
 it("uses the Rust rule's exact opener and trailing punctuation sets",()=>{
  const rust=readFileSync(new URL("../../../crates/breditor-core/src/rich_content/input_rules/autolink.rs",import.meta.url),"utf8");
  const chars=(name:string)=>[...new RegExp(`const ${name}: &\\[char\\] = &\\[([^\\]]*)\\];`).exec(rust)![1]!.matchAll(/'(\\'|[^'])'/g)].map(m=>m[1]==="\\'"?"'":m[1]!).sort();
  expect(chars("OPENERS")).toEqual([...autolinkOpeners].sort());expect(chars("TRAILING")).toEqual([...autolinkTrailing].sort());
 });
 it("accepts and rejects the Rust unit vectors identically",()=>{
  const linked=(text:string)=>{const c=autolinkCandidate(text);return c&&[text.slice(c.start,c.end),c.href];};
  for(const [text,run,href] of [
   ["https://example.com","https://example.com","https://example.com/"],
   ["see https://example.com/a?b=c#d","https://example.com/a?b=c#d","https://example.com/a?b=c#d"],
   ["http://localhost:8080/x","http://localhost:8080/x","http://localhost:8080/x"],
   ["www.example.com","www.example.com","https://www.example.com/"],
   ["https://example.com.","https://example.com","https://example.com/"],
   ["https://example.com/a,","https://example.com/a","https://example.com/a"],
   ["(https://example.com)","https://example.com","https://example.com/"],
   ["https://en.example.org/wiki/A_(b)","https://en.example.org/wiki/A_(b)","https://en.example.org/wiki/A_(b)"],
   ["https://en.example.org/wiki/A_(b)).","https://en.example.org/wiki/A_(b)","https://en.example.org/wiki/A_(b)"],
   ["<https://example.com/>","https://example.com/","https://example.com/"],
   ["\"https://example.com/\"!?","https://example.com/","https://example.com/"],
   ["猫 https://example.com","https://example.com","https://example.com/"],
   ["https://example.com?q","https://example.com?q","https://example.com/?q"],
  ] as [string,string,string][])expect(linked(text),text).toEqual([run,href]);
  for(const text of ["","example.com","javascript:alert(1)","data:text/html,x","mailto:a@example.com","ftp://example.com/","xhttps://example.com","HTTPS://example.com/","https://Example.com/","https://user:pw@example.com/","https://example.com:443/","https://example.com/ü","https://例え.jp/","https://example.com/a\\b","https://example.com/a<b","https://","https://.","www.","www..","https://example.com/ www.","http:///example.com","https://example.com/%zz","https://example.com/a/../b",`https://example.com/${"a".repeat(2048)}`])
   expect(linked(text),text).toBeNull();
 });
});
describe("Markdown GFM autolink literals (opt-in autolinks)",()=>{
 const source="See https://example.com/a?b=c#d, www.example.org and http://localhost:8080/x.";
 it("keeps the version-one dialect by default: literals stay text, identically with autolinks:false",()=>{
  for(const v4 of [false,true]){
   const adapter=staging(v4),plain=adapter.importMarkdown(source);
   expect(shape(plain)).toBe(source);expect(plain.losses).toEqual([]);
   expect(json(adapter.importMarkdown(source,{autolinks:false}))).toBe(json(plain));
   expect(json(adapter.importMarkdown(source,{kind:"auto"}))).toBe(json(plain));
  }
  expect(interchangeContractV1.markdown).toBe("commonmark-tables-strike-tasks-and-sanitized-html-v1");
  expect(interchangeContractV1.markdownAutolinks).toBe("opt-in-gfm-autolink-literals-autolink-v1");
 });
 it("links admitted literals with the autolink-v1 target and leaves trailing punctuation as text, for every owner profile",()=>{
  for(const v4 of [false,true]){
   const value=staging(v4).importMarkdown(source,on);
   expect(shape(value)).toBe("See [https://example.com/a?b=c#d](https://example.com/a?b=c#d), [www.example.org](https://www.example.org/) and [http://localhost:8080/x](http://localhost:8080/x).");
   expect(value.losses).toEqual([]);
   const link=runs(root(value)).find(r=>r.formats.length)!.formats[0];expect(link).toEqual({type:"breditor-inline/link",properties:{"breditor-inline/href":"https://example.com/a?b=c#d","breditor-inline/new-window":false}});
  }
 });
 it("applies the same opener, bracket and punctuation rules as typed autolinks",()=>{
  const a=staging();
  expect(shape(a.importMarkdown("(https://en.example.org/wiki/A_(b)).",on))).toBe("([https://en.example.org/wiki/A_(b)](https://en.example.org/wiki/A_(b))).");
  expect(shape(a.importMarkdown("\"https://example.com/\"!? 'www.example.com'",on))).toBe("\"[https://example.com/](https://example.com/)\"!? '[www.example.com](https://www.example.com/)'");
  expect(shape(a.importMarkdown("[https://example.com] {https://example.com/x}",on))).toBe("[[https://example.com](https://example.com/)] {[https://example.com/x](https://example.com/x)}");
  expect(shape(a.importMarkdown("https://example.com?q, https://example.com/a;",on))).toBe("[https://example.com?q](https://example.com/?q), [https://example.com/a](https://example.com/a);");
  expect(shape(a.importMarkdown("猫 https://example.com 犬",on))).toBe("猫 [https://example.com](https://example.com/) 犬");
 });
 it("keeps unsafe, non-canonical and incomplete candidates literal without a notice",()=>{
  const a=staging();
  for(const text of ["javascript:alert(1)","data:text/html,x","mailto:a@example.com","ftp://example.com/","xhttps://example.com","foo.www.example.com","HTTPS://example.com/","https://Example.com/","https://user:pw@example.com/","https://example.com:443/","https://example.com/ü","https://例え.jp/","https://example.com/%zz","https://example.com/a/../b","https://","www.","https://example.com/?a'b",`https://example.com/${"a".repeat(2048)}`]){
   const value=a.importMarkdown(`x ${text} y`,on);expect(shape(value),text).toBe(`x ${text} y`);expect(value.losses,text).toEqual([]);
  }
 });
 it("never links inside code spans, code blocks, existing links, autolinks, images or raw <a>/<code> HTML",()=>{
  const a=staging();
  expect(shape(a.importMarkdown("`https://example.com/` and ``www.example.com``",on))).toBe("{code:https://example.com/} and {code:www.example.com}");
  for(const block of ["```\nhttps://example.com/\n```","    https://example.com/"]){
   const value=root(a.importMarkdown(block,on));expect(value.children[0].type).toBe("breditor/code-block");expect(runs(value).every(r=>!r.formats.length)).toBe(true);
  }
  expect(shape(a.importMarkdown("[see https://other.example/](https://example.com/)",on))).toBe("[see https://other.example/](https://example.com/)");
  expect(shape(a.importMarkdown("<https://example.com/x>",on))).toBe("[https://example.com/x](https://example.com/x)");
  expect(shape(a.importMarkdown('<a href="https://example.com/">go https://other.example/</a> after https://b.example/',on))).toBe("[go https://other.example/](https://example.com/) after [https://b.example/](https://b.example/)");
  expect(shape(a.importMarkdown("<code>https://example.com/</code> https://b.example/",on))).toBe("{code:https://example.com/} [https://b.example/](https://b.example/)");
  const image=a.importMarkdown("![https://example.com/](https://cdn.example/x.png)",on);expect(runs(root(image)).every(r=>!r.formats.length)).toBe(true);
 });
 it("treats backslash escapes and entities as part of the literal, which then stays text",()=>{
  const a=staging();
  for(const text of ["https://example\\.com","https\\://example.com","www\\.example.com","https://example.com/a&amp;b","https://example.com\\."]){
   const value=a.importMarkdown(text,on);expect(runs(root(value)).every(r=>!r.formats.length),text).toBe(true);
  }
 });
 it("links literals in headings, emphasis, tables, lists and task items",()=>{
  const a=staging();
  expect(shape(a.importMarkdown("# Docs at https://example.com/docs",on))).toBe("Docs at [https://example.com/docs](https://example.com/docs)");
  expect(shape(a.importMarkdown("*https://example.com/* **www.example.com** ~~http://example.com/~~",on))).toBe("{italic:[https://example.com/](https://example.com/)} {strong:[www.example.com](https://www.example.com/)} {strike:[http://example.com/](http://example.com/)}");
  expect(shape(a.importMarkdown("| a | b |\n| - | - |\n| https://example.com/ | x |",on))).toBe("ab[https://example.com/](https://example.com/)x");
  const task=root(a.importMarkdown("- [ ] https://example.com/\n- [x] read www.example.com",on));
  expect(task.children[0].type).toBe("breditor/task-list");expect(task.children[0].children.map((i:{properties:Record<string,unknown>})=>i.properties["breditor/checked"])).toEqual([false,true]);
  expect(shape(a.importMarkdown("- [ ] https://example.com/\n- [x] read www.example.com",on))).toBe("[https://example.com/](https://example.com/)read [www.example.com](https://www.example.com/)");
 });
 it("rejects a non-boolean option and keeps the token budget",()=>{
  const a=staging();
  for(const value of ["yes",1,null,{}])expect(a.importMarkdown("https://example.com/",{autolinks:value} as unknown as InterchangeImportOptions)).toEqual({ok:false,error:"unsupported-content",losses:[]});
  // importHtml has no literal linking: the option is ignored there.
  expect(shape(a.importHtml("<p>https://example.com/</p>",on))).toBe("https://example.com/");
  const many="www.a.co ".repeat(12000);
  expect(a.importMarkdown(many).ok).toBe(true);expect(a.importMarkdown(many,on)).toMatchObject({ok:false,error:"resource-limit"});
 });
 it("round trips linked literals and literal URL text exactly through Markdown export",()=>{
  for(const v4 of [false,true]){
   const a=staging(v4);
   for(const md of ["https://example.com/","x https://example.com/a?b=1&c=2 y","see www.example.com,","(https://en.example.org/wiki/A_(b)).","*https://example.com/*","- [ ] https://example.com/\n- [x] www.example.com"]){
    const first=a.importMarkdown(md,on),exported=a.exportMarkdown(json(first));if(!exported.ok)throw Error(exported.error);
    for(const options of [on,{}])expect(json(a.importMarkdown(exported.value,options)),`${md} -> ${exported.value}`).toBe(json(first));
   }
   // Literal URL text exported from a document stays literal when reimported with autolinks.
   for(const md of ["https://example.com/ and http://localhost/x","www.example.com","a https://example.com/ b"]){
    const literal=a.importMarkdown(md),exported=a.exportMarkdown(json(literal));if(!exported.ok)throw Error(exported.error);
    expect(json(a.importMarkdown(exported.value,on)),exported.value).toBe(json(literal));expect(json(a.importMarkdown(exported.value)),exported.value).toBe(json(literal));
   }
  }
 });
 it("exports a link whose text is its exact target as <url> only when that re-parses exactly",()=>{
  const a=staging();
  const exported=(md:string)=>{const value=a.exportMarkdown(json(a.importMarkdown(md,on)));if(!value.ok)throw Error(value.error);return value;};
  expect(exported("https://example.com/").value).toBe("<https://example.com/>");
  expect(exported("- [ ] https://example.com/a?b=1&c=2").value).toBe("- [ ] <https://example.com/a?b=1&c=2>");
  expect(exported("**https://example.com/**").value).toBe("**<https://example.com/>**");
  // Text differing from the target (typed-autolink repair) keeps the bracket form.
  expect(exported("https://example.com").value).toBe("[https\\://example\\.com](<https://example.com/>)");
  expect(exported("www.example.com").value).toBe("[www\\.example\\.com](<https://www.example.com/>)");
  // CommonMark would show percent escapes decoded and xn-- hosts as Unicode in `<url>` text.
  expect(exported("https://example.com/a%20b").value).toBe("[https\\://example\\.com/a%20b](<https://example.com/a%20b>)");
  expect(exported("https://xn--bcher-kva.de/").value).toBe("[https\\://xn--bcher-kva\\.de/](<https://xn--bcher-kva.de/>)");
  expect(a.exportMarkdown(json(a.importMarkdown("<https://example.com/>"))).ok&&exported("<https://example.com/>").value).toBe("<https://example.com/>");
 });
});
