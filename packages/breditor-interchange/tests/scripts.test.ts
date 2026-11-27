import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
import {exportDocx} from "../src/docx.js";
import {exportXml} from "../src/xml.js";
import {all,kids,parseXml,textContent,unzip} from "./docx_support.js";

/** Parser-unit staging stub; native admission of the same literals is covered by the Rust preset tests. */
function staging(){
  const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};}};
  return createRichInterchange(owner);
}
type Result={ok:true;value:{structuredJson:string}}|{ok:false;error:string};
interface Run {text:string;formats:{type:string;properties:Record<string,unknown>}[]}
const SUB="breditor-inline/subscript",SUP="breditor-inline/superscript";
function runs(result:Result):Run[]{
  if(!result.ok)throw Error(result.error);
  const out:Run[]=[];const walk=(n:any)=>{if(n.kind==="text")out.push(n);else for(const c of n.children??[])walk(c);};
  walk(JSON.parse(result.value.structuredJson).document.root);return out;
}
/** Ordered `text=script` pairs ("sub", "sup", "both" or ""); `·` separator runs keep adjacent equal runs apart. */
const scripts=(result:Result)=>runs(result).flatMap(r=>r.text.split("·").filter(Boolean).map(text=>{const sub=r.formats.some(f=>f.type===SUB),sup=r.formats.some(f=>f.type===SUP);return `${text}=${sub&&sup?"both":sub?"sub":sup?"sup":""}`;}));
const literal=(type:string)=>({type,properties:{}});
const text=(value:string,...types:string[])=>({kind:"text",text:value,formats:types.map(literal)});
const paragraph=(...children:unknown[])=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p1"},children});
const clipboard=(...children:unknown[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{},children}}});
const documentJson=(children:unknown[])=>JSON.stringify({format:"breditor/document",formatVersion:2,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}});
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
function docxRuns(bytes:Uint8Array):Record<string,string>{
  const part=unzip(bytes).find(f=>f.name==="word/document.xml")!;const xml=parseXml(new TextDecoder().decode(part.data));
  return Object.fromEntries(all(xml,"w:r").map(r=>[textContent(r),kids(r,"w:rPr").flatMap(p=>kids(p,"w:vertAlign")).map(v=>v.attributes["w:val"]).join(",")]));
}

describe("subscript/superscript HTML import",()=>{
  it("maps tags and vertical-align through the cascade with exactly one script per run",()=>{
    const result=staging().importHtml('<style>.raise{vertical-align:super}.lower{vertical-align:sub}</style><p>'+
      '<sub>a</sub>·<sup>b</sup>·<span style="vertical-align:super">c</span>·<span style="vertical-align:sub">d</span>·'+
      '<span class="raise">e</span>·<span class="lower">f</span>·<sup style="vertical-align:sub">g</sup>·<sub class="raise">h</sub>·'+
      '<sup><span style="vertical-align:baseline">i</span></sup>·<sup style="vertical-align:initial">j</sup>·<sub style="vertical-align:unset">k</sub></p>');
    expect(scripts(result)).toEqual(["a=sub","b=sup","c=sup","d=sub","e=sup","f=sub","g=sub","h=sup","i=","j=","k="]);
    if(!result.ok)throw Error(result.error);expect(result.losses).toEqual([]);
  });
  it("resolves nested scripts innermost-wins and restores the parent on inherit",()=>{
    const result=staging().importHtml('<p><sup>A<sub>b</sub>C</sup>·<sub>D<sup>e</sup>F</sub>·'+
      '<sup><span style="vertical-align:sub">g</span></sup>·<span style="vertical-align:super"><sub>h</sub><span style="vertical-align:inherit">i</span></span>·'+
      '<sub><span style="vertical-align:inherit">j</span></sub></p>');
    expect(scripts(result)).toEqual(["A=sup","b=sub","C=sup","D=sub","e=sup","F=sub","g=sub","h=sub","i=sup","j=sub"]);
  });
  it("reports unsupported vertical-align values without inventing a script",()=>{
    const result=staging().importHtml('<p><span style="vertical-align:top">x</span><sup style="vertical-align:middle">y</sup></p>');
    expect(scripts(result)).toEqual(["x=","y=sup"]);
    if(!result.ok)throw Error(result.error);expect(codes(result)).toEqual({"unsupported-style":2});
  });
  it("imports Word desktop, Word Online and Google Docs script markup",()=>{
    // Word desktop: `<sup>` and a MsoFootnoteReference class rule; Word Online / Docs: inline vertical-align spans.
    const word='<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style><!--span.MsoFootnoteReference{vertical-align:super}--></style></head><body>'+
      '<p class=MsoNormal>H<sub><span style=\'font-size:11.0pt\'>2</span></sub>O and E=mc<sup><span style=\'font-size:11.0pt\'>2</span></sup>'+
      '<a href="#_ftn1"><span class=MsoFootnoteReference>1</span></a></p></body></html>';
    expect(scripts(staging().importHtml(word))).toEqual(["H=","2=sub","O and E=mc=","2=sup","1=sup"]);
    const online='<div class="OutlineElement"><p class="Paragraph"><span class="TextRun" style="font-size: 11pt;"><span class="NormalTextRun">x</span></span>'+
      '<span class="TextRun" style="font-size: 8.5pt; vertical-align: super;"><span class="NormalTextRun">n</span></span>'+
      '<span class="TextRun" style="font-size: 8.5pt; vertical-align: sub;"><span class="NormalTextRun">i</span></span></p></div>';
    expect(scripts(staging().importHtml(online))).toEqual(["x=","n=sup","i=sub"]);
    const docs='<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-size:11pt;vertical-align:baseline;">CO</span>'+
      '<span style="font-size:6.6pt;vertical-align:sub;">2</span><span style="font-size:6.6pt;vertical-align:super;">th</span></p></b>';
    expect(scripts(staging().importHtml(docs))).toEqual(["CO=","2=sub","th=sup"]);
  });
});

describe("subscript/superscript export",()=>{
  const source=clipboard(paragraph(text("H"),text("2",SUB),text("O"),text("n",SUP),text("x",SUB,SUP)));
  it("exports HTML tags and resolves a stored both-script run to superscript",()=>{
    const html=staging().exportHtml(source);
    expect(html).toEqual({ok:true,value:'<p style="white-space:pre-wrap">H<sub>2</sub>O<sup>n</sup><sup>x</sup></p>',losses:[{code:"style-approximation",count:1,effect:"loss"}]});
    const plain=staging().exportHtml(clipboard(paragraph(text("H"),text("2",SUB))));
    expect(plain).toEqual({ok:true,value:'<p style="white-space:pre-wrap">H<sub>2</sub></p>',losses:[]});
  });
  it("exports Markdown as exact sanitized raw HTML with the dialect's feature notice",()=>{
    const md=staging().exportMarkdown(clipboard(paragraph(text("H"),text("2",SUB),text("O"))));
    expect(md).toEqual({ok:true,value:'<p style="white-space:pre-wrap">H<sub>2</sub>O</p>',losses:[{code:"markdown-feature",count:1,effect:"compatibility"}]});
    const both=staging().exportMarkdown(source);if(!both.ok)throw Error(both.error);
    expect(codes(both)).toEqual({"markdown-feature":1,"style-approximation":1});
  });
  it("exports DOCX w:vertAlign, superscript winning a stored conflict",()=>{
    const result=exportDocx(documentJson([paragraph(text("H"),text("2",SUB),text("n",SUP),text("x",SUB,SUP))]));
    if(!result.ok)throw Error(result.error);
    expect(docxRuns(result.value)).toEqual({H:"",2:"subscript",n:"superscript",x:"superscript"});
    expect(codes(result)).toEqual({"style-approximation":1});
  });
  it("keeps both stored literals in the lossless XML export",()=>{
    const owner={supportsClipboardInterchange:()=>true,validateClipboard:(json:string)=>({format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:"flow",structuredJson:json,plainText:""}) } as InterchangeOwner;
    const json=JSON.stringify({document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{},children:[paragraph(text("x",SUB,SUP))]}}});
    const xml=exportXml(owner,json);if(!xml.ok)throw Error(xml.error);
    expect(all(parseXml(xml.value),"breditor:format").map(f=>f.attributes["type"])).toEqual([SUB,SUP]);expect(xml.losses).toEqual([]);
  });
});

describe("subscript/superscript round trips",()=>{
  it("HTML → native → HTML → native is stable",()=>{
    const adapter=staging(),first=adapter.importHtml('<p>H<sub>2</sub>O<sup>n</sup>·<span style="vertical-align:super">m</span></p>');
    if(!first.ok)throw Error(first.error);
    const html=adapter.exportHtml(first.value.structuredJson);if(!html.ok)throw Error(html.error);
    expect(html.value).toContain("<sub>2</sub>");expect(html.losses).toEqual([]);
    expect(scripts(adapter.importHtml(html.value))).toEqual(scripts(first));expect(scripts(first)).toEqual(["H=","2=sub","O=","n=sup","m=sup"]);
  });
  it("a stored conflict converges to superscript after one round trip and then stays fixed",()=>{
    const adapter=staging(),html=adapter.exportHtml(clipboard(paragraph(text("x",SUB,SUP))));if(!html.ok)throw Error(html.error);
    const back=adapter.importHtml(html.value);expect(scripts(back)).toEqual(["x=sup"]);
    if(!back.ok)throw Error(back.error);const again=adapter.exportHtml(back.value.structuredJson);
    expect(again).toEqual({ok:true,value:html.value,losses:[]});
  });
  it("Markdown raw HTML → native → Markdown is stable",()=>{
    const adapter=staging(),first=adapter.importMarkdown("H<sub>2</sub>O and x<sup>2</sup>");
    expect(scripts(first)).toEqual(["H=","2=sub","O and x=","2=sup"]);
    if(!first.ok)throw Error(first.error);
    const md=adapter.exportMarkdown(first.value.structuredJson);if(!md.ok)throw Error(md.error);
    const back=adapter.importMarkdown(md.value);
    expect(runs(back).map(r=>[r.text,r.formats.map(f=>f.type)])).toEqual(runs(first).map(r=>[r.text,r.formats.map(f=>f.type)]));
  });
  it("HTML paste → native → DOCX keeps one vertAlign per run",()=>{
    const first=staging().importHtml('<p>a<sup>b<sub>c</sub></sup>·<span style="vertical-align:sub">d</span></p>');if(!first.ok)throw Error(first.error);
    const root=JSON.parse(first.value.structuredJson).document.root,result=exportDocx(documentJson(root.children));if(!result.ok)throw Error(result.error);
    expect(docxRuns(result.value)).toEqual({a:"",b:"superscript",c:"subscript","·":"",d:"subscript"});expect(result.losses).toEqual([]);
  });
});
