import {describe,it,expect} from "vitest";
import {Buffer} from "node:buffer";
import {readFileSync,writeFileSync} from "node:fs";
import {deflateSync} from "node:zlib";
import {docxContentType,docxImageBindings,docxLimits,exportDocx,exportDocxWithImages,type DocxResult} from "../src/docx.js";
import {crc32} from "../src/docx/zip.js";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
import {all,kids,parseXml,textContent,unzip,type XmlElement} from "./docx_support.js";

// ---- native-shaped fixture builders -------------------------------------------------------
type Json=Record<string,unknown>;
let ids=0;
const el=(type:string,properties:Json={},children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":`b${++ids}`,...Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v]))},children});
const t=(text:string,...formats:Json[])=>({kind:"text",text,formats});
const f=(type:string,properties:Json={})=>({type,properties});
const inline=(local:string,properties:Json={})=>f(local==="strong"?"breditor/strong":`breditor-inline/${local}`,properties);
const p=(...children:unknown[])=>el("paragraph",{},children);
const doc=(...children:unknown[])=>JSON.stringify({format:"breditor/document",formatVersion:2,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}});
const cell=(column:string,header:boolean,...children:unknown[])=>el("table-cell",{"column-id":column,header},children.length?children:[p()]);

/** A real (tiny, valid) PNG so the media part is a renderable image. */
function png(width:number,height:number):Uint8Array {
  const chunk=(type:string,data:Uint8Array)=>{const out=new Uint8Array(12+data.length),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);v.setUint32(8+data.length,crc32(out.subarray(4,8+data.length)));return out;};
  const ihdr=new Uint8Array(13),v=new DataView(ihdr.buffer);v.setUint32(0,width);v.setUint32(4,height);ihdr.set([8,2,0,0,0],8);
  const raw=new Uint8Array(height*(1+3*width));for(let y=0;y<height;y++)for(let x=0;x<width;x++)raw.set([40,95,145],y*(1+3*width)+1+3*x);
  const parts=[new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk("IHDR",ihdr),chunk("IDAT",new Uint8Array(deflateSync(raw))),chunk("IEND",new Uint8Array())];
  const out=new Uint8Array(parts.reduce((s,x)=>s+x.length,0));let at=0;for(const x of parts){out.set(x,at);at+=x.length;}return out;
}
const jpeg=new Uint8Array([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xff,0xc0,0x00,0x11,0x08,0x00,0x30,0x00,0x40,0x03,0x01,0x22,0x00,0x02,0x11,0x01,0x03,0x11,0x01,0xff,0xd9]);
const webp=new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
const PNG=png(8,4);

function everyNode():string {
  ids=0;
  const mention=f("breditor/mention",{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":"Ada"});
  return doc(
    ...[1,2,3,4,5,6].map(level=>el("heading",{level},[t(`Heading ${level}`)])),
    el("paragraph",{"block-align":2,"block-indent":1,"line-height-percent":150},[
      t("bold",inline("strong")),t(" italic",inline("italic")),t(" under",inline("underline")),t(" strike",inline("strike")),
      t(" code",inline("code")),t(" sub",inline("subscript")),t(" sup",inline("superscript")),
      t(" red",inline("text-color",{"breditor-inline/rgb24":0xff0000})),t(" mark",inline("background-color",{"breditor-inline/rgb24":0xffff00})),
      t(" big",inline("text-size",{"breditor-inline/pixels":24})),t(" serif",inline("font-family",{"breditor-inline/family":3})),
      t(" bonjour",f("breditor/text-language",{"breditor/language-tag":"fr-CA"})),
      t(" link",inline("link",{"breditor-inline/href":"https://example.com/a?b=1&c=2"})),t(" more",inline("link",{"breditor-inline/href":"https://example.com/a?b=1&c=2"}),inline("strong")),
      t(" new",inline("link",{"breditor-inline/href":"https://example.org/","breditor-inline/new-window":true})),
      t(" bad",inline("link",{"breditor-inline/href":"javascript:alert(1)"})),
      t(" "),t("@Ada",mention),t(" glow",f("breditor-inline/glow")),t(" line\nbreak\ttab <&>\"'"),
    ]),
    el("blockquote",{},[p(t("Quoted")),el("bullet-list",{},[el("list-item",{},[p(t("quoted item"))])])]),
    el("code-block",{language:"rust"},[t("fn main() {\n    run();\n}")]),
    el("horizontal-rule"),
    el("bullet-list",{},[
      el("list-item",{},[p(t("one")),p(t("one continued")),el("ordered-list",{start:3,"list-style":4},[el("list-item",{},[p(t("iii"))]),el("list-item",{},[p(t("iv"))])])]),
      el("list-item",{},[p(t("two"))]),
    ]),
    el("ordered-list",{start:5,"list-reversed":true},[el("list-item",{},[p(t("five"))]),el("list-item",{},[p(t("four"))]),el("list-item",{},[p(t("three"))])]),
    el("task-list",{},[el("task-item",{checked:true},[p(t("done"))]),el("task-item",{checked:false},[p(t("todo"))])]),
    el("table",{"table-id":"t","columns":[{id:"a",width:100},{id:"b",width:200},{id:"c",width:50}],merges:[
      {id:"m1",lamport:"1",writer:"1",counter:"1",rows:["r1","r2","r3"],columns:["a","b","c"],"first-row":"r2","last-row":"r3","first-column":"a","last-column":"b"},
    ],"retracted-merges":[]},[
      el("table-row",{"row-id":"r1"},[cell("a",true,p(t("H1"))),cell("b",true,p(t("H2"))),cell("c",true,p(t("H3")))]),
      el("table-row",{"row-id":"r2"},[cell("a",false,p(t("merged"))),cell("b",false,p(t("covered text"))),cell("c",false,p(t("x")))]),
      el("table-row",{"row-id":"r3"},[cell("a",false),cell("b",false),cell("c",true,p(t("y")))]),
      p(t("Table caption")),
    ]),
    el("image",{"image-id":"i1","asset-id":"asset-png","asset-generation":"g1","decorative":false,"alt-text":"A chart","width":340,"height":150,"image-href":"https://example.com/full"},[p(t("Image caption"))]),
    el("image",{"image-id":"i2","asset-id":"asset-png","asset-generation":"g1","decorative":true,"alt-text":""}),
    el("image",{"image-id":"i3","asset-id":"asset-jpeg","asset-generation":"g1","decorative":false,"alt-text":"Photo"}),
    el("image",{"image-id":"i4","asset-id":"missing","asset-generation":"g1","decorative":false,"alt-text":"Missing picture"}),
    el("image",{"image-id":"i5","asset-id":"asset-webp","asset-generation":"g1","decorative":false,"alt-text":"Modern format"}),
    el("details",{"details-open":true},[el("details-summary",{},[t("Section title")]),p(t("Section body"))]),
    el("page-break"),
    el("future-widget",{},[t("future text")]),
    p(t("End")),
  );
}
const images=new Map([["asset-png",PNG],["asset-jpeg",jpeg],["asset-webp",webp]]);
const image=(b:{asset:string})=>images.get(b.asset);
function ok(result:DocxResult<Uint8Array>):Uint8Array{if(!result.ok)throw Error(result.error);return result.value;}
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
function open(bytes:Uint8Array){
  const files=unzip(bytes),part=new Map(files.map(file=>[file.name,file.data]));
  const xml=(name:string):XmlElement=>{const data=part.get(name);if(!data)throw Error(`missing ${name}`);return parseXml(new TextDecoder("utf-8",{fatal:true}).decode(data));};
  return{files,part,xml};
}
const paragraphs=(document:XmlElement)=>all(document,"w:p");
const styleOf=(para:XmlElement)=>kids(para,"w:pPr").flatMap(pp=>kids(pp,"w:pStyle"))[0]?.attributes["w:val"];
const findParagraph=(document:XmlElement,text:string)=>{const found=paragraphs(document).find(x=>textContent(x)===text);if(!found)throw Error(`no paragraph ${JSON.stringify(text)}`);return found;};

describe("DOCX export (@breditor/interchange/docx)",()=>{
  it("writes a well-formed OPC package with every part well-formed and related",()=>{
    const result=exportDocx(everyNode(),{image,title:"Fixture <&>",language:"en-US"}),{files,xml,part}=open(ok(result));
    expect(files.map(file=>file.name)).toEqual(["[Content_Types].xml","_rels/.rels","docProps/core.xml","docProps/app.xml","word/document.xml","word/styles.xml","word/numbering.xml","word/settings.xml","word/_rels/document.xml.rels","word/media/image1.png","word/media/image2.jpeg"]);
    for(const file of files){expect(file.method).toBe(0);expect(file.date).toBe(0x21);expect(file.time).toBe(0);if(file.name.endsWith(".xml")||file.name.endsWith(".rels"))xml(file.name);}
    const types=xml("[Content_Types].xml");
    expect(kids(types,"Default").map(d=>d.attributes["Extension"])).toEqual(["rels","xml","jpeg","png"]);
    const overrides=new Set(kids(types,"Override").map(o=>o.attributes["PartName"]));
    for(const name of files.map(file=>`/${file.name}`).filter(n=>n.endsWith(".xml")&&n!=="/[Content_Types].xml"))expect(overrides.has(name)).toBe(true);
    // Every internal relationship target exists in the package.
    const root=kids(xml("_rels/.rels"),"Relationship");expect(root.map(r=>r.attributes["Target"])).toEqual(["word/document.xml","docProps/core.xml","docProps/app.xml"]);
    const rels=kids(xml("word/_rels/document.xml.rels"),"Relationship");
    for(const r of rels)if(r.attributes["TargetMode"]!=="External")expect(part.has(`word/${r.attributes["Target"]}`)).toBe(true);
    expect(new Set(rels.map(r=>r.attributes["Id"])).size).toBe(rels.length);
    expect(textContent(all(xml("docProps/core.xml"),"dc:title")[0]!)).toBe("Fixture <&>");
    expect(all(xml("word/styles.xml"),"w:lang")[0]!.attributes["w:val"]).toBe("en-US");
    expect(docxContentType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });
  it("maps every native node type and reports each unrepresentable feature",()=>{
    const result=exportDocx(everyNode(),{image}),{xml,part}=open(ok(result)),document=xml("word/document.xml"),rels=new Map(kids(xml("word/_rels/document.xml.rels"),"Relationship").map(r=>[r.attributes["Id"],r.attributes]));
    expect(codes(result)).toEqual({
      "block-structure":1,"image-format":1,"image-reference":1,"list-numbering":1,"mention-entity":1,
      "style-approximation":3,"table-geometry":1,"unsafe-link":1,"unsupported-attribute":1,"unsupported-element":1,"unsupported-style":1,
    });
    expect(result.losses.every(l=>l.effect==="loss")).toBe(true);
    // Headings → built-in Heading styles with outline levels.
    for(const level of [1,2,3,4,5,6])expect(styleOf(findParagraph(document,`Heading ${level}`))).toBe(`Heading${level}`);
    const styles=xml("word/styles.xml"),styleIds=new Set(all(styles,"w:style").map(s=>s.attributes["w:styleId"]));
    for(const para of paragraphs(document)){const s=styleOf(para);if(s)expect(styleIds.has(s)).toBe(true);}
    // Inline formatting and paragraph layout.
    const rich=paragraphs(document).find(x=>textContent(x).startsWith("bold"))!;
    expect(textContent(rich)).toBe("bold italic under strike code sub sup red mark big serif bonjour link more new bad @Ada glow line\nbreak\ttab <&>\"'");
    const props=(text:string)=>{const run=all(rich,"w:r").find(r=>textContent(r)===text);if(!run)throw Error(text);return kids(run,"w:rPr")[0]?.children.map(c=>typeof c==="string"?c:`${c.name}${c.attributes["w:fill"]?`=${c.attributes["w:fill"]}`:c.attributes["w:val"]?`=${c.attributes["w:val"]}`:c.attributes["w:ascii"]?`=${c.attributes["w:ascii"]}`:""}`)??[];};
    expect(props("bold")).toEqual(["w:b","w:bCs"]);expect(props(" italic")).toEqual(["w:i","w:iCs"]);expect(props(" under")).toEqual(["w:u=single"]);
    expect(props(" strike")).toEqual(["w:strike"]);expect(props(" code")).toEqual(["w:rFonts=Courier New"]);
    expect(props(" sub")).toEqual(["w:vertAlign=subscript"]);expect(props(" sup")).toEqual(["w:vertAlign=superscript"]);
    expect(props(" red")).toEqual(["w:color=FF0000"]);expect(props(" mark")).toEqual(["w:shd=FFFF00"]);
    expect(props(" big")).toEqual(["w:sz=36","w:szCs=36"]);expect(props(" serif")).toEqual(["w:rFonts=Times New Roman"]);
    expect(props(" bonjour")).toEqual(["w:lang=fr-CA"]);
    const pPr=kids(rich,"w:pPr")[0]!;expect(kids(pPr).map(c=>c.name)).toEqual(["w:spacing","w:ind","w:jc"]);
    expect(kids(pPr,"w:spacing")[0]!.attributes).toMatchObject({"w:line":"360","w:lineRule":"auto"});expect(kids(pPr,"w:ind")[0]!.attributes["w:left"]).toBe("720");expect(kids(pPr,"w:jc")[0]!.attributes["w:val"]).toBe("center");
    // Contiguous identical links share one hyperlink and one external relationship; unsafe links stay text.
    const links=all(rich,"w:hyperlink");expect(links.map(textContent)).toEqual([" link more"," new"]);
    expect(rels.get(links[0]!.attributes["r:id"])).toMatchObject({Target:"https://example.com/a?b=1&c=2",TargetMode:"External"});
    expect(links[1]!.attributes["w:tgtFrame"]).toBe("_blank");
    expect(all(rich,"w:r").filter(r=>kids(r,"w:rPr").some(x=>kids(x,"w:rStyle").length)).map(textContent)).toEqual([" link"," more"," new"]);
    expect(all(rich,"w:br")).toHaveLength(1);expect(all(rich,"w:tab")).toHaveLength(1);
    // Quote, code, rule, page break and flattened section.
    expect(styleOf(findParagraph(document,"Quoted"))).toBe("Quote");
    const quotedItem=findParagraph(document,"quoted item");expect(all(quotedItem,"w:numId")).toHaveLength(1);expect(all(quotedItem,"w:ind")[0]!.attributes).toMatchObject({"w:left":"1440","w:hanging":"360"});
    const code=findParagraph(document,"fn main() {\n    run();\n}");expect(styleOf(code)).toBe("BreditorCodeBlock");expect(all(code,"w:br")).toHaveLength(2);
    expect(paragraphs(document).filter(x=>styleOf(x)==="BreditorHorizontalRule")).toHaveLength(1);
    expect(all(document,"w:br").filter(b=>b.attributes["w:type"]==="page")).toHaveLength(1);
    expect(styleOf(findParagraph(document,"Section title"))).toBe("BreditorSectionSummary");findParagraph(document,"Section body");
    findParagraph(document,"future text");findParagraph(document,"End");
    // Lists: numbering instances per list, nesting by ilvl, start/format overrides, continuation paragraphs indented.
    const numbering=xml("word/numbering.xml"),abstracts=new Map(all(numbering,"w:abstractNum").map(a=>[a.attributes["w:abstractNumId"],a]));
    const nums=new Map(all(numbering,"w:num").map(n=>[n.attributes["w:numId"],n]));
    const numOf=(text:string)=>{const para=findParagraph(document,text),numId=all(para,"w:numId")[0]?.attributes["w:val"],ilvl=all(para,"w:ilvl")[0]?.attributes["w:val"];if(!numId)return undefined;const num=nums.get(numId)!,abstract=abstracts.get(kids(num,"w:abstractNumId")[0]!.attributes["w:val"])!;
      const lvl=kids(abstract,"w:lvl").find(l=>l.attributes["w:ilvl"]===ilvl)!;return{numId,ilvl,format:kids(lvl,"w:numFmt")[0]!.attributes["w:val"],text:kids(lvl,"w:lvlText")[0]!.attributes["w:val"],start:all(num,"w:startOverride")[0]?.attributes["w:val"]};};
    expect(numOf("one")).toMatchObject({ilvl:"0",format:"bullet",text:"•"});expect(numOf("two")!.numId).toBe(numOf("one")!.numId);
    expect(numOf("one continued")).toBeUndefined();expect(all(findParagraph(document,"one continued"),"w:ind")[0]!.attributes["w:left"]).toBe("720");
    expect(numOf("iii")).toMatchObject({ilvl:"1",format:"lowerRoman",text:"%2.",start:"3"});expect(numOf("iv")!.numId).toBe(numOf("iii")!.numId);
    const descending=[numOf("five"),numOf("four"),numOf("three")];
    expect(descending.map(num=>[num?.ilvl,num?.format,num?.start])).toEqual([
      ["0","decimal","5"],["0","decimal","4"],["0","decimal","3"],
    ]);
    expect(new Set(descending.map(num=>num?.numId)).size).toBe(3);
    expect(numOf("done")).toMatchObject({format:"bullet",text:"☒"});expect(numOf("todo")).toMatchObject({format:"bullet",text:"☐"});
    // Table: grid widths in twips, header row, horizontal + vertical merge, covered text kept in the merged cell, caption above.
    const table=all(document,"w:tbl")[0]!;
    expect(all(table,"w:gridCol").map(g=>g.attributes["w:w"])).toEqual(["1500","3000","750"]);
    const rows=kids(table,"w:tr");expect(rows).toHaveLength(3);expect(all(rows[0]!,"w:tblHeader")).toHaveLength(1);expect(all(rows[1]!,"w:tblHeader")).toHaveLength(0);
    const tcs=rows.map(r=>kids(r,"w:tc"));expect(tcs.map(r=>r.length)).toEqual([3,2,2]);
    expect(all(tcs[1]![0]!,"w:gridSpan")[0]!.attributes["w:val"]).toBe("2");expect(all(tcs[1]![0]!,"w:vMerge")[0]!.attributes["w:val"]).toBe("restart");
    expect(all(tcs[2]![0]!,"w:vMerge")[0]!.attributes["w:val"]).toBeUndefined();expect(all(tcs[2]![0]!,"w:gridSpan")[0]!.attributes["w:val"]).toBe("2");
    expect(all(tcs[1]![0]!,"w:p").map(textContent)).toEqual(["merged","covered text"]);
    expect(all(tcs[1]![0]!,"w:tcW")[0]!.attributes["w:w"]).toBe("4500");
    for(const row of tcs)for(const tc of row){const last=tc.children.filter(c=>typeof c!=="string").at(-1) as XmlElement;expect(last.name).toBe("w:p");}
    const body=kids(kids(document,"w:body")[0]!),tableIndex=body.indexOf(table);
    expect(textContent(body[tableIndex-1]!)).toBe("Table caption");expect(styleOf(body[tableIndex-1]!)).toBe("Caption");
    // Images: deduplicated media, scaled extents, alt/decorative, hyperlink; missing/unsupported keep alt text.
    const drawings=all(document,"w:drawing");expect(drawings).toHaveLength(3);
    const embeds=drawings.map(d=>all(d,"a:blip")[0]!.attributes["r:embed"]);expect(embeds[0]).toBe(embeds[1]);
    expect(rels.get(embeds[0])!["Target"]).toBe("media/image1.png");expect(rels.get(embeds[2])!["Target"]).toBe("media/image2.jpeg");
    expect([...part.get("word/media/image1.png")!]).toEqual([...PNG]);
    expect(all(drawings[0]!,"wp:extent")[0]!.attributes).toEqual({cx:String(340*9525),cy:String(150*9525)});
    expect(all(drawings[1]!,"wp:extent")[0]!.attributes).toEqual({cx:String(8*9525),cy:String(4*9525)});
    expect(all(drawings[2]!,"wp:extent")[0]!.attributes).toEqual({cx:String(64*9525),cy:String(48*9525)});
    expect(all(drawings[0]!,"wp:docPr")[0]!.attributes["descr"]).toBe("A chart");expect(all(drawings[1]!,"adec:decorative")).toHaveLength(1);
    expect(new Set(all(document,"wp:docPr").map(d=>d.attributes["id"])).size).toBe(3);
    const imageLink=all(document,"w:hyperlink").find(h=>all(h,"w:drawing").length)!;expect(rels.get(imageLink.attributes["r:id"])!["Target"]).toBe("https://example.com/full");
    expect(styleOf(findParagraph(document,"Image caption"))).toBe("Caption");findParagraph(document,"Missing picture");findParagraph(document,"Modern format");
  });
  it("is deterministic and independent of the accepted envelope",()=>{
    const source=everyNode(),a=ok(exportDocx(source,{image})),b=ok(exportDocx(source,{image}));
    // Optional manual fidelity check (e.g. `textutil`/LibreOffice/Word): BREDITOR_DOCX_DUMP=/path/out.docx
    const dump=process.env["BREDITOR_DOCX_DUMP"];if(dump)writeFileSync(dump,a);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const record=JSON.parse(source) as {root:unknown};
    expect(Buffer.from(ok(exportDocx(JSON.stringify(record.root),{image}))).equals(Buffer.from(a))).toBe(true);
    expect(Buffer.from(ok(exportDocx(JSON.stringify({kind:"flow",document:{root:record.root}}),{image}))).equals(Buffer.from(a))).toBe(true);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("exports an empty document as one empty paragraph and a trailing table with a closing paragraph",()=>{
    const empty=open(ok(exportDocx(doc()))).xml("word/document.xml");expect(kids(kids(empty,"w:body")[0]!).map(c=>c.name)).toEqual(["w:p","w:sectPr"]);
    const table=el("table",{"table-id":"t",columns:[{id:"a",width:120}],merges:[],"retracted-merges":[]},[el("table-row",{"row-id":"r"},[cell("a",false,p(t("x")))])]);
    const xml=open(ok(exportDocx(doc(table)))).xml("word/document.xml");expect(kids(kids(xml,"w:body")[0]!).map(c=>c.name)).toEqual(["w:tbl","w:p","w:sectPr"]);
  });
  it("rejects malformed input and enforces bounds",()=>{
    const error=(r:DocxResult<unknown>)=>r.ok?"ok":r.error;
    expect(error(exportDocx("{"))).toBe("invalid-source");
    expect(error(exportDocx(JSON.stringify({kind:"element",type:"breditor/paragraph",properties:{},children:[]})))).toBe("invalid-source");
    expect(error(exportDocx(doc({kind:"text",text:"\ud800",formats:[]})))).toBe("invalid-source");
    expect(error(exportDocx(doc({kind:"element",type:"breditor/paragraph",properties:{},children:"x"})))).toBe("invalid-source");
    expect(error(exportDocx(42 as unknown as string))).toBe("invalid-source");
    expect(error(exportDocx(" ".repeat(docxLimits.documentChars+1)))).toBe("resource-limit");
    let deep:unknown=p(t("deep"));for(let i=0;i<docxLimits.depth+2;i++)deep=el("blockquote",{},[deep]);
    expect(error(exportDocx(doc(deep)))).toBe("resource-limit");
    expect(error(exportDocx(doc(...Array.from({length:docxLimits.nodes+1},()=>p()))))).toBe("resource-limit");
    const rows=Array.from({length:docxLimits.rows+1},(_,i)=>el("table-row",{"row-id":`r${i}`},[cell("a",false)]));
    expect(error(exportDocx(doc(el("table",{"table-id":"t",columns:[{id:"a",width:120}],merges:[],"retracted-merges":[]},rows))))).toBe("resource-limit");
    const pic=el("image",{"image-id":"i","asset-id":"a","asset-generation":"g","decorative":false,"alt-text":"x"});
    expect(error(exportDocx(doc(pic),{image:()=>{throw Error("host");}}))).toBe("asset-policy");
    expect(error(exportDocx(doc(pic),{image:()=>"bytes" as unknown as Uint8Array}))).toBe("asset-policy");
    expect(error(exportDocx(doc(pic),{image:()=>new Uint8Array(docxLimits.imageBytes+1)}))).toBe("resource-limit");
    expect(error(exportDocx(doc(),{title:"x".repeat(1025)}))).toBe("invalid-source");
    expect(error(exportDocx(doc(),{pageSize:"legal" as "a4"}))).toBe("invalid-source");
    const badMerge=el("table",{"table-id":"t",columns:[{id:"a",width:120}],merges:[{"first-row":"zz","last-row":"r","first-column":"a","last-column":"a"}],"retracted-merges":[]},[el("table-row",{"row-id":"r"},[cell("a",false)])]);
    expect(error(exportDocx(doc(badMerge)))).toBe("invalid-source");
  });
  it("escapes text and strips XML-invalid controls with a report",()=>{
    const result=exportDocx(doc(p(t("a\u0001b\u000bc\rd]]></w:t><x>&amp;")),el("image",{"image-id":"i","asset-id":"a","asset-generation":"g","decorative":false,"alt-text":"q\"<'\u0002"})),{image:()=>PNG});
    const {xml}=open(ok(result)),document=xml("word/document.xml");
    findParagraph(document,"abcd]]></w:t><x>&amp;");expect(all(document,"wp:docPr")[0]!.attributes["descr"]).toBe("q\"<'");
    expect(codes(result)).toEqual({"removed-content":4});
  });
  it("collects bindings and loads bytes asynchronously in document order",async()=>{
    ids=0;const pic=(asset:string)=>el("image",{"image-id":asset,"asset-id":asset,"asset-generation":"g","decorative":false,"alt-text":asset});
    const source=doc(pic("b"),pic("a"),pic("b"),pic("c"));
    const bindings=docxImageBindings(source);expect(bindings.ok&&bindings.value).toEqual([{asset:"b",generation:"g"},{asset:"a",generation:"g"},{asset:"c",generation:"g"}]);
    const order:string[]=[];
    const result=await exportDocxWithImages(source,{loadImage:async binding=>{order.push(binding.asset);return binding.asset==="a"?new Blob([PNG.slice()]):binding.asset==="b"?PNG.slice().buffer:undefined;}});
    expect(order).toEqual(["b","a","c"]);expect(codes(result)).toEqual({"image-reference":1});
    const {files}=open(ok(result));expect(files.filter(file=>file.name.startsWith("word/media/")).map(file=>file.name)).toEqual(["word/media/image1.png","word/media/image2.png"]);
    expect((await exportDocxWithImages(source,{loadImage:()=>{throw Error("x");}})).ok).toBe(false);
  });
  it("refuses invalid page options before contacting an async image provider",async()=>{
    const source=doc(el("image",{"image-id":"i","asset-id":"a","asset-generation":"g","decorative":false,"alt-text":"x"}));
    let calls=0;
    const loadImage=()=>{calls++;return PNG;};
    for(const options of [{pageSize:"legal" as "a4"},{title:"x".repeat(1025)}]){
      await expect(exportDocxWithImages(source,{...options,loadImage})).resolves.toEqual({ok:false,error:"invalid-source",losses:[]});
    }
    expect(calls).toBe(0);
  });
  it.each(["sync","async"] as const)("preserves exact media when the %s loader reuses a Buffer",async mode=>{
    const pic=(asset:string)=>el("image",{"image-id":asset,"asset-id":asset,"asset-generation":"g","decorative":false,"alt-text":asset});
    const source=doc(pic("png"),pic("jpeg"));
    const scratch=Buffer.alloc(Math.max(PNG.length,jpeg.length)+2);
    const load=({asset}:{asset:string})=>{
      const bytes=asset==="png"?PNG:jpeg;
      const view=scratch.subarray(1,1+bytes.length);
      view.set(bytes);
      return view;
    };
    const result=mode==="sync"?exportDocx(source,{image:load}):await exportDocxWithImages(source,{loadImage:load});
    const {part}=open(ok(result));
    expect(result.losses).toEqual([]);
    expect(part.get("word/media/image1.png")).toEqual(PNG);
    expect(part.get("word/media/image2.jpeg")).toEqual(jpeg);
  });
  it("reports detached image buffers and views as asset policy failures",async()=>{
    const source=doc(el("image",{"image-id":"i","asset-id":"asset","asset-generation":"g","decorative":false,"alt-text":"Chart"}));
    const buffer=new ArrayBuffer(8),view=new Uint8Array(buffer);
    structuredClone(buffer,{transfer:[buffer]});
    expect(buffer.byteLength).toBe(0);
    for(const value of [buffer,view]){
      await expect(exportDocxWithImages(source,{loadImage:()=>value})).resolves.toEqual({ok:false,error:"asset-policy",losses:[]});
    }
  });
  it("exports documents produced by the HTML importer from real producer markup",()=>{
    const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:"flow",structuredJson:source,plainText:""};}};
    const interchange=createRichInterchange(owner);
    for(const name of ["word.html","google-docs.html","excel.html"]){
      const imported=interchange.importHtml(readFileSync(new URL(`./fixtures/${name}`,import.meta.url),"utf8"));if(!imported.ok)throw Error(imported.error);
      const result=exportDocx(imported.value.structuredJson),{files,xml}=open(ok(result));
      for(const file of files)if(file.name.endsWith(".xml")||file.name.endsWith(".rels"))xml(file.name);
      expect(paragraphs(xml("word/document.xml")).length).toBeGreaterThan(0);
    }
  });
  it("keeps the DOCX entry free of the HTML/Markdown parser graph",()=>{
    const seen=new Set<string>(),visit=(path:string)=>{if(seen.has(path))return;seen.add(path);const source=readFileSync(new URL(`../src/${path}`,import.meta.url),"utf8");
      for(const m of source.matchAll(/^import\s[^;]*?from\s*"([^"]+)"/gm)){const spec=m[1]!;expect(spec.startsWith(".")).toBe(true);const dir=path.includes("/")?path.slice(0,path.lastIndexOf("/")+1):"";visit(new URL(spec.replace(/\.js$/,".ts"),`file:///${dir}`).pathname.slice(1));}};
    visit("docx.ts");
    expect([...seen].sort()).toEqual(["bookmark.ts","budget.ts","docx.ts","docx/convert.ts","docx/image.ts","docx/parts.ts","docx/zip.ts","image_link_href.ts","language_tag.ts","mention.ts","ruby.ts","safe_url.ts","types.ts","wire.ts"]);
  });
});
