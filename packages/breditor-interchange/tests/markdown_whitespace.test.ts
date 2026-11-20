import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
/** Parser-unit staging stub only. Native admission is covered elsewhere. */
function staging(){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};}};
 return createRichInterchange(owner);
}
type Result=ReturnType<ReturnType<typeof staging>["importMarkdown"]>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function root(value:Result):any{if(!value.ok)throw Error(value.error);return JSON.parse(value.value.structuredJson).document.root;}
function json(value:Result):string{if(!value.ok)throw Error(value.error);return value.value.structuredJson;}
/** A run is its text then short format names: `strong`, `italic`, `strike`, `code`, `link:<href>`. */
type Run=[string,...string[]];
const formatTypes:Record<string,string>={strong:"breditor/strong",italic:"breditor-inline/italic",strike:"breditor-inline/strike",code:"breditor-inline/code"};
const format=(name:string)=>name.startsWith("link:")?{type:"breditor-inline/link",properties:{"breditor-inline/href":name.slice(5),"breditor-inline/new-window":false}}:{type:formatTypes[name]!,properties:{}};
const block=(runs:Run[],level?:number)=>({kind:"element",type:level?"breditor/heading":"breditor/paragraph",entityId:null,properties:level?{"breditor/block-id":"b","breditor/level":level}:{"breditor/block-id":"b"},children:runs.map(([text,...names])=>({kind:"text",text,formats:names.map(format)}))});
const doc=(...children:unknown[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}}});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shape=(n:any):Run[]=>n.children.map((t:any)=>[t.text,...t.formats.map((f:any)=>f.type==="breditor-inline/link"?`link:${f.properties["breditor-inline/href"]}`:Object.keys(formatTypes).find(k=>formatTypes[k]===f.type)).sort()]);
const sorted=(runs:Run[])=>runs.map(([text,...names])=>[text,...names.sort()]);
const url="https://example.com/x";
/** Export one paragraph/heading, require `expected` exactly (or an HTML fallback when null), then the identical runs back. */
function check(runs:Run[],expected:string|null,level?:number){
 const a=staging(),exported=a.exportMarkdown(doc(block(runs,level)));if(!exported.ok)throw Error(exported.error);
 if(expected===null){expect(exported.value.startsWith(level?`<h${level}`:"<p"),exported.value).toBe(true);expect(exported.losses).toEqual([{code:"markdown-feature",count:1,effect:"compatibility"}]);}
 else{expect(exported.value).toBe(expected);expect(exported.losses).toEqual([]);}
 const back=root(a.importMarkdown(exported.value));
 expect(back.children.map((n:{type:string})=>n.type),exported.value).toEqual([level?"breditor/heading":"breditor/paragraph"]);
 if(level)expect(back.children[0].properties["breditor/level"]).toBe(level);
 expect(shape(back.children[0]),exported.value).toEqual(sorted(runs));
}
describe("Markdown export applies whitespace rules to the whole block, not per run",()=>{
 it("exports formatted runs, links and code spans next to single spaces as Markdown",()=>{
  for(const [runs,markdown] of [
   [[["see "],["b","strong"],[" c"]],"see **b** c"],
   [[["see "],["b","italic"],[" c"]],"see *b* c"],
   [[["see "],["b","strike"],[" c"]],"see ~~b~~ c"],
   [[["see "],["a","link:"+url],[" b"]],`see [a](<${url}>) b`],
   [[["read "],["the docs","link:"+url],[" now"]],`read [the docs](<${url}>) now`],
   // Link text may start or end with a space: brackets are not flanking delimiters.
   [[["a ","link:"+url],["b"]],`[a ](<${url}>)b`],
   [[["see "],["x","code"],[" b"]],"see `x` b"],
   [[["a "],["b","italic"],[" "],["c","strong"],[" d"]],"a *b* **c** d"],
   [[["a "],["b","strong","italic"],[" c"]],"a ***b*** c"],
   [[["a "],["b","strong","link:"+url],[" c "],["d","code"],[" e"]],`a **[b](<${url}>)** c \`d\` e`],
   // Nested emphasis split into runs at its spaces still re-parses to the same runs.
   [[["a "],["d ","italic"],["e","italic","strong"],[" f","italic"],[" g"]],"a *d ****e**** f* g"],
   [[["a\n"],["b","strong"],[" c"]],"a\\\n**b** c"],
   // One space before a backslash hard break is kept (two would be a hard break themselves).
   [[["a \n"],["b","strong"]],"a \\\n**b**"],
  ] as [Run[],string][])check(runs,markdown);
 });
 it("exports headings with formatted runs next to spaces as Markdown",()=>{
  check([["see "],["b","strong"],[" c "],["d","code"]],"## see **b** c `d`",2);
  check([["Read "],["the docs","link:"+url],[" now"]],`# Read [the docs](<${url}>) now`,1);
  check([[" "],["b","strong"]],null,2);check([["b","strong"],[" "]],null,3);check([["a "],[" b","italic"]],null,2);
 });
 it("exports a same-window link whose text is its target as <url> between spaces",()=>{
  const href="https://example.com/";
  check([["see "],[href,"link:"+href],[" now"]],`see <${href}> now`);
  check([["("],[href,"link:"+href],[")."]],`\\(<${href}>\\)\\.`);
 });
 it("keeps HTML for whitespace CommonMark would trim, collapse or turn into a break",()=>{
  for(const runs of [
   // Leading/trailing block whitespace (paragraph content is trimmed).
   [[" "],["b","strong"],[" c"]],[["see "],["b","strong"],[" "]],[[" a","italic"],["b"]],
   // Two spaces across a run boundary (HTML collapses them; before a line end they form a hard break).
   [["a ","strong"],[" b"]],[["a "],[" ","code"],["b"]],
   // Tabs and CR are not kept as typed.
   [["a\t"],["b","strong"]],[["a"],["\tb","italic"]],[["a\r"],["b","strong"]],
   // A space after a hard break (CommonMark strips a line's leading spaces).
   [["a\n"],[" b","strong"]],[["a\n "],["b","strong"]],
  ] as Run[][])check(runs,null);
 });
 it("keeps HTML when an emphasis run's own text starts or ends with a space",()=>{
  // CommonMark only opens a delimiter run that is left-flanking (not followed by whitespace) and closes a
  // right-flanking one, so `**b **` / `** b**` are literal asterisks. Moving the space outside the
  // delimiters would drop the space's own formatting, so the verifier rejects that too: exact HTML.
  for(const runs of [
   [["see "],["b ","strong"],["c"]],[["see"],[" b","strong"],[" c"]],
   [["a "],["b ","italic"],["c"]],[["a"],[" b","italic"],[" c"]],
   [["a "],["b ","strike"],["c"]],[["a"],[" b","strike"],[" c"]],
   [["a "],["b ","strong","link:"+url],["c"]],
  ] as Run[][])check(runs,null);
 });
 it("exports GFM table cells with formatted runs next to spaces and keeps HTML for cell edge spaces",()=>{
  const a=staging(),source=`| a **b** c | d \`e\` f |\n| --- | --- |\n| [g](<${url}>) h | i *j* |`,imported=a.importMarkdown(source);
  const exported=a.exportMarkdown(json(imported));expect(exported).toEqual({ok:true,value:source,losses:[]});
  if(!exported.ok)throw Error(exported.error);expect(json(a.importMarkdown(exported.value))).toBe(json(imported));
  const r=root(imported),cell=r.children[0].children[1].children[0].children[0];
  cell.children.at(-1).text+=" ";
  const edge=a.exportMarkdown(JSON.stringify({kind:"flow",document:{root:r}}));if(!edge.ok)throw Error(edge.error);
  expect(edge.value.startsWith("<table"),edge.value).toBe(true);expect(edge.losses).toEqual([{code:"markdown-feature",count:1,effect:"compatibility"}]);
  const back=root(a.importMarkdown(edge.value)).children[0].children[1].children[0].children[0];
  expect(shape(back)).toEqual(shape(cell));
 });
});
