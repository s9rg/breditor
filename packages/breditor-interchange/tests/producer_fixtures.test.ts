import {describe,it,expect} from "vitest";
import {readFileSync,readdirSync} from "node:fs";
import {createRichInterchange,type ImageSource,type InterchangeLoss,type InterchangeOptions,type InterchangeOwner} from "../src/index.js";
/**
 * Producer clipboard corpus. Every fixture under fixtures/producers is RECONSTRUCTED from the
 * documented clipboard HTML shape of its producer (see each file header); none is a captured,
 * certified application-native clipboard dump. These are parser staging tests: the stub below
 * stands in for native admission, which the functional probes exercise separately.
 */
function staging(options:InterchangeOptions={}){
  let calls=0;const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){calls++;return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};}};
  return{get calls(){return calls;},adapter:createRichInterchange(owner,options)};
}
const producers=new URL("./fixtures/producers/",import.meta.url);
const fixture=(name:string)=>readFileSync(new URL(name,producers),"utf8");
/** Resolves only remote producer URLs, recording every source the host registry is offered. */
function registry(){const seen:ImageSource[]=[];return{seen,resolveImage:(source:ImageSource)=>{seen.push(source);return source.src.startsWith("https:")?{asset:"owned-1",generation:"g1"}:undefined;}};}
function load(name:string,options:InterchangeOptions={}){
  const test=staging(options),result=test.adapter.importHtml(fixture(name));if(!result.ok)throw Error(`${name}: ${result.error}`);
  expect(test.calls).toBe(1);return{kind:result.value.kind,root:JSON.parse(result.value.structuredJson).document.root,losses:result.losses};
}
const losses=(entries:Record<string,number>):InterchangeLoss[]=>Object.entries(entries).map(([code,count])=>({code,count,effect:code==="html-repaired"||code==="markdown-feature"?"compatibility":"loss"}) as InterchangeLoss);
const text=(n:any):string=>n.kind==="text"?n.text:n.children.map(text).join("");
const nodes=(n:any):any[]=>[n,...(n.children??[]).flatMap(nodes)];
/** Compact native outline: block kinds, list starts, paragraph text, table geometry and merges. */
function outline(n:any,depth=0):string[]{
  const type=n.type.replace("breditor/",""),pad="  ".repeat(depth),p=n.properties;
  if(type==="document")return n.children.flatMap((c:any)=>outline(c,depth));
  if(type==="paragraph"||type==="heading")return[`${pad}${type}${type==="heading"?p["breditor/level"]:""} ${JSON.stringify(text(n))}`];
  if(type==="image")return[`${pad}image ${p["breditor/asset-id"]} ${p["breditor/width"]}x${p["breditor/height"]} alt=${JSON.stringify(p["breditor/alt-text"])}`];
  if(type==="table"){
    const row=(id:string)=>n.children.findIndex((r:any)=>r.properties["breditor/row-id"]===id),column=(id:string)=>p["breditor/columns"].findIndex((c:any)=>c.id===id);
    const merges=p["breditor/merges"].map((m:any)=>`${row(m["first-row"])},${column(m["first-column"])}:${row(m["last-row"])},${column(m["last-column"])}`).sort().join(" ");
    return[`${pad}table widths=${p["breditor/columns"].map((c:any)=>c.width).join(",")} merges=${merges}`,...n.children.map((r:any)=>`${pad}| ${r.children.map((c:any)=>(c.properties["breditor/header"]?"*":"")+c.children.map(text).join("/")).join(" | ")} |`)];
  }
  return[`${pad}${type}${p["breditor/start"]!==undefined?" start="+p["breditor/start"]:""}`,...n.children.flatMap((c:any)=>outline(c,depth+1))];
}
/** Formats of the single text run with exactly this text, as sorted short names (with key literal values). */
function marks(root:any,value:string):string[]{
  const runs=nodes(root).filter(n=>n.kind==="text"&&n.text===value);expect(runs,value).toHaveLength(1);
  return runs[0].formats.map((f:any)=>{const name=f.type.replace(/^breditor(-inline)?\//,""),v=Object.values(f.properties)[0];return v===undefined?name:`${name}=${typeof v==="number"&&name.endsWith("color")?"#"+v.toString(16).padStart(6,"0"):v}`;}).sort();
}
const paragraphWith=(root:any,value:string)=>nodes(root).find(n=>n.kind==="element"&&(n.type==="breditor/paragraph"||n.type==="breditor/heading")&&text(n)===value);
describe("reconstructed producer clipboard corpus",()=>{
  it("labels every producer fixture as reconstructed, not captured clipboard certification",()=>{
    const names=readdirSync(producers).sort();
    expect(names).toEqual(["apple-cocoa.html","excel-desktop.html","google-docs.html","google-sheets.html","libreoffice-writer.html","word-desktop.html","word-online.html"]);
    for(const name of names){const head=fixture(name).slice(0,1200);expect(head.startsWith("<!-- Breditor producer fixture:"),name).toBe(true);expect(head,name).toContain("RECONSTRUCTED");expect(head,name).toContain("NOT a captured, certified clipboard dump");}
  });
  it("Word desktop: mso-list levels nest, alpha/roman markers become ordered lists, conditionals and o:p vanish",()=>{
    const images=registry(),{root,losses:notices}=load("word-desktop.html",{resolveImage:images.resolveImage});
    expect(outline(root)).toEqual([
      'heading1 "Release “Aurora” plan"',
      'paragraph "The team’s key dates are fixed – see below…"',
      "ordered-list start=1",
      "  list-item",
      '    paragraph "Freeze scope"',
      "    ordered-list start=1",
      "      list-item",
      '        paragraph "Review open issues"',
      "      list-item",
      '        paragraph "Tag the candidate"',
      "        ordered-list start=1",
      "          list-item",
      '            paragraph "Sign the build"',
      "  list-item",
      '    paragraph "Publish the release notes"',
      'paragraph ""',
      "bullet-list",
      "  list-item",
      '    paragraph "Owners"',
      "    bullet-list",
      "      list-item",
      '        paragraph "Engineering"',
      "        bullet-list",
      "          list-item",
      '            paragraph "On-call rota"',
      'paragraph "Aurora logo"',
      "table widths=156,156 merges=0,0:0,1",
      "| Milestone |  |",
      "| Beta | 12 May |",
    ]);
    // Marker glyphs, padding and VML fallbacks never leak; Windows-1252 smart punctuation survives as Unicode.
    const all=nodes(root).filter(n=>n.kind==="text").map(n=>n.text).join("|");
    for(const leaked of ["1.","a.","i.","·","§","\u00a0","[if","endif","clip_image"])expect(all).not.toContain(leaked);
    expect(marks(root,"key")).toEqual(["font-family=2","strong","text-size=15"]);expect(marks(root,"dates")).toEqual(["font-family=2","italic","text-size=15"]);expect(marks(root,"fixed")).toEqual(["font-family=2","text-size=15","underline"]);
    expect(marks(root,"release notes")).toEqual(["font-family=2","link=https://example.org/release-notes?v=2&lang=en","text-size=15"]);
    expect(marks(root,"Release “Aurora” plan")).toEqual(["font-family=2","text-color=#2f5496","text-size=21"]);
    // file:// clip companions are producer-local: never offered to the host registry, reported, alt kept as text.
    expect(images.seen).toEqual([]);
    expect(notices).toEqual(losses({"image-reference":1,"list-numbering":3,"style-approximation":31,"table-width":1,"unsupported-attribute":9,"unsupported-style":211}));
    expect(JSON.stringify(notices)).not.toMatch(/file:|Users|clip_/);
  });
  it("Word for the web: flat data-aria-level list runs rebuild nesting and EOP marks vanish",()=>{
    const {root,losses:notices}=load("word-online.html");
    expect(outline(root)).toEqual([
      'paragraph "Status is green – see dashboard"',
      "bullet-list",
      "  list-item",
      '    paragraph "Design review"',
      "    bullet-list",
      "      list-item",
      '        paragraph "Accessibility pass"',
      "  list-item",
      '    paragraph "Launch"',
      "ordered-list start=1",
      "  list-item",
      '    paragraph "Draft"',
      "  list-item",
      '    paragraph "Approve"',
    ]);
    expect(marks(root,"green")).toEqual(["font-family=2","strong","text-color=#000000","text-size=15"]);
    expect(marks(root,"Accessibility pass")).toEqual(["font-family=2","italic","text-color=#000000","text-size=15"]);
    expect(marks(root,"dashboard")).toEqual(["font-family=2","link=https://example.org/status","text-color=#467886","text-size=15","underline"]);
    expect(notices).toEqual(losses({"style-approximation":29,"unsupported-attribute":37,"unsupported-style":205}));
  });
  it("Google Docs: the non-bold guid wrapper, span marks, Docs-style nested lists, br lines and remote images",()=>{
    const images=registry(),{root,losses:notices}=load("google-docs.html",{resolveImage:images.resolveImage});
    expect(outline(root)).toEqual([
      'heading1 "Quarterly review"',
      'paragraph "Revenue grew 12%1, see roadmap and H2O notes"',
      'paragraph ""',
      "bullet-list",
      "  list-item",
      '    paragraph "Hiring"',
      "    bullet-list",
      "      list-item",
      '        paragraph "Two engineers"',
      "  list-item",
      '    paragraph "Budget"',
      'paragraph ""',
      "ordered-list start=1",
      "  list-item",
      '    paragraph "Collect data"',
      "    ordered-list start=1",
      "      list-item",
      '        paragraph "Survey"',
      "  list-item",
      '    paragraph "Publish"',
      'paragraph ""',
      "table widths=200,200 merges=0,0:0,1",
      "| Region |  |",
      "| North | 1,204 |",
      'paragraph ""',
      "image owned-1 240x120 alt=\"Image\"",
    ]);
    // Only the 700-weight span is bold; the <b style="font-weight:normal"> wrapper bolds nothing.
    expect(nodes(root).filter(n=>n.kind==="text"&&n.formats.some((f:any)=>f.type==="breditor/strong")).map(n=>n.text)).toEqual(["12%","Region"]);
    expect(marks(root,"12%")).toEqual(["font-family=2","strong","text-color=#000000","text-size=15"]);
    expect(marks(root,"1")).toEqual(["font-family=2","superscript","text-color=#000000","text-size=9"]);
    expect(marks(root,"2")).toEqual(["font-family=2","subscript","text-color=#000000","text-size=9"]);
    expect(marks(root,"roadmap")).toEqual(["font-family=2","italic","link=https://example.org/roadmap?q=1&tab=t.0","text-color=#1155cc","text-size=15","underline"]);
    expect(marks(root,"O notes")).toEqual(["background-color=#ffff00","font-family=2","text-color=#000000","text-size=15","underline"]);
    expect(paragraphWith(root,"1,204").properties["breditor/block-align"]).toBe(6);
    expect(images.seen).toEqual([{src:"https://lh7-rt.googleusercontent.com/docsz/AD_4nXexampleImageToken?key=exampleKey",alt:null}]);
    // lower-alpha nested numbering is approximated; the lone image is lifted out of its styled paragraph.
    expect(notices).toEqual(losses({"block-structure":1,"image-alt":1,"list-numbering":1,"style-approximation":50,"unsupported-style":76}));
  });
  it("Google Sheets: origin wrapper, merges, same-cell breaks and displayed values with reported cell metadata",()=>{
    const {root,losses:notices}=load("google-sheets.html");
    expect(outline(root)).toEqual([
      "table widths=120,100,100 merges=0,0:0,2 2,0:3,0",
      "| Sales by region |  |  |",
      "| Region | Q1 | Share |",
      "| North\nEast | 1,234.50 | 25% |",
      "|  | 3,702.75 | report |",
    ]);
    expect(marks(root,"Sales by region")).toEqual(["background-color=#d9ead3","font-family=2","strong","text-size=13"]);
    expect(marks(root,"report")).toEqual(["font-family=2","link=https://example.org/report","text-size=13"]);
    expect(paragraphWith(root,"1,234.50").properties["breditor/block-align"]).toBe(6);
    // data-sheets-value/numberformat/formula are reported (displayed text wins); the formula is never imported.
    expect(JSON.stringify(root)).not.toContain("R[-1]C");
    expect(notices).toEqual(losses({"style-approximation":3,"unsupported-attribute":19,"unsupported-style":43}));
  });
  it("Excel desktop: bare cols, class number formats, x:num/x:fmla and merges keep displayed values",()=>{
    const {root,losses:notices}=load("excel-desktop.html");
    expect(outline(root)).toEqual([
      "table widths=96,112,96 merges=0,0:0,2 1,0:2,0",
      "| Pipeline ‘FY24’ |  |  |",
      "| West | $1,234.50 | 11/1/2023 |",
      "|  | $2,469.00 | Ünïcødé & text |",
    ]);
    expect(marks(root,"Pipeline ‘FY24’")).toEqual(["font-family=2","strong","text-color=#000000","text-size=15"]);
    expect(paragraphWith(root,"Pipeline ‘FY24’").properties["breditor/block-align"]).toBe(2);
    expect(paragraphWith(root,"$1,234.50").properties["breditor/block-align"]).toBe(6);
    expect(JSON.stringify(root)).not.toMatch(/=B2\*2|45231|Short Date/);
    expect(notices).toEqual(losses({"style-approximation":18,"table-width":1,"unsupported-attribute":10,"unsupported-style":97}));
  });
  it("LibreOffice Writer: element/class rules, nested ol, relative widths and a temporary file image",()=>{
    const images=registry(),{root,losses:notices}=load("libreoffice-writer.html",{resolveImage:images.resolveImage});
    expect(outline(root)).toEqual([
      'heading1 "Minutes"',
      'paragraph "Bold, italic, underline, struck, E=mc2 and a link."',
      "ordered-list start=1",
      "  list-item",
      '    paragraph "Agenda"',
      "    ordered-list start=1",
      "      list-item",
      '        paragraph "Budget"',
      "  list-item",
      '    paragraph "Actions"',
      "table widths=120,120 merges=",
      "| Owner | Due |",
      'paragraph "Org chart"',
    ]);
    expect(marks(root,"Minutes")).toEqual(["font-family=3","strong","text-size=32"]);
    for(const [run,mark]of [["Bold","strong"],["italic","italic"],["underline","underline"],["struck","strike"],["2","superscript"]] as const)expect(marks(root,run)).toEqual([mark]);
    expect(marks(root,"link")).toEqual(["link=https://example.org/minutes"]);
    expect(images.seen).toEqual([]);
    expect(notices).toEqual(losses({"image-reference":1,"list-numbering":1,"style-approximation":1,"table-width":5,"unsupported-attribute":8,"unsupported-style":30}));
  });
  it("Cocoa HTML Writer (Notes/TextEdit/Pages): br paragraphs, converted spaces, tab spans and ul-in-ul nesting",()=>{
    const {root,losses:notices}=load("apple-cocoa.html");
    expect(outline(root)).toEqual([
      'paragraph "Groceries"',
      'paragraph "Buy\u00a0 by Friday\\t(urgent)"',
      'paragraph ""',
      "bullet-list",
      "  list-item",
      '    paragraph "Fruit"',
      "    bullet-list",
      "      list-item",
      '        paragraph "Apples"',
      "  list-item",
      '    paragraph "Bread"',
    ]);
    expect(marks(root,"Groceries")).toEqual(["strong"]);expect(marks(root,"Friday")).toEqual(["italic"]);
    // The `font` shorthand (size/family) is not interpreted and is reported, not guessed.
    expect(notices).toEqual(losses({"unsupported-style":13}));
  });
});
describe("producer markup variants",()=>{
  const importHtml=(source:string,options?:InterchangeOptions)=>{const test=staging(options),result=test.adapter.importHtml(source);if(!result.ok)throw Error(result.error);return{kind:result.value.kind,root:JSON.parse(result.value.structuredJson).document.root,losses:result.losses};};
  const item=(level:number,marker:string,body:string,list="l0",lfo="lfo1",conditional:"revealed"|"hidden"="revealed")=>{
    const [open,close]=conditional==="revealed"?["<![if !supportLists]>","<![endif]>"]:["<!--[if !supportLists]-->","<!--[endif]-->"];
    return `<p class=MsoListParagraphCxSpMiddle style='mso-list:${list} level${level} ${lfo}'>${open}<span style='mso-list:Ignore'>${marker}<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span>${close}${body}<o:p></o:p></p>`;
  };
  it("accepts downlevel-hidden conditional comments without repair notices",()=>{
    const {root,losses:notices}=importHtml(item(1,"1.","One",undefined,undefined,"hidden")+item(1,"2.","Two",undefined,undefined,"hidden"));
    expect(outline(root)).toEqual(["ordered-list start=1","  list-item",'    paragraph "One"',"  list-item",'    paragraph "Two"']);expect(notices).toEqual([]);
  });
  it("reads roman and alphabetic continuations from the expected ordinal, and upper-case and parenthesized forms",()=>{
    const {root,losses:notices}=importHtml(item(1,"i.","One")+item(1,"ii.","Two")+item(1,"iii.","Three")+item(1,"iv.","Four")+item(1,"v.","Five")+item(1,"C.","Upper",undefined,"lfo2")+item(1,"D.","Next",undefined,"lfo2")+item(1,"(7)","Paren",undefined,"lfo3")+item(1,"2.3.","Compound",undefined,"lfo4"));
    expect(outline(root).filter(l=>l.includes("start="))).toEqual(["ordered-list start=1","ordered-list start=3","ordered-list start=7","ordered-list start=3"]);
    expect(outline(root).filter(l=>l.includes("paragraph")).map(l=>l.trim())).toEqual(['paragraph "One"','paragraph "Two"','paragraph "Three"','paragraph "Four"','paragraph "Five"','paragraph "Upper"','paragraph "Next"','paragraph "Paren"','paragraph "Compound"']);
    expect(notices).toEqual(losses({"list-numbering":9}));
  });
  it("nests a skipped Word level one deeper with a notice instead of rejecting the paste",()=>{
    const {root,losses:notices}=importHtml(item(1,"·","Top")+item(3,"§","Deep")+item(2,"o","Middle"));
    expect(outline(root)).toEqual(["bullet-list","  list-item",'    paragraph "Top"',"    bullet-list","      list-item",'        paragraph "Deep"',"    bullet-list","      list-item",'        paragraph "Middle"']);
    expect(notices).toEqual(losses({"block-structure":1}));
  });
  it("keeps unrecognized Word marker formats as reported bullet structure",()=>{
    const {root,losses:notices}=importHtml(item(1,"Step 1:","Prepare"));
    expect(outline(root)).toEqual(["bullet-list","  list-item",'    paragraph "Prepare"']);expect(notices).toEqual(losses({"list-numbering":1}));
  });
  const online=(style:string,levelText:string|undefined,items:string[],listId="7")=>`<div class="ListContainerWrapper SCXW1 BCX0"><ol class="NumberListStyle2 SCXW1 BCX0" role="list" start="1" style="list-style-type: ${style};">${items.map((body,i)=>`<li${levelText===undefined?"":` data-leveltext="${levelText}"`} data-listid="${listId}" aria-setsize="-1" data-aria-posinset="${i+1}" data-aria-level="1" role="listitem"><p class="Paragraph SCXW1 BCX0">${body}</p></li>`).join("")}</ol></div>`;
  it("reports Word for the web lettered and roman numbering instead of silently showing decimal",()=>{
    const lettered=importHtml(online("lower-alpha","%1.",["Alpha","Beta"]));
    expect(outline(lettered.root)).toEqual(["ordered-list start=1","  list-item",'    paragraph "Alpha"',"  list-item",'    paragraph "Beta"']);
    // One notice for the ol's non-native list-style-type, one per item whose ordinal format is not decimal.
    expect(lettered.losses).toEqual(losses({"list-numbering":3,"unsupported-attribute":2}));
    const romanList=importHtml(online("upper-roman","%1.",["One","Two","Three"]));
    expect(outline(romanList.root)).toEqual(["ordered-list start=1","  list-item",'    paragraph "One"',"  list-item",'    paragraph "Two"',"  list-item",'    paragraph "Three"']);
    expect(romanList.losses).toEqual(losses({"list-numbering":4,"unsupported-attribute":3}));
  });
  it("reports Word for the web numbering whose decimal format cannot be proven",()=>{
    expect(importHtml(online("decimal","%1.",["Proven"])).losses).toEqual(losses({"unsupported-attribute":1}));
    expect(importHtml(online("decimal",undefined,["No level text"])).losses).toEqual(losses({"list-numbering":1}));
    expect(importHtml(online("decimal","%1.%2.",["Compound"])).losses).toEqual(losses({"list-numbering":1,"unsupported-attribute":1}));
  });
  it("keeps a single Docs paragraph copy as inline text without the wrapper's bold",()=>{
    const {kind,root,losses:notices}=importHtml('<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-00000000-7fff-0000-0000-000000000000"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Plain words</span></b>');
    expect(kind).toBe("text");expect(marks(root,"Plain words")).toEqual(["font-family=2","text-color=#000000","text-size=15"]);
    // 11pt rounds to 15px and Arial maps to the sans-serif preset: both approximations, nothing else.
    expect(notices).toEqual(losses({"style-approximation":2}));
  });
  it("keeps a single Google Sheets cell copy as inline text",()=>{
    const {kind,root}=importHtml('<google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style><span style="font-size:10pt;font-family:Arial;font-style:normal;" data-sheets-root="1" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Cell&quot;}">Cell</span></google-sheets-html-origin>');
    expect(kind).toBe("text");expect(text(root)).toBe("Cell");
  });
  it("keeps a leading nested list as its own reported item and reports external stylesheet links",()=>{
    const {root,losses:notices}=importHtml('<link rel="stylesheet" href="https://example.org/x.css"><ul><ul><li>Inner</li></ul><li>Outer</li></ul>');
    expect(outline(root)).toEqual(["bullet-list","  list-item",'    paragraph ""',"    bullet-list","      list-item",'        paragraph "Inner"',"  list-item",'    paragraph "Outer"']);
    expect(notices).toEqual(losses({"block-structure":1,"unsupported-style":1}));
  });
  it("does not treat Word paragraph marks with real text, or ordinary spans with no-break spaces, as removable",()=>{
    const {root}=importHtml('<p>A<o:p> kept</o:p></p><p><span class="TextRun">B</span><span>\u00a0</span></p>');
    expect(outline(root)).toEqual(['paragraph "A kept"','paragraph "B\u00a0"']);
  });
  it("reports file: images in figures without consulting the host registry",()=>{
    const images=registry(),{root,losses:notices}=importHtml('<figure><img src=" FILE:///tmp/x.png" alt="Chart"><figcaption>Cap</figcaption></figure>',{resolveImage:images.resolveImage});
    expect(images.seen).toEqual([]);expect(outline(root)).toEqual(['paragraph "Chart"','paragraph "Cap"']);expect(notices).toEqual(losses({"image-reference":1}));
  });
});
