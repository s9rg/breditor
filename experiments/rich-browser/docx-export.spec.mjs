import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {inflateRawSync} from "node:zlib";
// Test-only reader: central directory → local headers, CRC-32 and sizes verified for every entry.
const table=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc=data=>{let c=0xffffffff;for(const b of data)c=table[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
function unzip(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),eocd=bytes.length-22;
 if(v.getUint32(eocd,true)!==0x06054b50)throw Error("No end of central directory");
 const count=v.getUint16(eocd+10,true),files=new Map();let at=v.getUint32(eocd+16,true);
 for(let i=0;i<count;i++){
  if(v.getUint32(at,true)!==0x02014b50)throw Error("Bad central header");
  const method=v.getUint16(at+10,true),sum=v.getUint32(at+16,true),size=v.getUint32(at+20,true),usize=v.getUint32(at+24,true),nlen=v.getUint16(at+28,true),offset=v.getUint32(at+42,true);
  const name=new TextDecoder().decode(bytes.subarray(at+46,at+46+nlen));at+=46+nlen+v.getUint16(at+30,true)+v.getUint16(at+32,true);
  if(v.getUint32(offset,true)!==0x04034b50)throw Error("Bad local header");
  const start=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true),raw=bytes.subarray(start,start+size);
  const data=method===0?raw:new Uint8Array(inflateRawSync(raw));
  if(data.length!==usize||crc(data)!==sum)throw Error(`CRC mismatch in ${name}`);files.set(name,data);
 }
 return files;
}
test("demo exports the live rich document as a valid Word package without network",async({page})=>{
 await page.goto("/demo");await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");
 await expect(page.locator("figure img")).toBeVisible();
 const requests=[];page.on("request",request=>requests.push(new URL(request.url())));
 const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Export Word (.docx)",exact:true}).click();const download=await pending;
 expect(download.suggestedFilename()).toBe("breditor-document.docx");
 await expect(page.locator("#notice")).toContainText("Exported Word document");
 // Only same-origin module loads of the opt-in entry; no document data or bytes leave the page.
 for(const url of requests)if(url.protocol.startsWith("http"))expect(url.origin===new URL(page.url()).origin&&url.pathname.startsWith("/interchange/")).toBe(true);
 const bytes=new Uint8Array(await readFile(await download.path())),files=unzip(bytes);
 expect([...files.keys()]).toEqual(["[Content_Types].xml","_rels/.rels","docProps/core.xml","docProps/app.xml","word/document.xml","word/styles.xml","word/numbering.xml","word/settings.xml","word/_rels/document.xml.rels","word/media/image1.png"]);
 const text=name=>new TextDecoder("utf-8",{fatal:true}).decode(files.get(name));
 // Each engine's own XML parser must accept every part.
 const xmlParts=[...files.keys()].filter(name=>/\.(xml|rels)$/.test(name)).map(name=>[name,text(name)]);
 const parsed=await page.evaluate(parts=>parts.map(([name,source])=>{const d=new DOMParser().parseFromString(source,"application/xml");return [name,d.getElementsByTagName("parsererror").length===0,d.documentElement.localName];}),xmlParts);
 for(const [name,ok]of parsed)expect(ok,name).toBe(true);
 expect(Object.fromEntries(parsed.map(([name,,root])=>[name,root]))["word/document.xml"]).toBe("document");
 const documentXml=text("word/document.xml"),rels=text("word/_rels/document.xml.rels");
 expect(documentXml).toContain('<w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">One Rust document. Rich content.</w:t></w:r>');
 expect(documentXml.match(/<w:tbl>/g)).toHaveLength(1);
 expect(documentXml).toContain('<w:gridCol w:w="5700"/><w:gridCol w:w="4500"/>');
 expect(documentXml).toContain('<w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t xml:space="preserve">Rich cells</w:t>');
 expect(documentXml).toContain(`<wp:extent cx="${340*9525}" cy="${150*9525}"/>`);
 expect(documentXml).toContain('descr="Diagram"');
 expect(documentXml).toContain('<w:pStyle w:val="Caption"/></w:pPr><w:r><w:t xml:space="preserve">This caption is ordinary editable rich text.</w:t>');
 expect(rels).toContain('Target="media/image1.png"');
 expect([...files.get("word/media/image1.png").subarray(0,8)]).toEqual([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
 const report=await page.evaluate(()=>window.demo.lastDocx);expect(report.ok).toBe(true);expect(report.bytes).toBe(bytes.length);
 // Identical document and image bytes → identical archive bytes in this engine.
 const again=await page.evaluate(async()=>{const {exportDocxWithImages}=await import("/interchange/docx.js");const r=await exportDocxWithImages(window.demo.editor.view().documentJson,{title:"Breditor rich content demo",loadImage:()=>undefined});const s=await exportDocxWithImages(window.demo.editor.view().documentJson,{title:"Breditor rich content demo",loadImage:()=>undefined});return r.ok&&s.ok&&r.value.length===s.value.length&&r.value.every((b,i)=>b===s.value[i])?r.losses.map(l=>l.code):null;});
 expect(again).toEqual(["image-reference"]);
});

test("DOCX keeps descending decimal markers from a restored native V4 document",async({page})=>{
 await page.goto("/");
 await expect(page.locator("#status")).toHaveText("Ready");
 const exported=await page.evaluate(async()=>{
  const {compileStandardRichProfileV4}=await import("/rich.js");
  const {exportDocx}=await import("/interchange/docx.js");
  const profile=compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({
   format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/docx-numbering",version:4},extensions:[],
  }));
  const element=(type,properties,children)=>({kind:"element",type:`breditor/${type}`,entityId:null,properties,children});
  const items=["Five","Four","Three"].map((text,index)=>element("list-item",{"breditor/block-id":`item-${index}`},[
   element("paragraph",{"breditor/block-id":`text-${index}`},[{kind:"text",text,formats:[]}]),
  ]));
  const {schema,schemaFingerprint}=profile.descriptor();
  const owner=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,
   root:element("document",{"breditor/document-id":"numbering"},[
    element("ordered-list",{"breditor/block-id":"list","breditor/start":1},items),
   ]),
  }));
  try{
   owner.execute({kind:"setListNumbering",data:{list:"list",style:"decimal",reversed:true,start:5}});
   const checkpoint=owner.checkpointJson();
   const restored=profile.restoreEditor(checkpoint);
   try{
    const result=exportDocx(restored.documentJson());
    if(!result.ok)throw Error(result.error);
    return {bytes:Array.from(result.value),losses:result.losses,exact:restored.checkpointJson()===checkpoint};
   }finally{restored.dispose();}
  }finally{owner.dispose();profile.dispose();}
 });
 expect(exported.exact).toBe(true);
 expect(exported.losses).toEqual([{code:"list-numbering",count:1,effect:"loss"}]);
 const files=unzip(Uint8Array.from(exported.bytes)),decoder=new TextDecoder("utf-8",{fatal:true});
 const markers=await page.evaluate(([documentXml,numberingXml])=>{
  const parser=new DOMParser(),ns="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const document=parser.parseFromString(documentXml,"application/xml");
  const numbering=parser.parseFromString(numberingXml,"application/xml");
  if(document.querySelector("parsererror")||numbering.querySelector("parsererror"))throw Error("Invalid Word XML");
  const all=(root,name)=>[...root.getElementsByTagNameNS(ns,name)];
  const starts=new Map(all(numbering,"num").map(num=>[
   num.getAttributeNS(ns,"numId"),all(num,"startOverride")[0]?.getAttributeNS(ns,"val"),
  ]));
  return all(document,"p").map(paragraph=>{
   const id=all(paragraph,"numId")[0]?.getAttributeNS(ns,"val");
   return [all(paragraph,"t")[0]?.textContent,starts.get(id)];
  });
 },[decoder.decode(files.get("word/document.xml")),decoder.decode(files.get("word/numbering.xml"))]);
 expect(markers).toEqual([["Five","5"],["Four","4"],["Three","3"]]);
});
