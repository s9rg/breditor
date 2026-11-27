import {test,expect} from "@playwright/test";
// Explicit candidate rich V4 over the actual Rust/Wasm owner: host-declared mention trigger feeds
// (`@` people and pages, `#` tags) and the sanitized mention presentation hook. The stored grammar
// is the frozen V4 one: every inserted mention is the text `@` + label.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js");
  const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/mention-feeds",version:4},extensions:[]});
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:text?[{kind:"text",text,formats:[]}]:[]});
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const open=()=>{const binding=profile.descriptor();return profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("p","Fix "),paragraph("q","Second")]}}));};
  // Tags display with a `#` marker; people get a tooltip only. Invalid output falls back to the default chip.
  const decorate=mention=>mention.kind==="tag"?{text:`#${mention.label}`,title:`Tag ${mention.label}`,classes:["tag-chip"],data:{tone:"blue"}}:mention.kind==="page"?{text:"<b>bad</b>\n"}:{title:mention.label};
  const core=open(),host=document.createElement("main"),errors=[];document.body.append(host);
  const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),mentionPresentation:decorate,onError:error=>errors.push(String(error))});
  const people=[{kind:"user",id:"u-1",label:"Ann Lee"},{kind:"page",id:"p-1",label:"Roadmap"}];
  const tags=[{kind:"tag",id:"t-1",label:"bug"},{kind:"tag",id:"t-2",label:"build"},{kind:"tag",id:"t-3",label:"design"}];
  const requests=[];
  const tagSource=(query,request)=>{requests.push({query,signal:request.signal});return new Promise(resolve=>setTimeout(()=>{if(!request.signal.aborted)resolve(tags.filter(tag=>tag.label.startsWith(query)));},5));};
  const mentions=api.mountRichMentions(editor,{core,feeds:[{trigger:"@",kinds:["user","page"],items:people},{trigger:"#",kinds:["tag"],items:tagSource,label:"Tags"}],onError:error=>errors.push(String(error))});
  const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
  const runs=(block="p")=>JSON.parse(core.documentJson()).root.children.find(n=>n.properties["breditor/block-id"]===block).children;
  const caret=()=>{const s=core.view().selection;return s?.kind==="text"?[s.anchor.block,s.anchor.offset,s.focus.offset]:null;};
  window.m={api,core,editor,host,errors,select,runs,caret,mentions,requests};
 });
});
const plain=text=>({kind:"text",text,formats:[]});
const tag=(id,label)=>({kind:"text",text:`@${label}`,formats:[{type:"breditor/mention",properties:{"breditor/mention-id":id,"breditor/mention-kind":"tag","breditor/mention-label":label}}]});
async function caretAtEnd(page){await page.evaluate(()=>{const t=window.m;t.editor.execute(t.select("p",4));t.editor.focus();});}

test("feeds are validated at mount; one feed set per surface",async({page})=>{
 const refused=await page.evaluate(()=>{const t=window.m,out=[];
  for(const feeds of [[{trigger:"/",kinds:["tag"],items:[]}],[{trigger:"#",kinds:["tag"],items:[]},{trigger:"#",kinds:["user"],items:[]}],[{trigger:" ",kinds:["tag"],items:[]}],[{trigger:"##",kinds:["tag"],items:[]}],[{trigger:"!",kinds:["team"],items:[]}]]){
   try{t.api.mountRichMentions(t.editor,{feeds});out.push("mounted");}catch(error){out.push(error.message);}
  }
  return {out,menus:document.querySelectorAll("[data-breditor-mention]").length};});
 expect(refused.out).toEqual(["A mention trigger cannot be the slash-command trigger /","Duplicate mention trigger #","A mention trigger is exactly one grapheme without white space or control characters","A mention trigger is exactly one grapheme without white space or control characters","A mention feed declares unique kinds among user, page and tag"]);
 // Only the two menus of the mounted feed set exist.
 expect(refused.menus).toBe(2);
 expect(await page.evaluate(()=>{try{window.m.api.mountRichMentions(window.m.editor,{feeds:[{trigger:"+",kinds:["user"],items:[]}]});return "mounted";}catch(error){return error.message;}})).toBe("This editing surface already has mentions");
});

test("typing # opens the tag menu with its own cancellable source; choosing inserts one Undo step",async({page})=>{
 await caretAtEnd(page);
 await page.keyboard.type("#bu");
 const menu=page.locator("[data-breditor-mention][data-mention-trigger='#']");
 await expect(menu).toBeVisible();await expect(page.locator("[data-breditor-mention][data-mention-trigger='@']")).toBeHidden();
 await expect(menu.locator("[role=option]")).toHaveText(["bug","build"]);
 await expect(menu.locator("[role=listbox]")).toHaveAttribute("aria-label","Tags");
 const aria=await page.evaluate(()=>{const s=window.m.editor.surface;return {expanded:s.getAttribute("aria-expanded"),controls:s.getAttribute("aria-controls"),list:document.querySelector("[data-mention-trigger='#'] [role=listbox]").id,focus:document.activeElement===s,state:window.m.mentions.state().feed,aborted:window.m.requests.slice(0,-1).every(r=>r.signal.aborted),queries:window.m.requests.map(r=>r.query)};});
 expect(aria).toEqual({expanded:"true",controls:aria.list,focus:true,state:"#",aborted:true,queries:["","b","bu"]});
 const before=await page.evaluate(()=>window.m.core.view().undoDepth);
 await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
 await expect(menu).toBeHidden();
 const inserted=await page.evaluate(()=>({runs:window.m.runs(),caret:window.m.caret(),undo:window.m.core.view().undoDepth,errors:window.m.errors}));
 // Stored grammar: `@build` with kind tag, whatever the trigger.
 expect(inserted).toEqual({runs:[plain("Fix "),tag("t-2","build"),plain(" ")],caret:["p","11","11"],undo:before+1,errors:[]});
 const undone=await page.evaluate(()=>{const t=window.m;t.editor.execute({kind:"undo"});return {runs:t.runs(),caret:t.caret()};});
 expect(undone).toEqual({runs:[plain("Fix #bu")],caret:["p","7","7"]});
 // The @ feed keeps its own static source and kinds.
 await page.evaluate(()=>window.m.editor.focus());
 await page.keyboard.type(" @ro");
 await expect(page.locator("[data-breditor-mention][data-mention-trigger='@'] [role=option]")).toHaveText(["Roadmap"]);
 await page.keyboard.press("Escape");
 expect(await page.evaluate(()=>window.m.mentions.state())).toMatchObject({open:false,feed:"@",lastCancel:"dismissed"});
});

test("the presentation hook decorates chips without changing text, caret or atomic deletion",async({page})=>{
 await caretAtEnd(page);
 await page.keyboard.type("#de");
 await expect(page.locator("[data-mention-trigger='#'] [role=option]")).toHaveText(["design"]);
 await page.keyboard.press("Enter");
 const chip=page.locator('[data-rich-text="p"] .breditor-mention');
 await expect(chip).toHaveAttribute("data-mention-display","#design");
 await expect(chip).toHaveAttribute("title","Tag design");
 await expect(chip).toHaveAttribute("data-mention-host-tone","blue");
 await expect(chip).toHaveAttribute("contenteditable","false");
 const shown=await chip.evaluate(element=>({before:getComputedStyle(element,"::before").content,stored:getComputedStyle(element.querySelector("[data-mention-text]")).display,text:element.textContent,block:element.closest("[data-rich-text]").textContent,classes:element.className}));
 expect(shown).toEqual({before:'"#design"',stored:"none",text:"@design",block:"Fix @design ",classes:"breditor-mention tag-chip"});
 // An invalid hook result (markup and a line break) leaves the default chip.
 await page.evaluate(()=>{const t=window.m;t.editor.execute({kind:"insertMention",data:{selection:{kind:"text",anchor:{block:"q",offset:"0",affinity:"after"},focus:{block:"q",offset:"0",affinity:"after"}},mention:{kind:"page",id:"p-1",label:"Roadmap"}}});});
 const page1=page.locator('[data-rich-text="q"] .breditor-mention');
 await expect(page1).toHaveText("@Roadmap");
 expect(await page1.evaluate(element=>[element.getAttribute("data-mention-display"),element.getAttribute("title"),element.querySelector("[data-mention-text]")])).toEqual([null,null,null]);
 // The caret still steps over the decorated chip as one unit and Backspace removes it whole.
 await page.evaluate(()=>{const t=window.m;t.editor.execute(t.select("p",12));t.editor.focus();});
 await page.keyboard.press("ArrowLeft");
 await expect.poll(()=>page.evaluate(()=>window.m.caret())).toEqual(["p","11","11"]);
 await page.keyboard.press("ArrowLeft");
 await expect.poll(()=>page.evaluate(()=>window.m.caret()[2])).toMatch(/^(4|11)$/);
 await page.evaluate(()=>{const t=window.m;t.editor.execute(t.select("p",11));t.editor.focus();});
 await page.keyboard.press("Backspace");
 await expect.poll(()=>page.evaluate(()=>window.m.runs())).toEqual([plain("Fix  ")]);
 expect(await page.evaluate(()=>window.m.errors)).toEqual([]);
});
