import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
import {exportDocx} from "../src/docx.js";
import {all,parseXml,textContent,unzip} from "./docx_support.js";
/** Parser-unit staging owner; rich V1–V4 already admit multi-block items (see docs/LIST_STRUCTURE.md). */
function staging(){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};}};
 return createRichInterchange(owner);
}
type Result=ReturnType<ReturnType<typeof staging>["importHtml"]>;
function root(value:Result){if(!value.ok)throw Error(value.error);return JSON.parse(value.value.structuredJson).document.root;}
function json(value:Result):string{if(!value.ok)throw Error(value.error);return value.value.structuredJson;}
/** Item shapes: each item as the list of its child kinds and texts. */
function shape(node:any):unknown{
 if(node.kind==="text")return node.text;
 const local=node.type.slice("breditor/".length);
 if(local==="paragraph")return `p:${node.children.map((c:any)=>c.text??"").join("")}`;
 return {[local]:node.children.map(shape)};
}
const html='<ol start="2"><li><p>one</p><p>two</p><ul><li>child</li></ul><p>three</p></li><li><p>next</p></li></ol>';
const expected=[{"ordered-list":[{"list-item":["p:one","p:two",{"bullet-list":[{"list-item":["p:child"]}]},"p:three"]},{"list-item":["p:next"]}]}];

describe("multi-block list items in interchange",()=>{
 it("imports and exports HTML items with later paragraphs after a child list, exactly",()=>{
  const adapter=staging(),first=adapter.importHtml(html);
  expect(root(first).children.map(shape)).toEqual(expected);expect(first.losses).toEqual([]);
  const out=adapter.exportHtml(json(first));if(!out.ok)throw Error(out.error);
  expect(out.value.replaceAll(' style="white-space:pre-wrap"',"")).toContain("<li><p>one</p><p>two</p><ul><li><p>child</p></li></ul><p>three</p></li>");
  const back=adapter.importHtml(out.value);expect(root(back).children.map(shape)).toEqual(expected);expect(back.losses).toEqual([]);
 });
 it("round trips loose Markdown items with indented continuation blocks",()=>{
  const adapter=staging(),md=adapter.exportMarkdown(json(adapter.importHtml(html)));if(!md.ok)throw Error(md.error);
  expect(md.losses).toEqual([]);
  expect(md.value).toBe("2. one\n\n   two\n\n   - child\n\n   three\n3. next");
  const back=adapter.importMarkdown(md.value);expect(root(back).children.map(shape)).toEqual(expected);
 });
 it("exports later DOCX paragraphs as unnumbered continuation paragraphs at the item indent",()=>{
  const adapter=staging(),source=JSON.parse(json(adapter.importHtml(html)));
  const result=exportDocx(JSON.stringify({format:"breditor/document",formatVersion:2,root:{...source.document.root,type:"breditor/document",properties:{"breditor/document-id":"d"}}}));
  if(!result.ok)throw Error(result.error);
  const part=unzip(result.value).find(file=>file.name==="word/document.xml")!;
  const paragraphs=all(parseXml(new TextDecoder().decode(part.data)),"w:p").map(p=>({text:textContent(p),numbered:all(p,"w:numPr").length>0,indent:all(p,"w:ind")[0]?.attributes["w:left"]}));
  expect(paragraphs).toEqual([
   {text:"one",numbered:true,indent:undefined},
   {text:"two",numbered:false,indent:"720"},
   {text:"child",numbered:true,indent:undefined},
   {text:"three",numbered:false,indent:"720"},
   {text:"next",numbered:true,indent:undefined},
  ]);
 });
});
