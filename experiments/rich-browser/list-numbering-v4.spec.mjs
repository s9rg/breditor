import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Explicit candidate rich V4 (bootstrap V9) over the actual Rust/Wasm owner: ordered-list numbering.
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
  const bootstrap=(formatVersion,version)=>JSON.stringify({format:"breditor/profile-bootstrap",formatVersion,schema:{name:"example/list-numbering",version},extensions:[]});
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const element=(type,id,children=[],extra={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":id,...extra},children});
  const paragraph=(id,text)=>element("paragraph",id,[{kind:"text",text,formats:[]}]);
  const item=(id,children=[])=>element("list-item",id,[paragraph(`${id}-p`,id),...children]);
  const root=()=>{const r=element("document","unused",[element("ordered-list","outer",[item("a",[element("ordered-list","inner",[item("x"),item("y")],{"breditor/start":1})]),item("b"),item("c")],{"breditor/start":1})]);r.properties={"breditor/document-id":"room"};return canonical(r);};
  const open=(profile)=>{const binding=profile.descriptor();return profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:root()}));};
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap(9,4)),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const core=open(profile),host=document.createElement("main"),errors=[];document.body.append(host);
  const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>errors.push(String(error))});
  const caret=block=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:"0",affinity:"after"},focus:{block,offset:"0",affinity:"after"}}});
  const list=id=>(function find(n){if(n.properties?.["breditor/block-id"]===id)return n.properties;for(const c of n.children??[]){const r=find(c);if(r)return r;}})(JSON.parse(core.documentJson()).root);
  window.v4={api,bootstrap,open,profile,presentation,core,editor,host,errors,caret,list,createRichInterchange};
 });
});

test("V4 is explicit: its own fingerprint and capability while V3 stays exact and refuses numbering",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.v4,v4=t.profile.descriptor(),v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4));
  try{const v3=v3p.descriptor(),old=t.open(v3p),before=old.checkpointJson();let refused=false;try{old.execute({kind:"setListNumbering",data:{list:"outer",style:"lower-roman"}});}catch{refused=true;}
   let crossed=0;for(const run of [()=>t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(9,4)),()=>t.api.compileStandardRichProfileV4(window.rich.wasm,t.bootstrap(8,4))])try{run().dispose();}catch{crossed++;}
   const out={v4:[v4.richLanguageVersion,v4.blockLayoutVersion,v4.listNumberingVersion],v3:[v3.richLanguageVersion,v3.blockLayoutVersion,v3.listNumberingVersion??null],distinct:v3.schemaFingerprint!==v4.schemaFingerprint,refused,unchanged:old.checkpointJson()===before,supports:[old.supportsListNumbering(),t.core.supportsListNumbering()],crossed};old.dispose();return out;}finally{v3p.dispose();}});
 expect(result).toEqual({v4:[4,1,1],v3:[3,1,null],distinct:true,refused:true,unchanged:true,supports:[false,true],crossed:2});
});

test("set and clear render native type/reversed/start per list with one exact Undo group each",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.v4,ol=id=>t.host.querySelector(`ol[data-rich-block="${id}"]`),before=t.core.documentJson(),depth=t.core.view().undoDepth;
  t.editor.execute({kind:"setListNumbering",data:{list:"outer",style:"upper-roman",reversed:true,start:3}});
  const set={type:ol("outer").getAttribute("type"),reversed:ol("outer").reversed,start:ol("outer").start,marker:getComputedStyle(ol("outer")).listStyleType,inner:[ol("inner").hasAttribute("type"),ol("inner").reversed,getComputedStyle(ol("inner")).listStyleType],delta:t.core.view().undoDepth-depth,props:t.list("outer")};
  const after=t.core.documentJson();t.editor.execute({kind:"setListNumbering",data:{list:"inner",style:"lower-alpha"}});
  const inner=[ol("inner").getAttribute("type"),getComputedStyle(ol("inner")).listStyleType];
  t.editor.execute({kind:"undo"});const undoInner=t.core.documentJson()===after;t.editor.execute({kind:"undo"});const undoOuter=t.core.documentJson()===before&&!ol("outer").hasAttribute("type")&&!ol("outer").reversed;
  t.editor.execute({kind:"redo"});const redo=t.core.documentJson()===after;
  const saved=t.core.checkpointJson(),restored=t.profile.restoreEditor(saved);const restoredSame=restored.documentJson()===after;restored.dispose();
  t.editor.execute({kind:"setListNumbering",data:{list:"outer",style:null,reversed:false}});const cleared=t.list("outer");
  return {set,inner,undoInner,undoOuter,redo,restoredSame,cleared,errors:t.errors};
 });
 expect(result.set).toEqual({type:"I",reversed:true,start:3,marker:"upper-roman",inner:[false,false,"decimal"],delta:1,props:{"breditor/block-id":"outer","breditor/list-reversed":true,"breditor/list-style":5,"breditor/start":3}});
 expect(result.inner).toEqual(["a","lower-alpha"]);
 expect(result).toMatchObject({undoInner:true,undoOuter:true,redo:true,restoredSame:true,errors:[]});
 expect(result.cleared).toEqual({"breditor/block-id":"outer","breditor/start":3});
 // Reversed numbering counts down from start in the real engine (3, 2, 1).
 await page.evaluate(()=>window.v4.editor.execute({kind:"setListNumbering",data:{list:"outer",reversed:true}}));
 await expect(page.locator('ol[data-rich-block="outer"]')).toHaveAttribute("reversed","");
});

test("read-only and malformed intent are refused without publication",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.v4,before=t.core.checkpointJson();let refused=0;
  t.core.setReadOnly(true);try{t.core.execute({kind:"setListNumbering",data:{list:"outer",style:"decimal"}});}catch{refused++;}t.core.setReadOnly(false);
  for(const data of [{list:"outer"},{list:"outer",style:"disc"},{list:"a",style:"decimal"},{list:"outer",start:0},{list:"outer",reversed:null}])try{t.core.execute({kind:"setListNumbering",data});}catch{refused++;}
  const stale=t.core.view().revision;t.core.execute({kind:"setListNumbering",data:{list:"outer",style:"decimal"}});try{t.core.execute({kind:"setListNumbering",data:{list:"outer",style:"lower-alpha"}},stale);}catch{refused++;}
  return {refused,style:t.list("outer")["breditor/list-style"],changedOnce:t.core.view().undoDepth,beforeLength:before.length>0};
 });
 expect(result).toEqual({refused:7,style:1,changedOnce:1,beforeLength:true});
});

test("the V4 toolbar control reads the caret's own list and applies one native change",async({page})=>{
 await page.evaluate(()=>{const t=window.v4;t.editor.execute(t.caret("x-p"));});
 const control=page.locator('[data-rich-control="list-numbering"]');
 await control.locator("summary").click();
 await expect(page.locator('[data-rich-field="list-numbering-start"]')).toHaveValue("1");
 await page.locator('[data-rich-field="list-numbering-style"]').selectOption("lower-roman");
 await page.locator('[data-rich-field="list-numbering-order"]').selectOption("reversed");
 await page.locator('[data-rich-field="list-numbering-start"]').fill("2");
 await page.locator('[data-rich-action="list-numbering"]').click();
 await expect(page.locator('ol[data-rich-block="inner"]')).toHaveAttribute("type","i");
 await expect(page.locator('ol[data-rich-block="inner"]')).toHaveAttribute("start","2");
 await expect(page.locator('ol[data-rich-block="outer"]')).not.toHaveAttribute("type",/./);
 const result=await page.evaluate(()=>({inner:window.v4.list("inner"),undo:window.v4.core.view().undoDepth,errors:window.v4.errors}));
 expect(result).toEqual({inner:{"breditor/block-id":"inner","breditor/list-reversed":true,"breditor/list-style":4,"breditor/start":2},undo:1,errors:[]});
});

test("interchange maps HTML numbering only for the V4 owner; native V3 admission keeps the loss notices",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.v4,html='<ol type="a" reversed><li>One</li><li>Two</li></ol><ol style="list-style-type:upper-roman" start="4"><li>Four</li></ol>';
  const lists=r=>{if(!r.ok)return r.error;const out=[];(function walk(n){if(n.type==="breditor/ordered-list")out.push(Object.fromEntries(Object.entries(n.properties).filter(([k])=>k!=="breditor/block-id")));for(const c of n.children??[])walk(c);})(JSON.parse(r.value.structuredJson).document.root);return out;};
  const v4=t.createRichInterchange(t.core).importHtml(html),exported=t.createRichInterchange(t.core).exportHtml(v4.value.structuredJson);
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p);v3p.dispose();
  try{const v3=t.createRichInterchange(old).importHtml(html);
   return {v4:lists(v4),v4losses:v4.losses,html:exported.ok&&exported.value,v3:lists(v3),v3losses:v3.losses.map(l=>l.code)};}finally{old.dispose();}
 });
 expect(result.v4).toEqual([{"breditor/list-reversed":true,"breditor/list-style":2,"breditor/start":2},{"breditor/list-style":5,"breditor/start":4}]);
 expect(result.v4losses).toEqual([]);
 expect(result.html).toContain('<ol start="2" type="a" reversed>');expect(result.html).toContain('<ol start="4" type="I">');
 expect(result.v3).toEqual([{"breditor/start":1},{"breditor/start":4}]);
 expect(result.v3losses).toContain("list-numbering");
});

test("Word desktop and Word for the web lettered/roman numbering admit natively as V4 list styles; V3 keeps the notices",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.v4;
  const word=(level,marker,body)=>`<p class=MsoListParagraphCxSpMiddle style='mso-list:l0 level${level} lfo1'><![if !supportLists]><span style='mso-list:Ignore'>${marker}<span style='font:7.0pt "Times New Roman"'>&nbsp; </span></span><![endif]>${body}<o:p></o:p></p>`;
  const online=(style,items,level=1)=>`<div class="ListContainerWrapper"><ol role="list" style="list-style-type: ${style};">${items.map((body,i)=>`<li data-leveltext="%${level}." data-listid="9" aria-setsize="-1" data-aria-posinset="${i+1}" data-aria-level="${level}" role="listitem"><p>${body}</p></li>`).join("")}</ol></div>`;
  const html=word(1,"1.","Scope")+word(2,"a.","Review")+word(2,"b.","Tag")+word(3,"i.","Sign")+word(1,"2.","Publish")+"<p>Gap</p>"+online("upper-roman",["One","Two"])+online("lower-alpha",["Alpha"],2);
  const lists=r=>{if(!r.ok)return r.error;const out=[];(function walk(n){if(n.type==="breditor/ordered-list")out.push(Object.fromEntries(Object.entries(n.properties).filter(([k])=>k!=="breditor/block-id")));for(const c of n.children??[])walk(c);})(JSON.parse(r.value.structuredJson).document.root);return out;};
  const adapter=t.createRichInterchange(t.core),v4=adapter.importHtml(html),exported=adapter.exportHtml(v4.value.structuredJson),back=adapter.importHtml(exported.value);
  const v3p=t.api.compileStandardLayoutRichProfileV3(window.rich.wasm,t.bootstrap(8,4)),old=t.open(v3p);v3p.dispose();
  try{const v3=t.createRichInterchange(old).importHtml(html);
   return {v4:lists(v4),v4losses:v4.losses.map(l=>l.code),back:lists(back),v3:lists(v3),v3numbering:v3.losses.find(l=>l.code==="list-numbering")?.count};}finally{old.dispose();}
 });
 expect(result.v4).toEqual([{"breditor/start":1},{"breditor/list-style":2,"breditor/start":1},{"breditor/list-style":4,"breditor/start":1},{"breditor/list-style":5,"breditor/start":1},{"breditor/list-style":2,"breditor/start":1}]);
 expect(result.v4losses).not.toContain("list-numbering");expect(result.back).toEqual(result.v4);
 expect(result.v3).toEqual([{"breditor/start":1},{"breditor/start":1},{"breditor/start":1},{"breditor/start":1},{"breditor/start":1}]);
 // Three Word desktop markers; Word for the web: one list notice plus one per item for each non-decimal list.
 expect(result.v3numbering).toBe(8);
});
