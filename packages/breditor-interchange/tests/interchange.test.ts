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
  it("bounds descendant depth and the total stylesheet ancestor work before native admission",()=>{
    const tooLong=staging().adapter.importHtml('<style>div section p span{color:red}</style><div><section><p><span>A</span></p></section></div>');
    expect(root(tooLong).children[0].children[0].formats).toEqual([]);
    expect(tooLong.losses).toEqual([{code:"unsupported-style",count:1,effect:"loss"}]);
    const rules=Array.from({length:256},(_,i)=>`.scope${i} span{color:red}`).join("");
    const deep="<div>".repeat(12)+"<span>A</span>".repeat(120)+"</div>".repeat(12);
    const test=staging();
    expect(test.adapter.importHtml(`<style>${rules}</style>${deep}`)).toEqual({ok:false,error:"resource-limit",losses:[]});
    expect(test.calls).toBe(0);
  });
  it("handles bounded mixed child selectors without using the wrong ancestor",()=>{
    const result=staging().adapter.importHtml('<style>.outer > .region p{color:#123456} .outer > p{color:#980000}'+
      '.outer .heading > span{color:#765432} .outer > div > p > span{color:red}</style>'+
      '<div class="outer"><p>Direct</p><div class="region"><div><div class="region"><p>Farther match</p></div></div></div>'+
      '<div><p>Wrong subtree</p></div><p class="heading"><span>Immediate</span><em><span>Nested</span></em></p></div>');
    const runs=nodes(root(result)).filter(node=>node.kind==="text");
    expect(runs.map(({text,formats})=>[text,formats.find((format:any)=>format.type==="breditor-inline/text-color")?.properties["breditor-inline/rgb24"]??null])).toEqual([
      ["Direct",0x980000],["Farther match",0x123456],["Wrong subtree",null],["Immediate",0x765432],["Nested",0x980000],
    ]);
    expect(result.losses).toEqual([{code:"unsupported-style",count:1,effect:"loss"}]);
  });
  it("keeps nonbreaking spaces inside selector identifiers and HTML class tokens",()=>{
    const result=staging().adapter.importHtml('<style>.report\u00a0span{color:red!important}.report\tspan{color:blue}</style>'+
      '<div class="report\u00a0extra"><p><span>Joined</span></p></div><div class="report\textra"><p><span>Separate</span></p></div>');
    const runs=nodes(root(result)).filter(node=>node.kind==="text");
    expect(runs.map(({text,formats})=>[text,formats[0]?.properties["breditor-inline/rgb24"]??null])).toEqual([
      ["Joined",null],["Separate",0x0000ff],
    ]);
    expect(result.losses).toEqual([{code:"unsupported-style",count:1,effect:"loss"}]);
  });
  it("applies bounded Office class selectors, specificity, source order and important",()=>{
    const value=staging().adapter.importHtml('<style>.x {color:red} p.x {color:green} .x {color:blue!important} .x {color:yellow!important}</style><p class="x" style="color:white">A</p><p class="x" style="color:black!important">B</p>'),r=root(value);
    expect(r.children[0].children[0].formats[0].properties["breditor-inline/rgb24"]).toBe(0xffff00);expect(r.children[1].children[0].formats[0].properties["breditor-inline/rgb24"]).toBe(0);
    const ignored=staging().adapter.importHtml('<style>@import url(SECRET); div + p {color:red}</style><p>A</p>');expect(ignored.losses.some(l=>l.code==="unsupported-style")).toBe(true);expect(JSON.stringify(root(ignored))).not.toContain("SECRET");
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
  it("exports Markdown that re-imports with the same block structure and text",()=>{
    const adapter=staging().adapter;
    const doc=(children:any[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}}});
    const paragraph=(...children:any[])=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children});
    const run=(text:string,...formats:string[])=>({kind:"text",text,formats:formats.map(type=>({type,properties:{}}))});
    const cases:[string,any[]][]=[
      ["- foo",[run("- foo")]],["---",[run("---")]],["1) one",[run("1) one")]],["AT&amp;T &copy;",[run("AT&amp;T &copy;")]],
      ["Note.text",[run("Note.","breditor/strong"),run("text")]],
      ["ab",[run("a","breditor/strong"),run("b","breditor/strong","breditor-inline/italic")]],
      ["a\n\n*b*",[run("a\n\n*b*")]],
    ];
    for(const [text,children] of cases){
      const exported=adapter.exportMarkdown(doc([paragraph(...children)]));if(!exported.ok)throw Error(exported.error);
      const back=root(adapter.importMarkdown(exported.value));
      expect(back.children.map((n:any)=>n.type),text).toEqual(["breditor/paragraph"]);
      expect(back.children[0].children.map((n:any)=>n.text).join(""),exported.value).toBe(text.replace(/\\n/g,"\n"));
      const formats=(n:any)=>n.children.map((t:any)=>[t.text,t.formats.map((f:any)=>f.type).sort().join("+")]);
      if(!text.includes("\\n"))expect(formats(back[0]??back.children[0]),exported.value).toEqual(formats(paragraph(...children)));
    }
  });
  it("round trips hard line breaks with escaped line starts and falls back where breaks cannot",()=>{
    const adapter=staging().adapter,imported=adapter.importMarkdown("a  \nb\\\nc");if(!imported.ok)throw Error(imported.error);
    expect(root(imported).children[0].children).toEqual([{kind:"text",text:"a\nb\nc",formats:[]}]);
    const exported=adapter.exportMarkdown(imported.value.structuredJson);expect(exported).toEqual({ok:true,value:"a\\\nb\\\nc",losses:[]});
    const doc=(...children:any[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}}});
    const paragraph=(...runs:[string,...string[]][])=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:runs.map(([text,...formats])=>({kind:"text",text,formats:formats.map(type=>({type,properties:{}}))}))});
    for(const [runs,markdown] of [
      [[["a\n- b\n=\n1. c\n# d\n> e\n+ f\n---\n| g\n:-"]],true],[[["bold\nstill","breditor/strong"],["\nplain"]],true],
      // A closing delimiter right after a hard break is not right-flanking, so the verifier selects HTML.
      [[["one\n","breditor/strong"],["two","breditor-inline/italic"]],false],
      [[["a\n b"]],false],[[["a\n"]],false],[[["a\nb","breditor-inline/code"]],false],
    ] as [[string,...string[]][],boolean][]){
      const result=adapter.exportMarkdown(doc(paragraph(...runs)));if(!result.ok)throw Error(result.error);
      expect(result.losses.some(l=>l.code==="markdown-feature"),result.value).toBe(!markdown);
      const back=root(adapter.importMarkdown(result.value));expect(back.children.map((n:any)=>n.type),result.value).toEqual(["breditor/paragraph"]);
      expect(back.children[0].children.map((t:any)=>[t.text,...t.formats.map((f:any)=>f.type)]),result.value).toEqual(runs);
    }
    const heading=adapter.exportMarkdown(doc({...paragraph(["a\nb"]),type:"breditor/heading",properties:{"breditor/block-id":"h","breditor/level":2}}));expect(heading.ok&&heading.value.startsWith("<h2")).toBe(true);
  });
  it("keeps GFM table column alignment in Markdown and falls back for mixed cell alignment",()=>{
    const adapter=staging().adapter,source="| a | b | c | d |\n| :--- | :---: | ---: | --- |\n| 1 | 2 | 3 | 4 |",imported=adapter.importMarkdown(source);if(!imported.ok)throw Error(imported.error);
    const exported=adapter.exportMarkdown(imported.value.structuredJson);expect(exported).toEqual({ok:true,value:source,losses:[]});
    const r=root(imported);r.children[0].children[1].children[0].children[0].properties["breditor/block-align"]=2;
    const mixed=adapter.exportMarkdown(JSON.stringify({kind:"flow",document:{root:r}}));if(!mixed.ok)throw Error(mixed.error);
    expect(mixed.value.startsWith("<table")).toBe(true);expect(mixed.losses).toEqual([{code:"markdown-feature",count:1,effect:"compatibility"}]);
    const back=root(adapter.importMarkdown(mixed.value));expect(nodes(back).filter(n=>n.type==="breditor/paragraph").map(n=>n.properties["breditor/block-align"])).toEqual([5,2,6,undefined,2,2,6,undefined]);
  });
  it("reports dropped fence info, keeps empty fences in Markdown and approximates zero list starts",()=>{
    const adapter=staging().adapter,info=adapter.importMarkdown("```rust title=x\nx\n```");expect(info.losses).toEqual([{code:"unsupported-attribute",count:1,effect:"loss"}]);expect(root(info).children[0].properties["breditor/language"]).toBe("rust");
    const empty=adapter.importMarkdown("```\n```");if(!empty.ok)throw Error(empty.error);expect(adapter.exportMarkdown(empty.value.structuredJson)).toEqual({ok:true,value:"```\n```",losses:[]});
    const zero=adapter.importMarkdown("0. zero\n1. one");expect(zero.ok).toBe(true);expect(zero.losses).toEqual([{code:"list-numbering",count:1,effect:"loss"}]);expect(root(zero).children[0].properties["breditor/start"]).toBe(1);
    const html=adapter.importHtml('<ol start="-2"><li>A</li></ol>');expect(root(html).children[0].properties["breditor/start"]).toBe(1);expect(html.losses.some(l=>l.code==="list-numbering")).toBe(true);
  });
  it("reports raw HTML comments and declarations that Markdown import cannot keep",()=>{
    const value=staging().adapter.importMarkdown("x <!-- SECRET --> y\n\n<!-- block -->\n\nz");expect(value.losses).toEqual([{code:"removed-content",count:2,effect:"loss"}]);expect(JSON.stringify(root(value))).not.toContain("SECRET");
  });
  it("keeps adjacent separate lists separate through Markdown",()=>{
    const adapter=staging().adapter,item=(text:string)=>`<li>${text}</li>`;
    const first=adapter.importHtml(`<ol>${item("a")}</ol><ol start="5">${item("b")}</ol><ul>${item("c")}</ul><ul>${item("d")}</ul><ul><li><input type="checkbox">e</li></ul><ul><li><input type="checkbox" checked>f</li></ul><blockquote><ul>${item("g")}</ul><ul>${item("h")}</ul></blockquote>`);if(!first.ok)throw Error(first.error);
    const exported=adapter.exportMarkdown(first.value.structuredJson);if(!exported.ok)throw Error(exported.error);expect(exported.losses).toEqual([]);
    const shape=(r:any)=>nodes(r).filter(n=>/list$/.test(n.type??"")).map(n=>[n.type,n.properties["breditor/start"],nodes(n).filter(t=>t.kind==="text").map(t=>t.text).join("")]);
    expect(shape(root(adapter.importMarkdown(exported.value)))).toEqual(shape(root(first)));expect(shape(root(first))).toHaveLength(8);
  });
  it("exports plain block images as Markdown images and keeps richer images in HTML",()=>{
    const {owner}=staging(),adapter=createRichInterchange(owner,{resolveImage:({src})=>({asset:src,generation:"g"}),exportImage:({asset})=>asset});
    for(const [source,alt] of [["![alt](https://example.org/i.png)","alt"],["![](https://example.org/i.png)",""],["![a \\*b\\* \\[c\\] & d](https://example.org/i.png)","a *b* [c] & d"]] as const){
      const imported=adapter.importMarkdown(source);if(!imported.ok)throw Error(imported.error);expect(imported.losses,source).toEqual([]);
      const image=root(imported).children[0];expect(image.type).toBe("breditor/image");expect(image.properties["breditor/alt-text"]).toBe(alt);expect(image.properties["breditor/decorative"]).toBe(alt==="");
      const exported=adapter.exportMarkdown(imported.value.structuredJson);if(!exported.ok)throw Error(exported.error);expect(exported.losses,exported.value).toEqual([]);expect(exported.value.startsWith("!["),exported.value).toBe(true);
      expect(root(adapter.importMarkdown(exported.value)).children[0].properties["breditor/alt-text"]).toBe(alt);
    }
    const sized=root(adapter.importHtml('<figure><img src="https://example.org/i.png" alt="a" width="20" height="10"><figcaption>Cap</figcaption></figure>'));
    const html=adapter.exportMarkdown(JSON.stringify({kind:"flow",document:{root:sized}}));expect(html.ok&&html.value.startsWith("<figure")).toBe(true);expect(html.losses).toEqual([{code:"markdown-feature",count:1,effect:"compatibility"}]);
    const unresolved=staging().adapter.exportMarkdown(JSON.stringify({kind:"flow",document:{root:sized}}));expect(unresolved.losses.some(l=>l.code==="image-reference")).toBe(true);
    const inline=adapter.importMarkdown("para ![alt](https://example.org/i.png)");expect(inline.losses.some(l=>l.code==="block-structure")).toBe(true);
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
  it("preserves representable font shorthand and round trips through native HTML fields",()=>{
    const {adapter}=staging();
    const imported=adapter.importHtml('<p style="font:italic 700 12pt/1.5 serif">A</p>');
    if(!imported.ok)throw Error(imported.error);
    const paragraph=root(imported).children[0];
    expect(imported.losses).toEqual([]);
    expect(paragraph.properties["breditor/line-height-percent"]).toBe(150);
    expect(paragraph.children[0].formats).toEqual([
      {type:"breditor-inline/font-family",properties:{"breditor-inline/family":3}},
      {type:"breditor-inline/italic",properties:{}},
      {type:"breditor-inline/text-size",properties:{"breditor-inline/pixels":16}},
      {type:"breditor/strong",properties:{}},
    ]);
    const exported=adapter.exportHtml(imported.value.structuredJson);
    if(!exported.ok)throw Error(exported.error);
    expect(root(adapter.importHtml(exported.value))).toEqual(root(imported));
  });
  it("cascades font shorthand, resets and longhands in source and importance order",()=>{
    const {adapter}=staging();
    const result=adapter.importHtml(`<style>
      p.x {font-weight:bold;font-style:italic}
      .x {font:16px serif!important}
      .x {font-family:monospace!important}
    </style>
    <p class="x" style="font-size:24px;font-style:italic!important">A</p>
    <p style="font-style:italic;font:16px/2 serif;font-size:18px;line-height:normal">B</p>`);
    expect(result.losses).toEqual([]);
    const [first,second]=root(result).children;
    expect(first.children[0].formats).toEqual([
      {type:"breditor-inline/font-family",properties:{"breditor-inline/family":4}},
      {type:"breditor-inline/italic",properties:{}},
      {type:"breditor-inline/text-size",properties:{"breditor-inline/pixels":16}},
    ]);
    expect(second.properties["breditor/line-height-percent"]).toBeUndefined();
    expect(second.children[0].formats).toEqual([
      {type:"breditor-inline/font-family",properties:{"breditor-inline/family":3}},
      {type:"breditor-inline/text-size",properties:{"breditor-inline/pixels":18}},
    ]);
  });
  it("reports unrepresented shorthand components and preserves the closed fields",()=>{
    const {adapter}=staging();
    const result=adapter.importHtml('<p style="font:small-caps condensed 16px serif">A</p><p style="font:menu">B</p><p style="font:initial">C</p>');
    const [partial,unavailable]=root(result).children;
    expect(result.losses).toEqual([{code:"unsupported-style",count:4,effect:"loss"}]);
    expect(partial.children[0].formats).toEqual([
      {type:"breditor-inline/font-family",properties:{"breditor-inline/family":3}},
      {type:"breditor-inline/text-size",properties:{"breditor-inline/pixels":16}},
    ]);
    expect(unavailable.children[0].formats).toEqual([]);
  });
  it("overrides intrinsic mark styling when the shorthand inherits the parent font",()=>{
    const result=staging().adapter.importHtml(`<p><strong style="font:inherit">A</strong><em style="font:unset">B</em><strong>C</strong></p>
      <p style="font:italic bold 20px serif"><span style="font:inherit">D</span></p>`);
    expect(result.losses).toEqual([]);
    const [plain,styled]=root(result).children;
    expect(plain.children).toEqual([
      {kind:"text",text:"AB",formats:[]},
      {kind:"text",text:"C",formats:[{type:"breditor/strong",properties:{}}]},
    ]);
    expect(styled.children[0].formats.map((mark:any)=>mark.type)).toEqual([
      "breditor-inline/font-family","breditor-inline/italic","breditor-inline/text-size","breditor/strong",
    ]);
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
