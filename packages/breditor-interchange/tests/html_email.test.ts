import {describe,expect,it} from "vitest";
import {createRichInterchange,exportEmailHtml,importHtmlPage,type InterchangeOwner} from "../src/index.js";
import {emailDecoration} from "../src/html_email.js";

/** Parser-unit staging owner with every V4 conversion capability. Native admission is covered by the rich-browser spec. */
function staging(){
  const owner:InterchangeOwner={
    supportsClipboardInterchange:()=>true,
    admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},
    validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},
    supportsListNumbering:()=>true,supportsTextLanguage:()=>true,supportsImageLinks:()=>true,supportsDetails:()=>true,supportsMentions:()=>true,
    supportsTableCaptions:()=>true,supportsPageBreaks:()=>true,supportsBookmarks:()=>true,
  };
  const options={resolveImage:({src}:{src:string})=>src.startsWith("https://cdn.example.test/")?{asset:src.slice(25),generation:"g1"}:undefined,
    exportImage:({asset}:{asset:string})=>`https://cdn.example.test/${asset}`};
  const adapter=createRichInterchange(owner,options);
  const transfer=(html:string)=>{const result=adapter.importHtml(html,{kind:"flow"});if(!result.ok)throw Error(result.error);expect(result.losses).toEqual([]);return result.value.structuredJson;};
  return{owner,adapter,options,transfer};
}
function value<T>(result:{ok:true;value:T}|{ok:false;error:string}):T{if(!result.ok)throw Error(result.error);return result.value;}

/** Representative content for every presentation the exporter writes. */
const rich='<h1 style="text-align:center">Monthly <em>news</em></h1>'+
  '<h3 id="bm-intro">Intro</h3>'+
  '<p style="text-align:start;line-height:150%;margin-inline-start:2em">Plain <strong>bold</strong> <u>under</u> <s>gone</s> x<sub>2</sub> y<sup>3</sup> '+
  '<span style="color:#cc0000">red</span> <span style="background-color:#ffff00">marked</span> <span style="font-size:20px">large</span> '+
  '<span style="font-family:serif">serif</span> <span style="font-family:system-ui">system</span> <span style="font-family:monospace">mono</span> '+
  '<code>inline()</code> <a href="https://example.test/a">link</a> <a href="https://example.test/b" target="_blank" rel="noopener noreferrer"><span style="color:#00aa00">green link</span></a> '+
  '<a href="#bm-intro">back</a> <span lang="fr">bonjour</span> <span class="breditor-mention" data-mention-kind="user" data-mention-id="u1">@Ada</span></p>'+
  '<p dir="rtl" style="text-align:end">שלום</p><p dir="auto">auto</p>'+
  '<blockquote><p>Quoted</p><p style="text-align:justify">Second</p></blockquote>'+
  '<pre><code class="language-ts">const x = 1;\n  return x;</code></pre>'+
  '<hr>'+
  '<ul><li><p>Bullet</p><ol type="a" start="3"><li><p>Nested</p></li></ol></li><li><p>Two</p></li></ul>'+
  '<ol reversed start="5" type="I"><li><p>Roman</p></li><li><p>Next</p></li></ol>'+
  '<ul><li><input type="checkbox" disabled checked><p>Done</p></li><li><input type="checkbox" disabled><p>Open</p></li></ul>'+
  '<details open><summary>More</summary><p>Hidden body</p></details>'+
  '<figure><a href="https://example.test/full"><img src="https://cdn.example.test/hero" alt="Hero" width="640" height="320"></a><figcaption><p>Caption</p></figcaption></figure>'+
  '<table><caption style="caption-side:bottom"><p>Totals</p></caption><colgroup><col width="120"><col width="200"><col width="80"></colgroup><tbody>'+
  '<tr><th><p>Name</p></th><th><p>Value</p></th><th><p>Note</p></th></tr>'+
  '<tr><td rowspan="2" colspan="2"><div data-breditor-cell-partition="1" data-breditor-cell-row="0" data-breditor-cell-column="0" data-breditor-cell-header="0"><p>Merged</p></div>'+
  '<div data-breditor-cell-partition="1" data-breditor-cell-row="0" data-breditor-cell-column="1" data-breditor-cell-header="0"><p></p></div>'+
  '<div data-breditor-cell-partition="1" data-breditor-cell-row="1" data-breditor-cell-column="0" data-breditor-cell-header="0"><p></p></div>'+
  '<div data-breditor-cell-partition="1" data-breditor-cell-row="1" data-breditor-cell-column="1" data-breditor-cell-header="0"><p>Hidden</p></div></td>'+
  '<td><p style="text-align:right">1</p></td></tr><tr><td><p>2</p></td></tr></tbody></table>'+
  '<div style="break-after:page;page-break-after:always"></div><p>After break</p>';

describe("email HTML export",()=>{
  it("writes every presentation as inline styles without stylesheets, scripts or handlers",()=>{
    const {owner,options,transfer}=staging(),html=value(exportEmailHtml(owner,transfer(rich),{exportImage:options.exportImage}));
    expect(html.startsWith('<div data-breditor-email="content" style="'+emailDecoration["div"]![0]+'">')).toBe(true);
    expect(html).not.toMatch(/<style|<script|<link|\son[a-z]+=|javascript:/i);
    // Classes stay only as semantic carriers (code language, mention entity), never for presentation.
    expect([...html.matchAll(/class="([^"]*)"/g)].map(m=>m[1])).toEqual(["breditor-mention","language-ts"]);
    for(const tag of ["p","h1","h3","blockquote","pre","code","hr","ul","ol","li","figure","img","figcaption","table","caption","td","th","a","details","summary","input"])
      expect(html,tag).toMatch(new RegExp(`<${tag}\\b[^>]*style="`));
    expect(html).toContain('<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px">');
    expect(html).toContain('<td rowspan="2" colspan="2" style="border:1px solid #d0d7de;');
    expect(html).toContain('<img src="https://cdn.example.test/hero" alt="Hero" width="640" height="320" style="display:block;max-width:100%;height:auto;border:0">');
    expect(html).toContain(' type="a" style="margin:0 0 16px;padding:0 0 0 28px;list-style-type:lower-alpha">');
    expect(html).toContain(' reversed style="margin:0 0 16px;padding:0 0 0 28px;list-style-type:upper-roman">');
    // Logical alignment carries a physical fallback for clients without logical values.
    expect(html).toContain("white-space:pre-wrap;text-align:left;text-align:start;margin-inline-start:2em;line-height:150%");
    expect(html).toContain("white-space:pre-wrap;text-align:left;text-align:end;direction:rtl");
    expect(html).toContain("font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif");
    // An authored text color keeps precedence over the decorative link color.
    expect(html).toContain('<a href="https://example.test/b" target="_blank" rel="noopener noreferrer"><span style="color:#00aa00">green link</span></a>');
    expect(html).toContain('<a href="https://example.test/a" style="color:#0969da;text-decoration:underline">link</a>');
  });

  it("re-imports through importHtml with the same semantics and no notices",()=>{
    const {owner,adapter,options,transfer}=staging(),source=transfer(rich);
    const email=value(exportEmailHtml(owner,source,{exportImage:options.exportImage}));
    const again=adapter.importHtml(email);
    expect(again.losses).toEqual([]);
    const reimported=value(again).structuredJson;
    // The ordinary exporter is the canonical semantic projection: identical for both transfers.
    expect(value(adapter.exportHtml(reimported))).toBe(value(adapter.exportHtml(source)));
    expect(value(exportEmailHtml(owner,reimported,{exportImage:options.exportImage}))).toBe(email);
  });

  it("wraps the preset page and returns its metadata, preheader and geometry on page import",()=>{
    const {owner,adapter,options,transfer}=staging(),source=transfer(rich);
    const page={title:"News & notes",description:"Monthly",language:"en",direction:"ltr"} as const;
    const preset={width:640,background:"#EEF2F7",contentBackground:"#ffffff",preheader:"This month: <highlights> & more"};
    const html=value(exportEmailHtml(owner,source,{exportImage:options.exportImage,page,preset}));
    expect(html.startsWith('<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
      '<title>News &amp; notes</title><meta name="description" content="Monthly"></head><body style="margin:0;padding:0;background-color:#eef2f7">'+
      '<div data-breditor-email="preheader" style="display:none;max-height:0;overflow:hidden;mso-hide:all">This month: &lt;highlights&gt; &amp; more</div>'+
      '<table data-breditor-email="wrapper" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef2f7" style="background-color:#eef2f7"><tr><td align="center" style="padding:24px 12px">'+
      '<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:640px;max-width:100%;background-color:#ffffff"><tr><td style="padding:24px;text-align:left"><div data-breditor-email="content"')).toBe(true);
    expect(html.endsWith("</div></td></tr></table></td></tr></table></body></html>")).toBe(true);
    const imported=importHtmlPage(owner,html,options);
    expect(imported.losses).toEqual([]);
    const {metadata,body,email}=value(imported);
    expect(metadata).toEqual(page);
    expect(email).toEqual({width:640,background:"#eef2f7",contentBackground:"#ffffff",preheader:"This month: <highlights> & more"});
    expect(value(adapter.exportHtml(body.structuredJson))).toBe(value(adapter.exportHtml(source)));
    // Fragment import of a preset page keeps the body and ignores the host-only preset. (Fragment import
    // still inherits root `lang`/`dir` into the body, as for any page, so this page sets neither.)
    const fragment=adapter.importHtml(value(exportEmailHtml(owner,source,{exportImage:options.exportImage,page:{title:"T"},preset})));
    expect(fragment.losses).toEqual([]);
    expect(value(adapter.exportHtml(value(fragment).structuredJson))).toBe(value(adapter.exportHtml(source)));
    // Without a preset the page holds the content root directly; rtl pages align the column right.
    const plain=value(exportEmailHtml(owner,source,{exportImage:options.exportImage,page:{title:"T"}}));
    expect(plain).toMatch(/^<!doctype html><html><head><meta charset="utf-8"><title>T<\/title><\/head><body><div data-breditor-email="content"/);
    expect(value(importHtmlPage(owner,plain,options)).email).toBeUndefined();
    expect(value(exportEmailHtml(owner,source,{page:{title:"T",direction:"rtl"},preset:{}}))).toContain('<td style="padding:24px;text-align:right">');
  });

  it("reports the same conversion notices as the other exporters",()=>{
    const {owner,transfer}=staging(),source=transfer('<figure><img src="https://cdn.example.test/hero" alt="Hero"></figure>');
    const missing=exportEmailHtml(owner,source);
    expect(missing.losses).toEqual([{code:"image-reference",count:1,effect:"loss"}]);
    expect(value(missing)).toContain('<p style="margin:0 0 16px;white-space:pre-wrap">Hero</p>');
    const inline=createRichInterchange(owner).importHtml("<b>Only</b> inline");
    const text=exportEmailHtml(owner,value(inline).structuredJson);
    expect(text.losses).toEqual([{code:"block-structure",count:1,effect:"loss"}]);
    expect(value(text)).toContain("<strong>Only</strong> inline</p>");
  });

  it("validates options, preset bounds and host text before native reads",()=>{
    let reads=0;
    const {owner:base,transfer}=staging(),source=transfer("<p>Body</p>");
    const owner:InterchangeOwner={...base,validateClipboard(json){reads++;return base.validateClipboard!(json);}};
    const refused=(options:unknown)=>exportEmailHtml(owner,source,options as never);
    expect(refused({inlineStyles:true})).toEqual({ok:false,error:"unsupported-content",losses:[]});
    expect(refused({preset:{}})).toEqual({ok:false,error:"unsupported-content",losses:[]});
    for(const preset of [{width:319},{width:1201},{width:600.5},{background:"red"},{contentBackground:"#fff"},{background:"#12345g"},{script:"x"}])
      expect(refused({page:{title:"T"},preset})).toEqual({ok:false,error:"unsupported-content",losses:[]});
    expect(refused({page:{title:"T"},preset:{preheader:"é".repeat(257)}})).toEqual({ok:false,error:"resource-limit",losses:[]});
    expect(refused({page:{title:"T",language:"x-private"}})).toEqual({ok:false,error:"unsupported-content",losses:[]});
    expect(reads).toBe(0);
    expect(refused({page:{title:"T"},preset:{width:320,preheader:"é".repeat(256)}}).ok).toBe(true);
    expect(reads).toBe(1);
  });

  it("leaves inexact or foreign markers to ordinary conversion and notices",()=>{
    const {adapter}=staging();
    // A tampered root style is not recognized: its marker and decorative CSS are reported.
    const tampered=adapter.importHtml('<div data-breditor-email="content" style="color:#000"><p style="margin:0 0 16px">x</p></div>');
    expect(tampered.losses).toEqual([{code:"unsupported-attribute",count:1,effect:"loss"},{code:"unsupported-style",count:1,effect:"loss"}]);
    // Only the fixed leading prefix is removed; other declarations convert normally.
    const root=`<div data-breditor-email="content" style="${emailDecoration["div"]![0]}">`;
    const extra=adapter.importHtml(root+'<p style="margin:0 0 16px;color:#123456;padding:3px">x</p></div>');
    expect(extra.losses).toEqual([{code:"unsupported-style",count:1,effect:"loss"}]);
    const run=JSON.parse(value(extra).structuredJson).document.root.children[0].children[0];
    expect(run.formats).toEqual([{type:"breditor-inline/text-color",properties:{"breditor-inline/rgb24":0x123456}}]);
    // A wrapper whose shape differs converts as an ordinary layout table.
    const wrapper=adapter.importHtml('<table data-breditor-email="wrapper" bgcolor="#ffffff"><tr><td><p>x</p></td><td>y</td></tr></table>');
    expect(JSON.parse(value(wrapper).structuredJson).document.root.children[0].type).toBe("breditor/table");
    expect(wrapper.losses.map(n=>n.code)).toContain("unsupported-attribute");
  });
});
