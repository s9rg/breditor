import {describe,it,expect} from "vitest";
import {docxContentsLimits,exportDocx,exportDocxWithImages,type DocxResult} from "../src/docx.js";
import {all,kids,parseXml,textContent,unzip,type XmlElement} from "./docx_support.js";

type Json=Record<string,unknown>;
const el=(type:string,properties:Json,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const t=(text:string,...formats:unknown[])=>({kind:"text",text,formats});
const h=(id:string,level:number,...children:unknown[])=>el("heading",{"block-id":id,level},children);
const p=(id:string,text:string)=>el("paragraph",{"block-id":id},[t(text)]);
const doc=(...children:unknown[])=>JSON.stringify({format:"breditor/document",formatVersion:2,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}});
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
function ok(result:DocxResult<Uint8Array>):Uint8Array{if(!result.ok)throw Error(result.error);return result.value;}
function parts(bytes:Uint8Array){
  const files=new Map(unzip(bytes).map(f=>[f.name,f.data]));
  return (name:string):XmlElement=>parseXml(new TextDecoder("utf-8",{fatal:true}).decode(files.get(name)!));
}
const styleOf=(para:XmlElement)=>kids(para,"w:pPr").flatMap(pp=>kids(pp,"w:pStyle"))[0]?.attributes["w:val"];
/** The body paragraphs from the TOC title through the paragraph holding the field end. */
function contentsBlock(document:XmlElement):XmlElement[] {
  const body=kids(kids(document,"w:body")[0]!,"w:p"),end=body.findIndex(x=>all(x,"w:fldChar").some(c=>c.attributes["w:fldCharType"]==="end"));
  return body.slice(0,end+1);
}

const sample=()=>doc(
  h("intro",1,t("  Introduction  ")),
  p("p1","Body"),
  h("scope",2,t("Scope "),t("and goals",{type:"breditor/strong",properties:{}})),
  el("heading",{"block-id":"user","level":3,"bookmark":"details"},[t("Details")]),
  el("bullet-list",{"block-id":"l"},[el("list-item",{"block-id":"li"},[h("nested",4,t("Nested\theading"))])]),
  h("deep",6,t("Deep")),
  h("empty",2,t("   ")),
  el("paragraph",{"block-id":"link"},[t("see",{type:"breditor-inline/link",properties:{"breditor-inline/href":"#details","breditor-inline/new-window":false}})]),
);

describe("opt-in DOCX table of contents",()=>{
  it("keeps the original output byte for byte when contents is omitted or false",()=>{
    const plain=ok(exportDocx(sample()));
    expect(ok(exportDocx(sample(),{contents:false}))).toEqual(plain);
    const document=parts(plain)("word/document.xml");
    expect(all(document,"w:fldChar")).toEqual([]);
    expect(all(parts(plain)("word/styles.xml"),"w:style").some(s=>s.attributes["w:styleId"]?.startsWith("TOC"))).toBe(false);
  });

  it("writes a TOC field whose cached result links every heading bookmark",()=>{
    const result=exportDocx(sample(),{contents:true}),xml=parts(ok(result)),document=xml("word/document.xml");
    const block=contentsBlock(document);
    // Title, one paragraph per heading, then the field end.
    expect(styleOf(block[0]!)).toBe("TOCHeading");expect(textContent(block[0]!)).toBe("Table of contents");
    const entries=block.slice(1,-1);
    expect(entries.map(x=>[styleOf(x),textContent(x)])).toEqual([
      ["TOC1","Introduction"],["TOC2","Scope and goals"],["TOC3","Details"],["TOC4","Nested heading"],["TOC6","Deep"],["TOC2","Untitled heading"],
    ]);
    // Field: begin + instruction + separate in the first entry, end in its own trailing paragraph.
    const chars=all(document,"w:fldChar").map(c=>c.attributes["w:fldCharType"]);expect(chars).toEqual(["begin","separate","end"]);
    expect(kids(block.at(-1)!).map(c=>c.name)).toEqual(["w:r"]);
    expect(all(entries[0]!,"w:instrText").map(textContent)).toEqual([' TOC \\o "1-6" \\h \\z \\u ']);
    expect(all(entries[0]!,"w:instrText")[0]!.attributes["xml:space"]).toBe("preserve");
    // Each entry hyperlinks a hidden _Toc bookmark that wraps exactly the heading it names.
    const anchors=entries.map(x=>{const links=all(x,"w:hyperlink");expect(links).toHaveLength(1);return links[0]!.attributes["w:anchor"]!;});
    for(const anchor of anchors)expect(anchor).toMatch(/^_Toc[0-9a-f]{8}$/);
    expect(new Set(anchors).size).toBe(anchors.length);
    const starts=all(document,"w:bookmarkStart"),ends=all(document,"w:bookmarkEnd");
    expect(new Set(starts.map(s=>s.attributes["w:id"])).size).toBe(starts.length);
    expect(starts.map(s=>s.attributes["w:id"]).sort()).toEqual(ends.map(e=>e.attributes["w:id"]).sort());
    const headings=kids(kids(document,"w:body")[0]!,"w:p").slice(block.length).filter(x=>styleOf(x)?.startsWith("Heading"));
    expect(headings.map(x=>all(x,"w:bookmarkStart").find(s=>s.attributes["w:name"]!.startsWith("_Toc"))!.attributes["w:name"])).toEqual(anchors);
    // The user bookmark coexists (outside the contents bookmark) and the internal link still targets it.
    const user=headings[2]!,names=all(user,"w:bookmarkStart").map(s=>s.attributes["w:name"]);
    expect(names).toEqual(["details",anchors[2]]);
    expect(all(document,"w:hyperlink").filter(l=>l.attributes["w:anchor"]==="details")).toHaveLength(1);
    // Styles exist and the title style sits outside the outline (\u would otherwise list it).
    const styles=new Map(all(xml("word/styles.xml"),"w:style").map(s=>[s.attributes["w:styleId"],s]));
    for(const id of ["TOCHeading","TOC1","TOC2","TOC3","TOC4","TOC5","TOC6"])expect(styles.has(id)).toBe(true);
    expect(all(styles.get("TOCHeading")!,"w:outlineLvl")[0]!.attributes["w:val"]).toBe("9");
    // Settings stay untouched unless asked; the empty heading's placeholder label is reported.
    expect(all(xml("word/settings.xml"),"w:updateFields")).toEqual([]);
    expect(codes(result)).toEqual({"contents-entry":1});
  });

  it("filters by level range, honours the title and opts into updateFields",()=>{
    const result=exportDocx(sample(),{contents:{title:"Contents <&>",minLevel:2,maxLevel:3,position:"start",updateFields:true}}),xml=parts(ok(result)),document=xml("word/document.xml");
    const block=contentsBlock(document);
    expect(textContent(block[0]!)).toBe("Contents <&>");
    expect(block.slice(1,-1).map(textContent)).toEqual(["Scope and goals","Details","Untitled heading"]);
    expect(all(document,"w:instrText").map(textContent)).toEqual([' TOC \\o "2-3" \\h \\z \\u ']);
    // Out-of-range headings carry no contents bookmark.
    expect(all(document,"w:bookmarkStart").filter(s=>s.attributes["w:name"]!.startsWith("_Toc"))).toHaveLength(3);
    const settings=kids(xml("word/settings.xml")).map(c=>c.name);
    expect(settings).toEqual(["w:defaultTabStop","w:characterSpacingControl","w:updateFields","w:compat"]);
  });

  it("includes headings in table cells like the HTML contents and omits the field without headings",()=>{
    const cell=(column:string,...children:unknown[])=>el("table-cell",{"block-id":`c-${column}`,"column-id":column,header:false},children);
    const table=el("table",{"block-id":"t","table-id":"t",columns:[{id:"a",width:100}],merges:[],"retracted-merges":[]},[el("table-row",{"block-id":"r","row-id":"r"},[cell("a",h("inCell",2,t("In cell")))]),p("cap","Caption")]);
    const document=parts(ok(exportDocx(doc(table),{contents:true})))("word/document.xml");
    expect(contentsBlock(document).slice(1,-1).map(textContent)).toEqual(["In cell"]);
    const none=exportDocx(doc(p("a","No headings")),{contents:true});
    expect(all(parts(ok(none))("word/document.xml"),"w:fldChar")).toEqual([]);
    expect(none.losses).toEqual([]);
  });

  it("is deterministic and derives bookmark names from block identity, not labels or order",()=>{
    const first=ok(exportDocx(sample(),{contents:true}));
    expect(ok(exportDocx(sample(),{contents:true}))).toEqual(first);
    const anchorOf=(json:string,label:string)=>{const document=parts(ok(exportDocx(json,{contents:true})))("word/document.xml");return all(contentsBlock(document).find(x=>textContent(x)===label)!,"w:hyperlink")[0]!.attributes["w:anchor"];};
    const a=anchorOf(doc(h("x",1,t("One")),h("y",1,t("Two"))),"Two"),b=anchorOf(doc(h("new",1,t("Zero")),h("y",1,t("Two renamed")),h("x",1,t("One"))),"Two renamed");
    expect(a).toBe(b);
  });

  it("lists a repeated block identity once and bounds entries and labels",()=>{
    const long="L".repeat(docxContentsLimits.labelUnits+10);
    const headings=[h("dup",1,t("First")),h("dup",1,t("Again")),h("long",1,t(long)),...Array.from({length:docxContentsLimits.entries},(_,i)=>h(`m${i}`,2,t(`Many ${i}`)))];
    const result=exportDocx(doc(...headings),{contents:true}),document=parts(ok(result))("word/document.xml"),entries=contentsBlock(document).slice(1,-1);
    expect(entries).toHaveLength(docxContentsLimits.entries);
    expect(textContent(entries[0]!)).toBe("First");
    expect(textContent(entries[1]!)).toBe(`${"L".repeat(docxContentsLimits.labelUnits)}…`);
    // Duplicate identity, truncated label and the two entries past the bound.
    expect(codes(result)).toEqual({"contents-entry":4});
  });

  it("validates the option before reading the document or loading images",async()=>{
    const bad:unknown[]=[null,1,"yes",[],{maxLevel:7},{minLevel:0},{minLevel:4,maxLevel:2},{maxLevel:2.5},{position:"end"},{title:""},{title:"   "},{title:"a\nb"},{title:"x".repeat(257)},{title:"\uD800"},{updateFields:"true"},{unknown:1}];
    // An oversized source would fail with `resource-limit` if it were read first.
    const oversized="x".repeat(8*1024*1024+1);
    expect(exportDocx(oversized,{contents:true})).toEqual({ok:false,error:"resource-limit",losses:[]});
    for(const contents of bad){
      expect(exportDocx(oversized,{contents:contents as never})).toEqual({ok:false,error:"invalid-source",losses:[]});
      let loads=0;
      await expect(exportDocxWithImages(sample(),{contents:contents as never,loadImage:()=>{loads++;return undefined;}})).resolves.toEqual({ok:false,error:"invalid-source",losses:[]});
      expect(loads).toBe(0);
    }
    const viaAsync=await exportDocxWithImages(sample(),{contents:{maxLevel:2}});
    expect(viaAsync.ok).toBe(true);
  });
});
