import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createRichInterchange,interchangeLimits,type ClipboardTransfer,type InterchangeOwner} from "../src/index.js";
/** Parser-unit staging stub only. The root probe separately requires actual native Wasm admission. */
function staging(){
  let calls=0;const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){calls++;return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};}};
  return{owner,get calls(){return calls;},adapter:createRichInterchange(owner)};
}
function root(value:ReturnType<ReturnType<typeof staging>["adapter"]["importHtml"]>){if(!value.ok)throw Error(value.error);return JSON.parse(value.value.structuredJson).document.root;}
function nodes(node:any):any[]{return[node,...(node.children??[]).flatMap(nodes)];}
const fixture=(name:string)=>readFileSync(new URL(`./fixtures/${name}`,import.meta.url),"utf8");
describe("explicit parser staging contracts",()=>{
  it("requires all native methods and exact independent capability",()=>{
    for(const owner of [{},{supportsClipboardInterchange:()=>false},{supportsClipboardInterchange:()=>true,admitClipboardRoot:()=>({})}])expect(()=>createRichInterchange(owner as InterchangeOwner)).toThrow(/native clipboard interchange/);
  });
  it("emits canonical native property keys without reordering content or axes",()=>{
    const value=staging().adapter.importHtml('<table><tr><th colspan="2">A</th></tr><tr><td>B</td><td>C</td></tr></table>'),r=root(value);
    for(const n of nodes(r))if(n.kind==="element")expect(Object.keys(n.properties)).toEqual(Object.keys(n.properties).sort());
    const table=r.children[0];expect(table.children).toHaveLength(2);expect(table.properties["breditor/columns"]).toHaveLength(2);expect(table.properties["breditor/merges"]).toHaveLength(1);
    expect(nodes(r).filter(n=>n.kind==="text").map(n=>n.text)).toEqual(["A","B","C"]);
  });
  it("reconstructs Word numbering/nesting and strips only identified list markers",()=>{
    const value=staging().adapter.importHtml(fixture("word.html")),r=root(value),list=r.children.find((n:any)=>n.type==="breditor/ordered-list");
    expect(list.properties["breditor/start"]).toBe(3);expect(list.children).toHaveLength(2);expect(list.children[0].children[1].type).toBe("breditor/bullet-list");
    expect(nodes(r).filter(n=>n.kind==="text").map(n=>n.text).join("\n")).not.toContain("3.");expect(value.losses.some(l=>l.code==="unsupported-style")).toBe(true);
  });
  it("keeps Docs pre-wrapped spaces and cancels its nonbold outer b wrapper",()=>{
    const r=root(staging().adapter.importHtml(fixture("google-docs.html"))),heading=r.children[0],paragraph=r.children[1];
    expect(heading.type).toBe("breditor/heading");expect(heading.properties["breditor/block-align"]).toBe(2);expect(paragraph.children.map((n:any)=>n.text).join("")).toBe("Keep  two spaces, emphasis and a link.");
    expect(nodes(paragraph).filter(n=>n.kind==="text").every(n=>!n.formats.some((f:any)=>f.type==="breditor/strong"))).toBe(true);
  });
  it("applies bounded Office class selectors, specificity, source order and important",()=>{
    const value=staging().adapter.importHtml('<style>.x {color:red} p.x {color:green} .x {color:blue!important} .x {color:yellow!important}</style><p class="x" style="color:white">A</p><p class="x" style="color:black!important">B</p>'),r=root(value);
    expect(r.children[0].children[0].formats[0].properties["breditor-inline/rgb24"]).toBe(0xffff00);expect(r.children[1].children[0].formats[0].properties["breditor-inline/rgb24"]).toBe(0);
    const ignored=staging().adapter.importHtml('<style>@import url(SECRET); div > p {color:red}</style><p>A</p>');expect(ignored.losses.some(l=>l.code==="unsupported-style")).toBe(true);expect(JSON.stringify(root(ignored))).not.toContain("SECRET");
  });
  it("retains authored full-document body styles and rejects unavailable media rules",()=>{
    const r=root(staging().adapter.importHtml('<!doctype html><html><head><style>.body {color:#123456}</style><style media="print">p{color:red}</style></head><body class="body" style="font-size:16px;text-align:center"><p>A</p></body></html>'));
    expect(r.children[0].properties["breditor/block-align"]).toBe(2);expect(r.children[0].children[0].formats.find((f:any)=>f.type==="breditor-inline/text-color").properties["breditor-inline/rgb24"]).toBe(0x123456);
    expect(r.children[0].children[0].formats.find((f:any)=>f.type==="breditor-inline/text-size").properties["breditor-inline/pixels"]).toBe(16);
  });
  it("preserves inline HTML scope and lets hosts explicitly request grid/flow admission",()=>{
    const adapter=staging().adapter,result=adapter.importHtml("<strong>A</strong>");if(!result.ok)throw Error(result.error);expect(result.value.kind).toBe("text");const html=adapter.exportHtml(result.value.structuredJson);if(!html.ok)throw Error(html.error);const back=adapter.importHtml(html.value);if(!back.ok)throw Error(back.error);expect(back.value.kind).toBe("text");
    const flow=adapter.importHtml("<strong>A</strong>",{kind:"flow"});if(!flow.ok)throw Error(flow.error);expect(flow.value.kind).toBe("flow");const grid=adapter.importHtml("<table><tr><td>A</td></tr></table>",{kind:"grid"});if(!grid.ok)throw Error(grid.error);expect(grid.value.kind).toBe("grid");
  });
  it("imports Excel spans, widths, Unicode and displayed values, not formulas",()=>{
    const value=staging().adapter.importHtml(fixture("excel.html")),table=root(value).children.find((n:any)=>n.type==="breditor/table");
    expect(table.properties["breditor/columns"].map((c:any)=>c.width)).toEqual([96,144,80]);expect(table.properties["breditor/merges"]).toHaveLength(2);expect(table.children).toHaveLength(3);
    expect(nodes(table).filter(n=>n.kind==="text").map(n=>n.text)).toContain("South & West");expect(value.losses.some(l=>l.code==="unsupported-style")).toBe(true);
  });
  it("keeps Markdown tasks, nested lists, tables, code and quotes",()=>{
    const r=root(staging().adapter.importMarkdown(fixture("everyday.md")));
    for(const type of ["heading","ordered-list","task-list","blockquote","code-block","table","horizontal-rule"])expect(nodes(r).some(n=>n.type===`breditor/${type}`)).toBe(true);
    expect(nodes(r).filter(n=>n.type==="breditor/task-item").map(n=>n.properties["breditor/checked"])).toEqual([true,false]);
  });
  it("round trips nested tasks without creating an indented code block or empty item head",()=>{
    const adapter=staging().adapter,first=adapter.importHtml('<ul><li><input type="checkbox" checked>Done<ul><li><input type="checkbox">Nested</li></ul></li></ul>'),r=root(first);if(!first.ok)throw Error(first.error);
    const exported=adapter.exportMarkdown(first.value.structuredJson);expect(exported.ok).toBe(true);if(!exported.ok)throw Error(exported.error);const back=root(adapter.importMarkdown(exported.value));
    expect(nodes(back).filter(n=>n.type==="breditor/task-item")).toHaveLength(2);expect(nodes(back).some(n=>n.type==="breditor/code-block")).toBe(false);expect(r.children[0].children[0].children).toHaveLength(2);
  });
  it("never passes active markup or dangerous URLs to native literals",()=>{
    const value=staging().adapter.importHtml('<p onclick="SECRET">Before<script>SECRET</script><svg><text>SECRET</text></svg><a href="javascript:SECRET">keep</a><span style="background-image:url(SECRET);color:#123456">after</span></p>');
    expect(JSON.stringify(root(value))).not.toContain("SECRET");expect(value.losses.map(l=>l.code)).toEqual(expect.arrayContaining(["removed-content","unsafe-link","unsupported-style","unsupported-attribute"]));expect(JSON.stringify(value.losses)).not.toContain("SECRET");
  });
  it("does not make hidden Office or HTML content visible during conversion",()=>{
    const result=staging().adapter.importHtml('<style>.hidden {display:none}</style><p>Before<span class="hidden">SECRET1</span><span hidden>SECRET2</span><span style="mso-hide:all">SECRET3</span>After</p><p class="hidden" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>SECRET4</p>');
    expect(JSON.stringify(root(result))).not.toContain("SECRET");expect(nodes(root(result)).filter(n=>n.kind==="text").map(n=>n.text).join("")).toBe("BeforeAfter");expect(result.losses.some(l=>l.code==="removed-content")).toBe(true);
  });
  it("rejects unsupported hidden table axes/items instead of exposing or shifting their content",()=>{
    for(const source of ['<table><tr hidden><td>SECRET</td></tr><tr><td>Visible</td></tr></table>','<table><tr><td style="display:none">SECRET</td><td>Visible</td></tr></table>','<ol><li hidden>SECRET</li><li>Visible</li></ol>']){const test=staging();expect(test.adapter.importHtml(source)).toMatchObject({ok:false,error:"unsupported-content"});expect(test.calls).toBe(0);}
  });
  it("reports Markdown URL removals through the same HTML boundary",()=>{
    const value=staging().adapter.importMarkdown("[keep](javascript:SECRET)");expect(value.ok).toBe(true);expect(JSON.stringify(root(value))).not.toContain("javascript:");expect(value.losses.some(l=>l.code==="unsafe-link")).toBe(true);
  });
  it("keeps case-insensitive new-window intent and reports unsupported link policies",()=>{
    const kept=root(staging().adapter.importHtml('<a href="https://example.org" target="_BLANK">A</a>'));expect(kept.children[0].children[0].formats[0].properties["breditor-inline/new-window"]).toBe(true);
    const changed=staging().adapter.importHtml('<a href="https://example.org" target="named-frame" rel="nofollow noreferrer">A</a>');expect(changed.losses.some(l=>l.code==="unsupported-attribute"&&l.effect==="loss")).toBe(true);
  });
  it("chooses the first supported font fallback rather than a later unrelated preset",()=>{
    const r=root(staging().adapter.importHtml('<p style="font-family:Georgia,Arial,monospace">A</p>'));
    expect(r.children[0].children[0].formats[0].properties["breditor-inline/family"]).toBe(3);
  });
  it("does not treat inherited object keys as known tags, colors or layout values",()=>{
    const result=staging().adapter.importHtml('<constructor><span style="color:constructor;font-family:__proto__;text-align:constructor;direction:constructor">A</span></constructor>');
    expect(result.ok).toBe(true);expect(nodes(root(result)).find(n=>n.kind==="text").formats).toEqual([]);expect(JSON.stringify(root(result))).not.toContain("function Object");expect(result.losses.some(l=>l.code==="unsupported-style")).toBe(true);
  });
  it("requires explicit host-owned image mapping and redacts policy failures",()=>{
    const bare=staging().adapter.importHtml('<figure><img src="https://example.org/private" alt="Diagram"><figcaption>A caption</figcaption></figure>');expect(bare.losses.some(l=>l.code==="image-reference")).toBe(true);
    const {owner}=staging(),adapter=createRichInterchange(owner,{resolveImage:()=>({asset:"owned",generation:"g"})}),r=root(adapter.importHtml('<figure><img src="x" alt="Diagram" width="200" height="100"><figcaption>Caption</figcaption></figure>'));
    expect(r.children[0].type).toBe("breditor/image");expect(r.children[0].properties["breditor/asset-id"]).toBe("owned");expect(r.children[0].children[0].children[0].text).toBe("Caption");
    const bad=createRichInterchange(owner,{resolveImage:()=>{throw Error("SECRET");}}).importHtml('<img src="x">');expect(bad).toEqual({ok:false,error:"asset-policy",losses:[]});
  });
  it("bounds source, construction, depth, CSS, table axes and Markdown before native admission",()=>{
    const cases=["x".repeat(interchangeLimits.sourceBytes+1),"<div>".repeat(60)+"x"+"</div>".repeat(60),"<p>"+"<span>x</span>".repeat(18000)+"</p>",`<p style="color:${" ".repeat(8300)}red">x</p>`,`<table><tr><td colspan="129">x</td></tr></table>`];
    for(const source of cases){const test=staging();expect(test.adapter.importHtml(source)).toMatchObject({ok:false,error:"resource-limit"});expect(test.calls).toBe(0);}
    const md=staging();expect(md.adapter.importMarkdown("> ".repeat(60)+"deep")).toMatchObject({ok:false,error:"resource-limit"});expect(md.calls).toBe(0);
  });
  it("rejects ill-formed scalars, malformed spans and forged source-cell partitions",()=>{
    for(const source of ["<p>\ud800</p>",'<table><tr><td colspan="-2">x</td></tr></table>','<table><tr><td colspan="2"><div data-breditor-cell-row="0" data-breditor-cell-column="0" data-breditor-cell-header="0">A</div></td></tr></table>']){const test=staging();expect(test.adapter.importHtml(source).ok).toBe(false);expect(test.calls).toBe(0);}
  });
  it("emits escaped safe HTML and reports unresolved assets/unknown formats",()=>{
    const test=staging(),r=root(test.adapter.importHtml('<p>&lt;img src=x onerror=SECRET&gt; <a href="https://example.org/a?x=1&amp;y=2">link</a></p>'));
    r.children[0].children[0].formats=[{type:"example/unknown",properties:{}}];const result=test.adapter.exportHtml(JSON.stringify({document:{root:r}}));expect(result.ok).toBe(true);if(result.ok){expect(result.value).toContain("&lt;img");expect(result.value).not.toContain("<img src=x");expect(result.value).toContain("&amp;y=2");expect(result.losses).toContainEqual({code:"unsupported-style",count:1,effect:"loss"});}
  });
});
