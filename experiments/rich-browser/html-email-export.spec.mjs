import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";

test("exports inline-style email HTML from a native V4 owner and re-imports the same semantics",async({page})=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 const js=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
 await page.route("**/email-interchange.js",route=>route.fulfill({body:js,contentType:"text/javascript"}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{window.emailModules=await Promise.all([import("/rich.js"),import("/email-interchange.js")]);});
 const requests=[];
 page.on("request",request=>requests.push(request.url()));
 const result=await page.evaluate(async()=>{
  const [api,{createRichInterchange,exportEmailHtml,importHtmlPage}]=window.emailModules;
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/email-export",version:1},extensions:[]}));
  const {schema,schemaFingerprint}=profile.descriptor();
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"original"},children:[]}]};
  const owner=profile.createDocumentEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root}));
  try{
   const adapter=createRichInterchange(owner);
   const source='<h1 style="text-align:center">Monthly <em>news</em></h1>'+
    '<p style="text-align:start">Plain <strong>bold</strong> <span style="color:#cc0000">red</span> <span style="font-size:20px">large</span> '+
    '<span style="font-family:serif">serif</span> <code>inline()</code> <a href="https://example.test/a">link</a></p>'+
    '<blockquote><p>Quoted</p></blockquote><pre><code class="language-ts">const x = 1;</code></pre><hr>'+
    '<ol type="a" start="3"><li><p>Lettered</p></li></ol><ul><li><input type="checkbox" disabled checked><p>Done</p></li></ul>'+
    '<table><colgroup><col width="120"><col width="200"></colgroup><tbody><tr><th><p>Name</p></th><th><p>Value</p></th></tr>'+
    '<tr><td colspan="2"><div data-breditor-cell-partition="1" data-breditor-cell-row="0" data-breditor-cell-column="0" data-breditor-cell-header="0"><p>Merged</p></div>'+
    '<div data-breditor-cell-partition="1" data-breditor-cell-row="0" data-breditor-cell-column="1" data-breditor-cell-header="0"><p></p></div></td></tr></tbody></table>';
   const admitted=adapter.importHtml(source,{kind:"flow"});
   if(!admitted.ok)throw Error(admitted.error);
   const transfer=admitted.value.structuredJson;
   const preset={width:600,background:"#eef2f7",preheader:"Preview text"};
   const email=exportEmailHtml(owner,transfer,{page:{title:"Newsletter",language:"en"},preset});
   if(!email.ok)throw Error(email.error);
   // Render with scripts disabled and no stylesheet: every presentation must come from inline styles.
   const frame=document.createElement("iframe");frame.setAttribute("sandbox","allow-same-origin");frame.style.width="800px";frame.style.height="1200px";
   const loaded=new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));frame.srcdoc=email.value;document.body.append(frame);await loaded;
   const doc=frame.contentDocument,style=(selector,property)=>frame.contentWindow.getComputedStyle(doc.querySelector(selector)).getPropertyValue(property);
   const rendered={stylesheets:doc.styleSheets.length,classStyled:doc.querySelectorAll("[class]:not(code):not(.breditor-mention)").length,
    scripts:doc.querySelectorAll("script,[onload],[onclick]").length,title:doc.title,
    column:doc.querySelector('table[role="presentation"] table').getBoundingClientRect().width,
    h1:style("h1","text-align"),red:style('span[style*="#cc0000"]',"color"),code:style("p code","font-family").includes("monospace"),
    quote:style("blockquote","border-left-style"),cell:style("td","border-top-style"),th:style("th","font-weight"),
    marker:style("ol","list-style-type"),preheader:style('[data-breditor-email="preheader"]',"display")};
   frame.remove();
   const page=importHtmlPage(owner,email.value),fragment=adapter.importHtml(email.value);
   if(!page.ok||!fragment.ok)throw Error("Expected the email to re-import");
   const canonical=json=>{const value=adapter.exportHtml(json);if(!value.ok)throw Error(value.error);return value.value;};
   return {rendered,losses:[page.losses.length,fragment.losses.length],metadata:page.value.metadata,preset:page.value.email,
    same:canonical(page.value.body.structuredJson)===canonical(transfer)&&canonical(fragment.value.structuredJson)===canonical(transfer),
    stable:(()=>{const again=exportEmailHtml(owner,page.value.body.structuredJson,{page:page.value.metadata,preset:page.value.email});return again.ok&&again.value===email.value;})()};
  }finally{owner.dispose();profile.dispose();}
 });
 expect(result).toEqual({
  rendered:{stylesheets:0,classStyled:0,scripts:0,title:"Newsletter",column:600,h1:"center",red:"rgb(204, 0, 0)",code:true,quote:"solid",cell:"solid",th:"700",marker:"lower-alpha",preheader:"none"},
  losses:[0,0],metadata:{title:"Newsletter",language:"en"},preset:{width:600,background:"#eef2f7",contentBackground:"#ffffff",preheader:"Preview text"},same:true,stable:true,
 });
 expect(requests).toEqual([]);
});
