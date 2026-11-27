import {describe,it,expect} from "vitest";
import {readFileSync,writeFileSync} from "node:fs";
import {deflateSync} from "node:zlib";
import {epubContentType,epubImageBindings,epubLimits,exportEpub,exportEpubWithImages,type EpubExportOptions,type EpubResult} from "../src/epub.js";
import {crc32} from "../src/docx/zip.js";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
import {all,kids,parseXml,unzip,type XmlElement} from "./docx_support.js";

// ---- native-shaped fixture builders (same shapes as the DOCX tests) -------------------------
type Json=Record<string,unknown>;
let ids=0;
const el=(type:string,properties:Json={},children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":`b${++ids}`,...Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v]))},children});
const t=(text:string,...formats:Json[])=>({kind:"text",text,formats});
const f=(type:string,properties:Json={})=>({type,properties});
const inline=(local:string,properties:Json={})=>f(local==="strong"?"breditor/strong":`breditor-inline/${local}`,properties);
const p=(...children:unknown[])=>el("paragraph",{},children);
const h=(level:number,text:string,properties:Json={})=>el("heading",{level,...properties},[t(text)]);
const rootOf=(children:unknown[])=>({kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children});
const doc=(...children:unknown[])=>JSON.stringify({format:"breditor/document",formatVersion:2,root:rootOf(children)});
const cell=(column:string,header:boolean,...children:unknown[])=>el("table-cell",{"column-id":column,header},children.length?children:[p()]);
const pic=(asset:string,extra:Json={})=>el("image",{"image-id":asset,"asset-id":asset,"asset-generation":"g","decorative":false,"alt-text":`alt ${asset}`,...extra});

function png(width:number,height:number):Uint8Array {
  const chunk=(type:string,data:Uint8Array)=>{const out=new Uint8Array(12+data.length),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);v.setUint32(8+data.length,crc32(out.subarray(4,8+data.length)));return out;};
  const ihdr=new Uint8Array(13),v=new DataView(ihdr.buffer);v.setUint32(0,width);v.setUint32(4,height);ihdr.set([8,2,0,0,0],8);
  const raw=new Uint8Array(height*(1+3*width));for(let y=0;y<height;y++)for(let x=0;x<width;x++)raw.set([40,95,145],y*(1+3*width)+1+3*x);
  const parts=[new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk("IHDR",ihdr),chunk("IDAT",new Uint8Array(deflateSync(raw))),chunk("IEND",new Uint8Array())];
  const out=new Uint8Array(parts.reduce((s,x)=>s+x.length,0));let at=0;for(const x of parts){out.set(x,at);at+=x.length;}return out;
}
const PNG=png(8,4);
const jpeg=new Uint8Array([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xff,0xc0,0x00,0x11,0x08,0x00,0x30,0x00,0x40,0x03,0x01,0x22,0x00,0x02,0x11,0x01,0x03,0x11,0x01,0xff,0xd9]);
const webp=new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
const images=new Map([["asset-png",PNG],["asset-jpeg",jpeg],["asset-webp",webp]]);
const meta={title:"A <Book> & more",language:"en-US",identifier:"urn:uuid:5e1f3c2a-0000-4000-8000-000000000001",author:"Ada Lovelace",modified:"2026-11-27T12:00:00Z"} as const satisfies EpubExportOptions;
const options:EpubExportOptions={...meta,split:"heading-1-and-page-break",image:b=>images.get(b.asset)};

function everyNode():string {
  ids=0;
  const mention=f("breditor/mention",{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":"Ada"});
  return doc(
    p(t("Front matter before the first heading")),
    h(1,"Chapter One",{bookmark:"one"}),
    el("paragraph",{"block-align":2,"block-indent":1,"line-height-percent":150},[
      t("bold",inline("strong")),t(" italic",inline("italic")),t(" under",inline("underline")),t(" strike",inline("strike")),
      t(" code",inline("code")),t(" sub",inline("subscript")),t(" sup",inline("superscript")),
      t(" red",inline("text-color",{"breditor-inline/rgb24":0xff0000})),t(" big",inline("text-size",{"breditor-inline/pixels":24})),
      t(" bonjour",f("breditor/text-language",{"breditor/language-tag":"fr-CA"})),
      t(" link",inline("link",{"breditor-inline/href":"https://example.com/a?b=1&c=2"})),
      t(" new",inline("link",{"breditor-inline/href":"https://example.org/","breditor-inline/new-window":true})),
      t(" bad",inline("link",{"breditor-inline/href":"javascript:alert(1)"})),
      t(" to two",inline("link",{"breditor-inline/href":"#two","breditor-inline/new-window":false})),
      t(" "),t("@Ada",mention),t(" glow",f("breditor-inline/glow")),t(" line\nbreak\ttab <&>\"'"),
    ]),
    h(2,"Section 1.1"),
    el("blockquote",{},[p(t("Quoted")),el("bullet-list",{},[el("list-item",{},[p(t("quoted item"))])])]),
    el("code-block",{language:"rust"},[t("fn main() {\n    run();\n}")]),
    el("horizontal-rule"),
    el("ordered-list",{start:5,"list-reversed":true,"list-style":2},[el("list-item",{},[p(t("five"))]),el("list-item",{},[p(t("four"))])]),
    el("task-list",{},[el("task-item",{checked:true},[p(t("done"))]),el("task-item",{checked:false},[p(t("todo"))])]),
    h(1,"Chapter Two",{bookmark:"two"}),
    p(t("back to one",inline("link",{"breditor-inline/href":"#one","breditor-inline/new-window":false}))),
    el("table",{"table-id":"t","columns":[{id:"a",width:100},{id:"b",width:200}],merges:[
      {id:"m1",lamport:"1",writer:"1",counter:"1",rows:["r1","r2"],columns:["a","b"],"first-row":"r2","last-row":"r2","first-column":"a","last-column":"b"},
    ],"retracted-merges":[]},[
      el("table-row",{"row-id":"r1"},[cell("a",true,p(t("H1"))),cell("b",true,p(t("H2")))]),
      el("table-row",{"row-id":"r2"},[cell("a",false,p(t("merged"))),cell("b",false)]),
      p(t("Table caption")),
    ]),
    pic("asset-png",{width:340,height:150,"image-href":"https://example.com/full"}),
    pic("asset-png"),pic("asset-jpeg"),pic("missing"),pic("asset-webp"),
    el("details",{"details-open":true},[el("details-summary",{},[t("Summary")]),p(t("Hidden body"))]),
    el("page-break"),
    h(3,"Deep heading"),
    el("future-widget",{},[t("future text")]),
    p(t("End")),
  );
}
function ok(result:EpubResult<Uint8Array>):Uint8Array{if(!result.ok)throw Error(`${result.error} ${JSON.stringify(result.losses)}`);return result.value;}
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
const decoder=new TextDecoder("utf-8",{fatal:true});
function open(bytes:Uint8Array){
  const files=unzip(bytes),part=new Map(files.map(file=>[file.name,file.data]));
  const xml=(name:string):XmlElement=>{const data=part.get(name);if(!data)throw Error(`missing ${name}`);return parseXml(decoder.decode(data));};
  return {files,part,xml,text:(name:string)=>decoder.decode(part.get(name)!)};
}
function collectIds(root:XmlElement):string[]{const out:string[]=[];const walk=(e:XmlElement)=>{if(e.attributes["id"]!==undefined)out.push(e.attributes["id"]);for(const c of e.children)if(typeof c!=="string")walk(c);};walk(root);return out;}
const text=(e:XmlElement):string=>e.children.map(c=>typeof c==="string"?c:text(c)).join("");

describe("EPUB 3 export",()=>{
  it("writes an OCF container with mimetype first, stored and without extra fields",()=>{
    const bytes=ok(exportEpub(everyNode(),options)),{files}=open(bytes);
    expect(files[0]).toMatchObject({name:"mimetype",method:0});
    expect(decoder.decode(files[0]!.data)).toBe(epubContentType);
    // Local header at offset 0: name length 8, extra length 0, then the literal name and bytes.
    const v=new DataView(bytes.buffer,bytes.byteOffset);
    expect([v.getUint32(0,true),v.getUint16(8,true),v.getUint16(26,true),v.getUint16(28,true)]).toEqual([0x04034b50,0,8,0]);
    expect(decoder.decode(bytes.subarray(30,38+epubContentType.length))).toBe(`mimetype${epubContentType}`);
    for(const file of files)expect([file.method,file.time,file.date]).toEqual([0,0,0x21]);
    expect(files.map(file=>file.name)).toEqual([
      "mimetype","META-INF/container.xml","EPUB/package.opf","EPUB/nav.xhtml","EPUB/style.css",
      "EPUB/chapter-1.xhtml","EPUB/chapter-2.xhtml","EPUB/chapter-3.xhtml","EPUB/chapter-4.xhtml",
      "EPUB/images/image-1.png","EPUB/images/image-2.jpg",
    ]);
  });
  it("produces well-formed package, navigation and content documents that reference each other",()=>{
    const result=exportEpub(everyNode(),options),{files,part,xml}=open(ok(result));
    for(const file of files)if(/\.(xml|opf|xhtml)$/.test(file.name))expect(()=>xml(file.name),file.name).not.toThrow();
    const container=xml("META-INF/container.xml");
    expect(all(container,"rootfile")[0]!.attributes).toEqual({"full-path":"EPUB/package.opf","media-type":"application/oebps-package+xml"});
    const opf=xml("EPUB/package.opf");
    expect(opf.attributes).toMatchObject({version:"3.0","unique-identifier":"pub-id","xml:lang":"en-US"});
    const metadata=kids(opf,"metadata")[0]!;
    expect(Object.fromEntries(kids(metadata).map(e=>[e.name==="meta"?e.attributes["property"]!:e.name,text(e)]))).toEqual({
      "dc:identifier":meta.identifier,"dc:title":meta.title,"dc:language":"en-US","dc:creator":"Ada Lovelace","dcterms:modified":meta.modified,
    });
    expect(kids(metadata,"dc:identifier")[0]!.attributes["id"]).toBe("pub-id");
    // Every manifest item exists in the container; every package file is in the manifest.
    const items=all(opf,"item"),manifest=new Map(items.map(i=>[i.attributes["id"]!,i.attributes]));
    expect(new Set(items.map(i=>`EPUB/${i.attributes["href"]}`))).toEqual(new Set(files.map(file=>file.name).filter(name=>name.startsWith("EPUB/")&&name!=="EPUB/package.opf")));
    expect(manifest.get("nav")).toMatchObject({href:"nav.xhtml",properties:"nav","media-type":"application/xhtml+xml"});
    expect(manifest.get("image-1")).toMatchObject({href:"images/image-1.png","media-type":"image/png"});
    expect(manifest.get("image-2")).toMatchObject({href:"images/image-2.jpg","media-type":"image/jpeg"});
    expect(all(opf,"itemref").map(i=>i.attributes["idref"])).toEqual(["chapter-1","chapter-2","chapter-3","chapter-4"]);
    expect(part.get("EPUB/images/image-1.png")).toEqual(PNG);
    // Navigation: nested by heading level, every target resolves to an id in its content document.
    const nav=xml("EPUB/nav.xhtml"),toc=all(nav,"nav")[0]!;
    expect(toc.attributes).toMatchObject({"epub:type":"toc",id:"toc"});
    const top=kids(kids(toc,"ol")[0]!,"li");
    expect(top.map(li=>text(kids(li,"a")[0]!))).toEqual(["Chapter One","Chapter Two"]);
    expect(kids(kids(top[0]!,"ol")[0]!,"li").map(li=>text(kids(li,"a")[0]!))).toEqual(["Section 1.1"]);
    expect(kids(kids(top[1]!,"ol")[0]!,"li").map(li=>text(kids(li,"a")[0]!))).toEqual(["Deep heading"]);
    for(const a of all(toc,"a")){
      const [file,id]=a.attributes["href"]!.split("#") as [string,string];
      expect(collectIds(xml(`EPUB/${file}`))).toContain(id);
    }
    expect(all(toc,"a").map(a=>a.attributes["href"])).toEqual(["chapter-2.xhtml#bm-one","chapter-2.xhtml#heading-1","chapter-3.xhtml#bm-two","chapter-4.xhtml#heading-2"]);
    // Content: front matter, split before each heading 1 and at the page break (consumed).
    const chapter=(n:number)=>xml(`EPUB/chapter-${n}.xhtml`);
    expect(chapter(1).attributes).toMatchObject({xmlns:"http://www.w3.org/1999/xhtml",lang:"en-US","xml:lang":"en-US"});
    expect(text(all(chapter(1),"title")[0]!)).toBe(meta.title);
    expect(all(chapter(1),"link")[0]!.attributes).toMatchObject({rel:"stylesheet",href:"style.css"});
    expect(text(all(chapter(1),"body")[0]!)).toBe("Front matter before the first heading");
    expect(all(chapter(3),"div").filter(d=>d.attributes["style"]?.includes("break-after"))).toEqual([]);
    expect(all(chapter(4),"h3")[0]!.attributes["id"]).toBe("heading-2");
    // Internal links point across content documents.
    const links=(n:number)=>all(chapter(n),"a").map(a=>a.attributes["href"]);
    expect(links(2)).toContain("chapter-3.xhtml#bm-two");
    expect(links(3)).toContain("chapter-2.xhtml#bm-one");
    expect(links(2)).not.toContain("javascript:alert(1)");
    // XHTML serialization of HTML-only syntax.
    const c2=chapter(2),c3=chapter(3);
    expect(all(c2,"input").map(i=>i.attributes)).toEqual([{type:"checkbox",disabled:"disabled",checked:"checked"},{type:"checkbox",disabled:"disabled"}]);
    expect(all(c2,"ol")[0]!.attributes).toEqual({start:"5",type:"a",reversed:"reversed"});
    expect(all(c2,"hr")).toHaveLength(1);
    expect(all(c3,"col").map(c=>c.attributes)).toEqual([{style:"width:100px"},{style:"width:200px"}]);
    expect(all(c3,"details")[0]!.attributes).toEqual({open:"open"});
    expect(all(c3,"img").map(i=>i.attributes["src"])).toEqual(["images/image-1.png","images/image-1.png","images/image-2.jpg"]);
    expect(all(c3,"td")[0]!.attributes).toMatchObject({rowspan:"1",colspan:"2"});
    expect(text(all(c2,"p").find(x=>text(x).startsWith("bold"))!)).toContain(" line\nbreak\ttab <&>\"'");
    expect(all(c2,"span").some(s=>s.attributes["class"]==="breditor-mention"&&s.attributes["data-mention-id"]==="u-1")).toBe(true);
    // Every unsupported feature is a notice; WebP is reported as a format loss, not a missing image.
    expect(codes(result)).toEqual({"block-structure":1,"image-format":1,"image-reference":1,"unsafe-link":1,"unsupported-element":1,"unsupported-style":1});
    expect(result.losses.every(l=>l.effect==="loss")).toBe(true);
    if(process.env["BREDITOR_EPUB_DUMP"])writeFileSync(process.env["BREDITOR_EPUB_DUMP"],ok(result));
  });
  it("is byte-for-byte deterministic across runs and input envelopes",()=>{
    const first=ok(exportEpub(everyNode(),options)),second=ok(exportEpub(everyNode(),options));
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    const root=JSON.parse(everyNode()).root;
    for(const envelope of [root,{root},{document:{root}}])expect(Buffer.from(ok(exportEpub(JSON.stringify(envelope),options))).equals(Buffer.from(first))).toBe(true);
    expect(Buffer.from(ok(exportEpub(everyNode(),{...options,modified:"2026-11-28T00:00:00Z"}))).equals(Buffer.from(first))).toBe(false);
  });
  it.each([
    ["none",["chapter-1.xhtml"]],
    ["page-break",["chapter-1.xhtml","chapter-2.xhtml"]],
    ["heading-1",["chapter-1.xhtml","chapter-2.xhtml","chapter-3.xhtml"]],
    ["heading-1-and-page-break",["chapter-1.xhtml","chapter-2.xhtml","chapter-3.xhtml","chapter-4.xhtml"]],
  ] as const)("splits content documents with split=%s",(split,expected)=>{
    const {files,xml}=open(ok(exportEpub(everyNode(),{...options,split})));
    expect(files.filter(file=>/chapter-\d+\.xhtml$/.test(file.name)).map(file=>file.name.slice(5))).toEqual(expected);
    const breaks=expected.flatMap(name=>all(xml(`EPUB/${name}`),"div").filter(d=>d.attributes["style"]?.includes("break-after:page")));
    expect(breaks).toHaveLength(split==="none"||split==="heading-1"?1:0);
    // Internal links always resolve inside the publication.
    for(const name of expected)for(const a of all(xml(`EPUB/${name}`),"a")){
      const href=a.attributes["href"]!;if(href.startsWith("http"))continue;
      const [file,id]=href.split("#") as [string,string];
      expect(collectIds(xml(`EPUB/${file||name}`))).toContain(id);
    }
  });
  it("exports an empty document as one content document with a title navigation entry",()=>{
    const result=exportEpub(doc(),{...meta}),{files,xml}=open(ok(result));
    expect(result.losses).toEqual([]);
    expect(files.map(file=>file.name)).toEqual(["mimetype","META-INF/container.xml","EPUB/package.opf","EPUB/nav.xhtml","EPUB/style.css","EPUB/chapter-1.xhtml"]);
    expect(all(xml("EPUB/nav.xhtml"),"a").map(a=>[a.attributes["href"],text(a)])).toEqual([["chapter-1.xhtml",meta.title]]);
    expect(kids(kids(xml("EPUB/package.opf"),"metadata")[0]!,"dc:creator")).toHaveLength(1);
    const noAuthor=open(ok(exportEpub(doc(p(t("x"))),{title:"T",language:"ja",identifier:"id-1",modified:"2000-02-29T23:59:59Z"})));
    expect(all(noAuthor.xml("EPUB/package.opf"),"dc:creator")).toEqual([]);
  });
  it("drops a dangling internal link but keeps its text",()=>{
    ids=0;
    const result=exportEpub(doc(p(t("nowhere",inline("link",{"breditor-inline/href":"#ghost","breditor-inline/new-window":false})))),meta),{xml}=open(ok(result));
    expect(all(xml("EPUB/chapter-1.xhtml"),"a")).toEqual([]);
    expect(text(all(xml("EPUB/chapter-1.xhtml"),"p")[0]!)).toBe("nowhere");
    expect(codes(result)).toEqual({"unsafe-link":1});
  });
  it("removes XML-invalid characters from text and attributes and reports them",()=>{
    ids=0;
    const result=exportEpub(doc(h(1,"Ti\u0001tle"),p(t("a\u0000b\u000bc\uFFFF")),pic("asset-png",{"alt-text":"al\u0007t"})),options),{xml}=open(ok(result));
    expect(codes(result)).toEqual({"removed-content":5});
    const body=xml("EPUB/chapter-1.xhtml");
    expect(text(all(body,"h1")[0]!)).toBe("Title");expect(text(all(body,"p")[0]!)).toBe("abc");expect(all(body,"img")[0]!.attributes["alt"]).toBe("alt");
    expect(text(all(xml("EPUB/nav.xhtml"),"a")[0]!)).toBe("Title");
  });
  it.each([
    ["missing title",{title:undefined}],["blank title",{title:"   "}],["long title",{title:"x".repeat(1025)}],["control in title",{title:"a\u0007"}],
    ["lone surrogate",{title:"a\uD800"}],["missing language",{language:undefined}],["non-canonical language",{language:"EN_us"}],
    ["missing identifier",{identifier:undefined}],["padded identifier",{identifier:" urn:x "}],["long identifier",{identifier:"x".repeat(257)}],
    ["blank author",{author:""}],["non-string author",{author:7}],
    ["missing modified",{modified:undefined}],["local time",{modified:"2026-11-27T12:00:00"}],["fractional seconds",{modified:"2026-11-27T12:00:00.000Z"}],
    ["impossible date",{modified:"2026-02-30T00:00:00Z"}],["impossible time",{modified:"2026-01-01T24:00:00Z"}],["bad split",{split:"heading-2"}],
  ])("rejects invalid options (%s) before contacting an image provider",async(_name,patch)=>{
    const source=doc(pic("asset-png"));let calls=0;
    const bad={...meta,...patch} as unknown as EpubExportOptions;
    expect(exportEpub(source,{...bad,image:()=>{calls++;return PNG;}})).toEqual({ok:false,error:"invalid-source",losses:[]});
    await expect(exportEpubWithImages(source,{...bad,loadImage:()=>{calls++;return PNG;}})).resolves.toEqual({ok:false,error:"invalid-source",losses:[]});
    expect(calls).toBe(0);
  });
  it("rejects malformed sources and enforces bounds",()=>{
    for(const source of ["","{}","[]",'{"root":{"kind":"element","type":"breditor/paragraph","properties":{},"children":[]}}',
      JSON.stringify({root:rootOf([{kind:"text",text:"\uD800",formats:[]}])}),JSON.stringify({root:rootOf([el("heading",{level:9},[])])})])
      expect(exportEpub(source,meta)).toMatchObject({ok:false,error:"invalid-source"});
    expect(exportEpub("x".repeat(epubLimits.documentChars+1),meta)).toMatchObject({ok:false,error:"resource-limit"});
    let deep:unknown=p(t("x"));for(let i=0;i<=epubLimits.depth+1;i++)deep=el("blockquote",{},[deep]);
    expect(exportEpub(doc(deep),meta)).toMatchObject({ok:false,error:"resource-limit"});
    const many=Array.from({length:epubLimits.chapters+1},(_v,i)=>h(1,`c${i}`));
    expect(exportEpub(doc(...many),meta)).toMatchObject({ok:false,error:"resource-limit"});
    expect(exportEpub(doc(...many.slice(0,epubLimits.chapters)),meta).ok).toBe(true);
    const huge=new Uint8Array(epubLimits.imageBytes+1);
    expect(exportEpub(doc(pic("a")),{...meta,image:()=>huge})).toEqual({ok:false,error:"resource-limit",losses:[]});
  });
  it("loads distinct bindings once in document order and refuses bad host values",async()=>{
    ids=0;const source=doc(pic("b"),pic("a"),pic("b"),pic("c"));
    const bindings=epubImageBindings(source);expect(bindings.ok&&bindings.value).toEqual([{asset:"b",generation:"g"},{asset:"a",generation:"g"},{asset:"c",generation:"g"}]);
    const order:string[]=[];
    const result=await exportEpubWithImages(source,{...meta,loadImage:async binding=>{order.push(binding.asset);return binding.asset==="a"?new Blob([PNG.slice()]):binding.asset==="b"?jpeg.slice().buffer:undefined;}});
    expect(order).toEqual(["b","a","c"]);expect(codes(result)).toEqual({"image-reference":1});
    const {files}=open(ok(result));expect(files.filter(file=>file.name.includes("/images/")).map(file=>file.name)).toEqual(["EPUB/images/image-1.jpg","EPUB/images/image-2.png"]);
    const sync=exportEpub(source,{...meta,image:binding=>binding.asset==="a"?PNG:binding.asset==="b"?jpeg:undefined});
    expect(Buffer.from(ok(sync)).equals(Buffer.from(ok(result)))).toBe(true);
    expect(await exportEpubWithImages(source,{...meta,loadImage:()=>{throw Error("x");}})).toEqual({ok:false,error:"asset-policy",losses:[]});
    expect(await exportEpubWithImages(source,{...meta,loadImage:(()=>"https://x.test/a.png") as never})).toEqual({ok:false,error:"asset-policy",losses:[]});
    expect(exportEpub(source,{...meta,image:(()=>PNG.buffer) as never})).toEqual({ok:false,error:"asset-policy",losses:[]});
    expect(exportEpub(source,{...meta,image:()=>{throw Error("x");}})).toEqual({ok:false,error:"asset-policy",losses:[]});
    const buffer=new ArrayBuffer(8),view=new Uint8Array(buffer);structuredClone(buffer,{transfer:[buffer]});
    for(const value of [buffer,view])expect(await exportEpubWithImages(source,{...meta,loadImage:()=>value})).toEqual({ok:false,error:"asset-policy",losses:[]});
    // The host's buffer is copied: mutating it afterwards cannot change the archive.
    const scratch=PNG.slice(),copy=exportEpub(doc(pic("a")),{...meta,image:()=>scratch});scratch.fill(0);
    expect(open(ok(copy)).part.get("EPUB/images/image-1.png")).toEqual(PNG);
  });
  it("lists only images the content documents reference",()=>{
    ids=0;
    // An image record in inline position is flattened to text by the HTML exporter, so it is not packaged.
    const result=exportEpub(doc(p(t("a"),pic("asset-jpeg")),pic("asset-png")),options),{files,xml}=open(ok(result));
    expect(files.filter(file=>file.name.includes("/images/")).map(file=>file.name)).toEqual(["EPUB/images/image-1.png"]);
    expect(all(xml("EPUB/package.opf"),"item").filter(i=>i.attributes["id"]!.startsWith("image-")).map(i=>i.attributes["href"])).toEqual(["images/image-1.png"]);
    expect(codes(result)).toEqual({"block-structure":1});
  });
  it("exports documents produced by the HTML importer from real producer markup",()=>{
    const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:"flow",structuredJson:source,plainText:""};}};
    const interchange=createRichInterchange(owner);
    for(const name of ["word.html","google-docs.html","excel.html"]){
      const imported=interchange.importHtml(readFileSync(new URL(`./fixtures/${name}`,import.meta.url),"utf8"));if(!imported.ok)throw Error(imported.error);
      const {files,xml}=open(ok(exportEpub(imported.value.structuredJson,meta)));
      for(const file of files)if(/\.(xml|opf|xhtml)$/.test(file.name))xml(file.name);
      expect(files.some(file=>file.name==="EPUB/chapter-1.xhtml")).toBe(true);
    }
  });
  it("keeps the EPUB entry free of the HTML/Markdown parser graph",()=>{
    const seen=new Set<string>(),visit=(path:string)=>{if(seen.has(path))return;seen.add(path);const source=readFileSync(new URL(`../src/${path}`,import.meta.url),"utf8");
      for(const m of source.matchAll(/^import\s[^;]*?from\s*"([^"]+)"/gm)){const spec=m[1]!;expect(spec.startsWith(".")).toBe(true);const dir=path.includes("/")?path.slice(0,path.lastIndexOf("/")+1):"";visit(new URL(spec.replace(/\.js$/,".ts"),`file:///${dir}`).pathname.slice(1));}};
    visit("epub.ts");
    expect([...seen].sort()).toEqual(["bookmark.ts","budget.ts","docx/convert.ts","docx/image.ts","docx/parts.ts","docx/zip.ts","epub.ts","epub/chapters.ts","epub/parts.ts","epub/xhtml.ts","html_export.ts","image_link_href.ts","language_tag.ts","mention.ts","ruby.ts","safe_url.ts","types.ts","wire.ts"]);
  });
});
