// Catalog case inline-highlight-mark@1, HTML round trip (docs/CLEAR_INLINE_FORMATTING.md, "Highlight").
// Highlight is the RGB24 `breditor-inline/background-color` format. Export writes a semantic `<mark>` that
// carries the exact colour; import reads `<mark>` as the default yellow and lets the style override it.
import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
/** Parser-unit staging stub, as in interchange.test.ts; native admission is exercised by the browser specs. */
function adapter(){
  const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,
    admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},
    validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};}};
  return createRichInterchange(owner);
}
type Run={text:string;formats:{type:string;properties:Record<string,unknown>}[]};
function runs(result:ReturnType<ReturnType<typeof adapter>["importHtml"]>):Run[]{
  if(!result.ok)throw Error(result.error);
  const walk=(node:any):Run[]=>node.kind==="text"?[node]:(node.children??[]).flatMap(walk);
  return walk(JSON.parse(result.value.structuredJson).document.root);
}
const highlight=(rgb:number)=>({type:"breditor-inline/background-color",properties:{"breditor-inline/rgb24":rgb}});
const summary=(list:Run[])=>list.map(run=>[run.text,run.formats.map(f=>f.type==="breditor-inline/background-color"?`highlight=#${(f.properties["breditor-inline/rgb24"] as number).toString(16).padStart(6,"0")}`:f.type.split("/")[1])]);

describe("inline-highlight-mark@1 HTML interchange",()=>{
  it("exports highlight as a mark and round-trips default and configured colours beside unrelated marks",()=>{
    const html=adapter();
    const imported=html.importHtml('<p><mark>Default</mark> plain <b><mark style="background-color:#c6f6d5">green bold</mark></b> <span style="background-color:rgb(254,215,226);color:#123456">pink</span></p>');
    expect(imported.ok&&imported.losses).toEqual([]);
    const before=summary(runs(imported));
    expect(before).toEqual([["Default",["highlight=#ffff00"]],[" plain ",[]],["green bold",["highlight=#c6f6d5","strong"]],[" ",[]],["pink",["highlight=#fed7e2","text-color"]]]);
    if(!imported.ok)throw Error(imported.error);
    const exported=html.exportHtml(imported.value.structuredJson);if(!exported.ok)throw Error(exported.error);
    expect(exported.losses).toEqual([]);
    expect(exported.value).toContain('<mark style="background-color:#ffff00">Default</mark>');
    expect(exported.value).toContain('<mark style="background-color:#c6f6d5"><strong>green bold</strong></mark>');
    expect(exported.value).toContain('<mark style="background-color:#fed7e2"><span style="color:#123456">pink</span></mark>');
    expect(exported.value).not.toContain("<span style=\"background-color");
    const again=html.importHtml(exported.value);
    expect(again.ok&&again.losses).toEqual([]);expect(runs(again)).toEqual(runs(imported));
  });
  it("reports a colour outside the RGB24 grammar as unsupported-style and keeps only what has a meaning",()=>{
    // A translucent mark keeps the mark's default highlight; an unparseable span colour adds none.
    const translucent=adapter().importHtml('<p><mark style="background-color:rgba(255,0,0,0.5)">mark</mark><span style="background-color:hsl(0 100% 50%)">span</span></p>');
    expect(translucent.ok&&translucent.losses).toEqual([{code:"unsupported-style",count:2,effect:"loss"}]);
    expect(runs(translucent).map(run=>[run.text,run.formats])).toEqual([["mark",[highlight(0xffff00)]],["span",[]]]);
    // `transparent` paints nothing, so it neither adds a highlight nor is reported as loss.
    const none=adapter().importHtml('<p><span style="background-color:transparent">clear</span></p>');
    expect(none.ok&&none.losses).toEqual([]);expect(runs(none)[0]!.formats).toEqual([]);
  });
});
