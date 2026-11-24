import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Explicit candidate rich V4 (bootstrap V9) over the actual Rust/Wasm owner: image links.
let interchange="";
test.beforeAll(async()=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 interchange=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
});
test.beforeEach(async({page})=>{
 await page.route("**/interchange.js",route=>route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:interchange}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js"),{createRichInterchange}=await import("/interchange.js");
  const pixel="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const bootstrap=(formatVersion,version)=>JSON.stringify({format:"breditor/profile-bootstrap",formatVersion,schema:{name:"example/image-link",version},extensions:[]});
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:[{kind:"text",text,formats:[]}]});
  const image=(link={})=>({kind:"element",type:"breditor/image",entityId:null,properties:{"breditor/block-id":"fig","breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"g1","breditor/decorative":false,"breditor/alt-text":"Chart","breditor/width":120,"breditor/height":80,...link},children:[paragraph("cap","Caption")]});
  const root=(link)=>({kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("p","Hello world"),image(link),paragraph("q","Second")]});
  // Document V2 requires canonical (sorted) object keys.
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const open=(profile,link)=>{const binding=profile.descriptor();return profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root(link))}));};
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap(9,4)),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const core=open(profile),host=document.createElement("main"),errors=[];document.body.append(host);
  const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,resolveAsset:()=>pixel,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>errors.push(String(error))});
  const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
  const images=()=>JSON.parse(core.documentJson()).root.children.filter(n=>n.type==="breditor/image");
  const link=node=>Object.fromEntries(Object.entries(node.properties).filter(([k])=>k==="breditor/image-href"||k==="breditor/image-link-new-window"));
  const anchors=()=>[...host.querySelectorAll("figure")].map(f=>{const a=f.querySelector("a");return a&&{inFigure:a.parentElement===f,img:a.firstElementChild?.tagName??null,children:a.children.length,href:a.getAttribute("href"),rel:a.getAttribute("rel"),target:a.getAttribute("target"),tabindex:a.getAttribute("tabindex"),captionLinked:Boolean(f.querySelector("figcaption a"))};});
  const clipboardEvent=(type,source=new DataTransfer())=>{
   const event=new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:source});
   if(event.clipboardData!==source)for(const flavor of source.types)event.clipboardData.setData(flavor,source.getData(flavor));
   editor.surface.dispatchEvent(event);return event;
  };
  window.il={api,bootstrap,open,profile,core,editor,host,errors,select,images,link,anchors,clipboardEvent,createRichInterchange};
 });
});

test("V4 reports image links while V3 stays exact and refuses them",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.il,v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4));
  try{const old=t.open(v3p),before=old.checkpointJson();let refused=false;
   try{old.execute({kind:"setImageLink",data:{image:"img",href:"https://example.com/"}});}catch{refused=true;}
   let documentRefused=false;try{t.open(v3p,{"breditor/image-href":"https://example.com/"}).dispose();}catch{documentRefused=true;}
   const out={v4:t.profile.descriptor().imageLinkVersion,v3:v3p.descriptor().imageLinkVersion??null,refused,documentRefused,unchanged:old.checkpointJson()===before,supports:[old.supportsImageLinks(),t.core.supportsImageLinks()]};old.dispose();return out;}finally{v3p.dispose();}});
 expect(result).toEqual({v4:1,v3:null,refused:true,documentRefused:true,unchanged:true,supports:[false,true]});
});

test("HTML geometry uses the CSS winner over image and table size attributes",async({page})=>{
 const result=await page.evaluate(()=>{
  const t=window.il;
  const html='<style>img.sized{width:225px!important;height:135px}col.sized{width:160px!important}td.sized{width:170px}table.sized{width:400px}</style>'+
   '<img class="sized" src="pic.png" alt="Styled" width="120" height="80" style="width:240px;height:145px">'+
   '<img src="pic.png" alt="Attribute" width="80" height="60">'+
   '<img src="pic.png" alt="Percentage" width="80" height="60" style="width:50%">'+
   '<table class="sized" width="200"><colgroup><col class="sized" width="96" style="width:172px"></colgroup><tr><td>Column</td><td>Table fallback</td></tr></table>'+
   '<table><tr><td class="sized" width="95">Cell</td></tr></table>';
  const v3=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3);
  try{
   return [old,t.core].map(core=>{
    const before=core.checkpointJson(),adapter=t.createRichInterchange(core,{
     resolveImage:({src})=>["pic.png","https://example.test/pic.png"].includes(src)?{asset:"asset",generation:"g1"}:undefined,
     exportImage:()=>"https://example.test/pic.png",
    });
    const shape=value=>JSON.parse(value.value.structuredJson).document.root.children.map(({type,properties:p})=>
     type==="breditor/image"?[p["breditor/width"]??null,p["breditor/height"]??null]:p["breditor/columns"].map(c=>c.width));
    const imported=adapter.importHtml(html),exported=adapter.exportHtml(imported.value.structuredJson);
    return {size:shape(imported),losses:imported.losses,back:shape(adapter.importHtml(exported.value)),unchanged:core.checkpointJson()===before};
   });
  }finally{old.dispose();v3.dispose();}
 });
 const geometry=[[225,145],[80,60],[null,null],[160,200],[170]];
 const expected={size:geometry,losses:[{code:"image-size",count:1,effect:"loss"}],back:geometry,unchanged:true};
 expect(result).toEqual([expected,expected]);
});

test("the V4 Image link toolbar control sets a link that wraps only the image, with exact Undo/Redo/restore",async({page})=>{
 await page.getByRole("button",{name:"Select image",exact:true}).click();
 await expect(page.locator("figure[data-node-selected]")).toHaveCount(1);
 const control=page.locator('[data-rich-control="image-link"]');
 await control.locator("summary").click();
 await page.locator('[data-rich-field="image-link-href"]').fill("javascript:alert(1)");
 await page.locator('[data-rich-action="image-link"]').click();
 await expect.poll(()=>page.evaluate(()=>window.il.errors.length)).toBe(1);
 expect(await page.evaluate(()=>window.il.core.view().undoDepth)).toBe(0);
 await page.locator('[data-rich-field="image-link-href"]').fill("HTTPS://Example.COM/Path/./to");
 await page.locator('[data-rich-field="image-link-target"]').selectOption("new");
 await page.locator('[data-rich-action="image-link"]').click();
 await expect(page.locator("figure > a > img")).toHaveCount(1);
 const result=await page.evaluate(()=>{const t=window.il,after=t.core.documentJson(),set={anchors:t.anchors(),link:t.link(t.images()[0]),undo:t.core.view().undoDepth};
  t.editor.execute({kind:"undo"});const undo={anchors:t.anchors(),link:t.link(t.images()[0])};
  t.editor.execute({kind:"redo"});const redo=t.core.documentJson()===after&&t.anchors()[0]?.href==="https://example.com/Path/to";
  const restored=t.profile.restoreEditor(t.core.checkpointJson()),restoredSame=restored.documentJson()===after;restored.dispose();
  return {set,undo,redo,restoredSame,errors:t.errors.length};});
 expect(result.set).toEqual({anchors:[{inFigure:true,img:"IMG",children:1,href:"https://example.com/Path/to",rel:"noopener noreferrer",target:"_blank",tabindex:"-1",captionLinked:false}],link:{"breditor/image-href":"https://example.com/Path/to","breditor/image-link-new-window":true},undo:1});
 expect(result.undo).toEqual({anchors:[null],link:{}});
 expect(result).toMatchObject({redo:true,restoredSame:true,errors:1});
 // Remove image link clears it in one more group.
 await page.locator('[data-rich-action="reset-image-link"]').click();
 await expect(page.locator("figure a")).toHaveCount(0);
 expect(await page.evaluate(()=>({link:window.il.link(window.il.images()[0]),undo:window.il.core.view().undoDepth}))).toEqual({link:{},undo:2});
});

for(const newWindow of [false,true])test(`clicking a linked image (${newWindow?"new":"same"} window) selects it and never navigates while editing`,async({page})=>{
 await page.evaluate(newWindow=>{const t=window.il;t.editor.execute({kind:"setImageLink",data:newWindow?{image:"img",href:"https://example.invalid/away",newWindow:true}:{image:"img",href:"https://example.invalid/away"}});t.editor.execute(t.select("p",0));},newWindow);
 const url=page.url(),pages=page.context().pages().length;
 await expect(page.locator("figure > a > img")).toHaveCount(1);
 await page.locator("figure > a > img").click();
 await expect(page.locator("figure[data-node-selected]")).toHaveCount(1);
 await page.waitForTimeout(300);
 expect(page.url()).toBe(url);expect(page.context().pages().length).toBe(pages);
 expect(await page.evaluate(()=>({selection:window.il.core.view().selection,errors:window.il.errors}))).toEqual({selection:{kind:"node",block:"fig"},errors:[]});
 // Keyboard activation of the anchor is inert too.
 await page.evaluate(()=>{window.il.host.querySelector("figure a").click();});
 await page.waitForTimeout(100);
 expect(page.url()).toBe(url);expect(page.context().pages().length).toBe(pages);
});

test("native copy and paste inside V4 keep the exact link; V3 refuses the record",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.il;
  t.editor.execute({kind:"setImageLink",data:{image:"img",href:"https://example.com/target",newWindow:true}});
  t.editor.execute({kind:"setSelection",selection:{kind:"node",block:"fig"}});
  const transfer=t.clipboardEvent("copy").clipboardData,record=transfer.getData("application/x-breditor-rich+json");
  t.editor.execute(t.select("q",6));const depth=t.core.view().undoDepth;t.clipboardEvent("paste",transfer);
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p);v3p.dispose();
  const v4Valid=t.core.validateClipboard(record).kind;let v3Refused=false;try{old.validateClipboard(record);}catch{v3Refused=true;}old.dispose();
  return {links:t.images().map(t.link),ids:new Set(t.images().map(i=>i.properties["breditor/image-id"])).size,delta:t.core.view().undoDepth-depth,dom:t.anchors().map(a=>a&&[a.href,a.target]),record:record.includes("breditor/image-href")&&record.includes("https://example.com/target"),v4Valid,v3Refused,errors:t.errors};
 });
 const link={"breditor/image-href":"https://example.com/target","breditor/image-link-new-window":true};
 expect(result).toEqual({links:[link,link],ids:2,delta:1,dom:[["https://example.com/target","_blank"],["https://example.com/target","_blank"]],record:true,v4Valid:"flow",v3Refused:true,errors:[]});
});

test("interchange maps image links for the V4 owner only",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.il,options={resolveImage:()=>({asset:"owned",generation:"g"}),exportImage:()=>"https://cdn.example/a.png"};
  const html='<figure><a href="HTTPS://Example.com/x"><img src="a.png" alt="Chart"></a><figcaption>Cap</figcaption></figure><p><a href="javascript:alert(1)"><img src="b.png" alt="B"></a></p>';
  const links=r=>r.ok?JSON.parse(r.value.structuredJson).document.root.children.filter(n=>n.type==="breditor/image").map(t.link):r.error;
  const adapter=t.createRichInterchange(t.core,options),v4=adapter.importHtml(html);
  const exported=adapter.exportHtml(v4.value.structuredJson),plain=adapter.importHtml('<p><a href="https://example.com/x"><img src="a.png" alt="Chart"></a></p>'),markdown=adapter.exportMarkdown(plain.value.structuredJson);
  const back=adapter.importMarkdown(markdown.ok?markdown.value:"");
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p);v3p.dispose();
  try{const v3=t.createRichInterchange(old,options).importHtml(html);
   return {v4:links(v4),v4losses:v4.losses.map(l=>[l.code,l.count]),html:exported.ok&&exported.value,markdown:markdown.ok&&markdown.value,back:links(back),v3:links(v3),v3losses:v3.losses.map(l=>[l.code,l.count])};}finally{old.dispose();}
 });
 expect(result.v4).toEqual([{"breditor/image-href":"https://example.com/x"},{}]);
 expect(result.v4losses).toEqual([["unsafe-link",1]]);
 expect(result.html).toContain('<figure><a href="https://example.com/x"><img src="https://cdn.example/a.png" alt="Chart"></a><figcaption>');
 expect(result.markdown).toBe("[![Chart](<https://cdn.example/a.png>)](<https://example.com/x>)");
 expect(result.back[0]).toEqual({"breditor/image-href":"https://example.com/x"});
 expect(result.v3).toEqual([{},{}]);
 // V1–V3 conversion is unchanged: the figure anchor falls back and the links are dropped.
 expect(result.v3losses).toEqual([["block-structure",2],["unsafe-link",1],["unsupported-element",1]]);
});
