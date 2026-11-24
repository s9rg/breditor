import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";

test("bounded child-selector styles survive native editing and cold portable export",async({page})=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 const js=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
 await page.route("**/child-interchange.js",route=>route.fulfill({body:js,contentType:"text/javascript"}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{window.childModules=await Promise.all([import("/rich.js"),import("/child-interchange.js")]);});
 const requests=[];
 page.on("request",request=>requests.push(request.url()));
 const result=await page.evaluate(()=>{
  const [api,{createRichInterchange}]=window.childModules;
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/b9-css-child",version:1},extensions:[]}));
  const {schema,schemaFingerprint}=profile.descriptor();
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"base"},children:[]}]};
  const seed=JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root});
  let owner=profile.createDocumentEditor(seed),reopened;
  try{
   const html='<style>.outer > .region p{color:#123456!important}.outer > p{color:#980000}'+
    '.outer .heading > span{background-color:#fedcba}.outer + p {background-image:url(https://example.invalid/blocked.png)}</style>'+
    '<link rel="stylesheet" href="https://example.invalid/outside.css"><div class="outer">'+
    '<p>Direct</p><div class="region"><div><div class="region"><p style="color:green">Farther match</p></div></div></div>'+
    '<div><p style="color:green">Wrong subtree</p></div><p class="heading"><span>Immediate</span><em><span>Nested</span></em></p></div>';
   const imported=createRichInterchange(owner).importHtml(html);
   if(!imported.ok)throw Error(imported.error);
   owner.selectDocument();owner.pasteDocumentClipboard(imported.value.structuredJson,"child");
   const native=JSON.parse(owner.documentJson()).root.children,find=n=>n.children.map(run=>run.text??"").join("");
   const paragraph=native.find(n=>find(n)==="Direct"),block=paragraph.properties["breditor/block-id"],point={block,offset:"3",affinity:"after"};
   owner.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}});
   owner.execute({kind:"insertPlainText",text:"-"});
   const checkpoint=owner.checkpointJson();
   owner.dispose();owner=undefined;
   reopened=profile.restoreDocumentEditor(checkpoint);
   const exact=reopened.checkpointJson()===checkpoint;
   reopened.selectDocument();const before=reopened.checkpointJson(),adapter=createRichInterchange(reopened);
   const portable=adapter.exportHtml(reopened.copyDocument().structuredJson);
   if(!portable.ok)throw Error(portable.error);
   const host=document.createElement("main");host.innerHTML=portable.value;document.body.append(host);
   try{
    const segment=text=>[...host.querySelectorAll("span,em,p")].find(node=>[...node.childNodes].some(child=>child.nodeType===Node.TEXT_NODE&&child.textContent===text));
    const color=text=>getComputedStyle(segment(text)).color;
    const background=text=>{
     for(let node=segment(text);node&&node!==host;node=node.parentElement){
      const painted=getComputedStyle(node).backgroundColor;
      if(painted!=="rgba(0, 0, 0, 0)")return painted;
     }
     return "rgba(0, 0, 0, 0)";
    };
    return {exact,unchanged:reopened.checkpointJson()===before,forbidden:host.querySelectorAll("style,link").length,
     direct:color("Dir-ect"),farther:color("Farther match"),out:color("Wrong subtree"),immediate:background("Immediate"),
     nested:background("Nested"),notices:imported.losses};
   }finally{host.remove();}
  }finally{owner?.dispose();reopened?.dispose();profile.dispose();}
 });
 expect(result).toEqual({exact:true,unchanged:true,forbidden:0,direct:"rgb(152, 0, 0)",farther:"rgb(18, 52, 86)",
  out:"rgb(0, 128, 0)",immediate:"rgb(254, 220, 186)",nested:"rgba(0, 0, 0, 0)",
  notices:[{code:"unsupported-style",count:2,effect:"loss"}]});
 expect(requests).toEqual([]);
});
