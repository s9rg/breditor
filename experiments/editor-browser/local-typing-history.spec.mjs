import {test,expect} from "@playwright/test";
const modes=[{name:"sdk",path:"/?history=typing",language:1},{name:"v2",path:"/structural.html?history=typing",language:2}];
const paragraph=page=>page.locator('#editor [data-rich-text="p"]');
async function ready(page,path){await page.goto(path);await expect(page.locator("#ready")).toHaveText("Ready");}
async function caret(page,name,block="p",offset=1){await page.evaluate(({name,block,offset})=>{const t=window[name];t.editor.execute({kind:"setSelection",selection:t.range(block,offset)});t.editor.focus();},{name,block,offset});}
for(const mode of modes){
 test(`local V${mode.language} trusted typing and deletion bursts retain exact grouped future history after reload`,async({page})=>{
  await ready(page,mode.path);await caret(page,mode.name);const original=await page.evaluate(name=>window[name].editor.view().documentJson,mode.name);
  await page.keyboard.type("ABC");await expect(paragraph(page)).toHaveText("aABC🙂b");
  expect(await page.evaluate(name=>{const v=window[name].editor.view();return [v.historyGrouping,v.undoDepth,v.historyStepCount];},mode.name)).toEqual(["typing-v1",1,3]);
  await page.keyboard.press("Backspace");await page.keyboard.press("Backspace");await expect(paragraph(page)).toHaveText("aA🙂b");
  expect(await page.evaluate(name=>{const v=window[name].editor.view();return [v.undoDepth,v.historyStepCount];},mode.name)).toEqual([2,5]);
  await page.keyboard.press("Control+z");await expect(paragraph(page)).toHaveText("aABC🙂b");
  await page.evaluate(name=>window[name].editor.execute({kind:"redo"}),mode.name);await expect(paragraph(page)).toHaveText("aA🙂b");
  const saved=await page.evaluate(name=>{const t=window[name];t.save();return {checkpoint:t.editor.checkpointJson(),document:t.editor.view().documentJson};},mode.name);
  expect(JSON.parse(saved.checkpoint).format).toBe("breditor/rich-typing-session");await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");
  expect(await page.evaluate(name=>({checkpoint:window[name].editor.checkpointJson(),document:window[name].editor.view().documentJson}),mode.name)).toEqual(saved);
  const result=await page.evaluate(name=>{const e=window[name].editor;e.execute({kind:"undo"});e.execute({kind:"undo"});const before=e.view().documentJson;e.execute({kind:"redo"});e.execute({kind:"redo"});return {before,after:e.view().documentJson,errors:window[name].errors};},mode.name);
  expect(result).toEqual({before:original,after:saved.document,errors:[]});
 });

 test(`local V${mode.language} navigation same-caret pointer blur and formatting create native boundaries`,async({page})=>{
  await ready(page,mode.path);await caret(page,mode.name);await page.keyboard.type("AB");await page.keyboard.press("ArrowLeft");await page.keyboard.press("ArrowRight");await page.keyboard.type("C");
  await expect(paragraph(page)).toHaveText("aABC🙂b");expect(await page.evaluate(name=>window[name].editor.view().undoDepth,mode.name)).toBe(2);
  const fence=await page.evaluate(name=>{const e=window[name].editor,old=e.view().revision;e.surface.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));let stale=false;try{e.execute({kind:"insertPlainText",text:"Old"},false,old);}catch{stale=true;}return stale;},mode.name);expect(fence).toBe(true);
  await page.keyboard.type("D");expect(await page.evaluate(name=>window[name].editor.view().undoDepth,mode.name)).toBe(3);
  await page.locator("#save").click();await page.evaluate(name=>window[name].editor.focus(),mode.name);await page.keyboard.type("E");expect(await page.evaluate(name=>window[name].editor.view().undoDepth,mode.name)).toBe(4);
  await page.keyboard.press("Control+b");await page.keyboard.type("F");await expect(paragraph(page)).toHaveText("aABCDEF🙂b");expect(await page.evaluate(name=>window[name].editor.view().undoDepth,mode.name)).toBe(5);
  await page.keyboard.press("Control+z");await expect(paragraph(page)).toHaveText("aABCDE🙂b");expect(await page.evaluate(name=>window[name].errors,mode.name)).toEqual([]);
 });

 test(`local V${mode.language} paste replacement and composition remain isolated from surrounding typing`,async({page})=>{
  await ready(page,mode.path);await caret(page,mode.name);const original=await page.evaluate(name=>window[name].editor.view().documentJson,mode.name);await page.keyboard.type("AB");
  await page.evaluate(name=>{const e=window[name].editor,event=new ClipboardEvent("paste",{clipboardData:new DataTransfer(),bubbles:true,cancelable:true});event.clipboardData.setData("text/plain","Paste");e.surface.dispatchEvent(event);},mode.name);await page.keyboard.type("C");
  await page.evaluate(name=>{const e=window[name].editor;e.surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));e.surface.querySelector('[data-rich-text="p"]').textContent="aABPasteCに🙂b";e.surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true}));},mode.name);
  await expect.poll(()=>page.evaluate(name=>window[name].editor.view().undoDepth,mode.name)).toBe(4);await page.keyboard.type("D");await expect(paragraph(page)).toHaveText("aABPasteCにD🙂b");
  expect(await page.evaluate(name=>window[name].editor.view().undoDepth,mode.name)).toBe(5);
  expect(await page.evaluate(name=>{const e=window[name].editor;for(let i=0;i<5;i++)e.execute({kind:"undo"});return e.view().documentJson;},mode.name)).toBe(original);
  await page.evaluate(name=>window[name].editor.surface.dispatchEvent(new InputEvent("beforeinput",{inputType:"insertReplacementText",data:"R",bubbles:true,cancelable:true})),mode.name);await page.keyboard.type("S");
  expect(await page.evaluate(name=>window[name].editor.view().undoDepth,mode.name)).toBe(2);await page.evaluate(name=>{window[name].editor.execute({kind:"undo"});window[name].editor.execute({kind:"undo"});},mode.name);
  expect(await page.evaluate(name=>({document:window[name].editor.view().documentJson,errors:window[name].errors}),mode.name)).toEqual({document:original,errors:[]});
 });

 test(`local V${mode.language} exact clock hints explicit recovery and readonly retain native authority`,async({page})=>{
  await ready(page,mode.path);
  const result=await page.evaluate(async({name,language})=>{
   const t=window[name],profile=language===1?await t.createLocalProfile():await t.createStructuralLocalProfileV2(),headless=profile.createEditor(t.editor.view().documentJson);
   try{
    const original=headless.checkpointJson();let originalRejectsTyping=false;try{profile.restoreTypingEditor(original);}catch{originalRejectsTyping=true;}
    headless.enableTypingHistory();headless.execute({kind:"setSelection",selection:t.range("p",1)});
    for(const [text,clockMs]of [["A","9007199254740993"],["B","9007199254741743"],["C","9007199254742494"]])headless.execute({kind:"insertTypingText",data:{text,clockMs}});
    const depth=headless.view().undoDepth,checkpoint=headless.checkpointJson();let groupedRejected=false;try{profile.restoreEditor(checkpoint);}catch{groupedRejected=true;}
    const host=document.createElement("main"),button=document.createElement("button");host.append(button);document.body.append(host);let conflict=false;try{await t.openLocalEditor({host,history:"explicit",initial:{kind:"typingCheckpoint",checkpointJson:checkpoint}});}catch{conflict=host.firstChild===button;}
    const editor=await t.openLocalEditor({host,richLanguage:language,initial:{kind:"typingCheckpoint",checkpointJson:checkpoint},readOnly:true});let denied=false;try{editor.execute({kind:"insertTypingText",data:{text:"No",clockMs:"1"}});}catch(error){denied=error.code==="breditor_rich.read_only";}
    editor.setReadOnly(false);editor.execute({kind:"insertTypingText",data:{text:"New",clockMs:"1"}});const recovered=editor.view().undoDepth===3&&editor.view().historyGrouping==="typing-v1";editor.dispose();host.remove();
    return {depth,originalRejectsTyping,groupedRejected,conflict,denied,recovered,errors:t.errors};
   }finally{headless.dispose();profile.dispose();}
  },mode);
  expect(result).toEqual({depth:2,originalRejectsTyping:true,groupedRejected:true,conflict:true,denied:true,recovered:true,errors:[]});
 });

 test(`local V${mode.language} real pauses forward deletion and caption input preserve grouped boundaries`,async({page})=>{
  await ready(page,mode.path);await caret(page,mode.name);await page.keyboard.type("AB");
  // This delay exercises the actual native monotonic-gap contract, not a retry.
  await page.waitForTimeout(800);await page.keyboard.type("C");expect(await page.evaluate(name=>window[name].editor.view().undoDepth,mode.name)).toBe(2);
  await caret(page,mode.name,"p",0);await page.keyboard.press("Delete");await page.keyboard.press("Delete");await expect(paragraph(page)).toHaveText("BC🙂b");expect(await page.evaluate(name=>window[name].editor.view().undoDepth,mode.name)).toBe(3);
  await page.keyboard.press("Control+z");await expect(paragraph(page)).toHaveText("aABC🙂b");await caret(page,mode.name,"caption",1);await page.keyboard.type("QR");
  await expect(page.locator('#editor [data-rich-text="caption"]')).toHaveText("xQRy🙂");expect(await page.evaluate(name=>window[name].editor.view().undoDepth,mode.name)).toBe(3);
  await page.keyboard.press("Control+z");await expect(page.locator('#editor [data-rich-text="caption"]')).toHaveText("xy🙂");await page.evaluate(name=>window[name].editor.execute({kind:"redo"}),mode.name);
  if(mode.language===2){
   const before=await page.evaluate(()=>({document:window.v2.editor.view().documentJson,depth:window.v2.editor.view().undoDepth}));await caret(page,mode.name,"code",0);await page.keyboard.type("let");await page.keyboard.press("Enter");await page.keyboard.type("new");
   expect(await page.evaluate(()=>window.v2.editor.view().undoDepth)).toBe(before.depth+3);await page.evaluate(()=>{for(let i=0;i<3;i++)window.v2.editor.execute({kind:"undo"});});expect(await page.evaluate(()=>window.v2.editor.view().documentJson)).toBe(before.document);
  }
  expect(await page.evaluate(name=>window[name].errors,mode.name)).toEqual([]);
 });
}

for(const natural of [false,true])test(`${natural?"natural":"explicit"} V2 image file paste retains history and immediate typing through exact reload`,async({page},testInfo)=>{
 await ready(page,natural?"/structural.html?history=typing":"/structural.html");await caret(page,"v2","task-a-head",0);const original=await page.evaluate(()=>window.v2.editor.view().documentJson);await page.keyboard.type("AB");
 await page.evaluate(async()=>{const t=window.v2,canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;canvas.getContext("2d").fillRect(0,0,1,1);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png")),event=new ClipboardEvent("paste",{clipboardData:new DataTransfer(),bubbles:true,cancelable:true});event.clipboardData.items.add(new File([blob],"natural.png",{type:"image/png"}));t.editor.surface.dispatchEvent(event);});
 await expect.poll(()=>page.locator('#editor img[alt="natural.png"]').evaluate(img=>img.naturalWidth)).toBe(1);expect(await page.evaluate(()=>window.v2.editor.view().undoDepth)).toBe(natural?2:3);
 const beforeTyping=await page.evaluate(()=>{const e=window.v2.editor,s=getSelection(),block=node=>(node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement)?.closest?.("[data-rich-text]")?.dataset.richText;return {native:e.view().selection,active:document.activeElement?.tagName,ownsFocus:e.surface.contains(document.activeElement),browser:{anchor:block(s?.anchorNode),focus:block(s?.focusNode),anchorOffset:s?.anchorOffset,focusOffset:s?.focusOffset}};});
 await page.keyboard.type("C");
 if(await page.locator('#editor [data-rich-text="task-a-head"]').textContent()!=="ABCWrite 🙂 draft")await testInfo.attach("image-insertion-caret",{body:JSON.stringify({beforeTyping,after:await page.evaluate(()=>({view:window.v2.editor.view(),errors:window.v2.errors}))}),contentType:"application/json"});
 await expect(page.locator('#editor [data-rich-text="task-a-head"]')).toHaveText("ABCWrite 🙂 draft");expect(await page.evaluate(()=>window.v2.editor.view().undoDepth)).toBe(natural?3:4);
 const saved=await page.evaluate(()=>{window.v2.save();return window.v2.editor.checkpointJson();});await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.v2.editor.checkpointJson())).toBe(saved);await expect.poll(()=>page.locator('#editor img[alt="natural.png"]').evaluate(img=>img.naturalWidth)).toBe(1);
 await page.evaluate(count=>{for(let i=0;i<count;i++)window.v2.editor.execute({kind:"undo"});},natural?3:4);expect(await page.evaluate(()=>({document:window.v2.editor.view().documentJson,errors:window.v2.errors}))).toEqual({document:original,errors:[]});
});

test("asynchronous local image insertion does not steal outside host focus",async({page},testInfo)=>{
 await ready(page,"/?history=typing");await caret(page,"sdk");await page.keyboard.type("AB");
 await page.evaluate(async()=>{const t=window.sdk;document.querySelector("#save").focus();const canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;canvas.getContext("2d").fillRect(0,0,1,1);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));await t.editor.insertImageFiles(t.assets,[new File([blob],"outside.png",{type:"image/png"})],{parent:{kind:"document"},before:null});});
 await expect(page.locator("#save")).toBeFocused();expect(await page.evaluate(()=>window.sdk.editor.view().undoDepth)).toBe(2);
 const beforeRestore=await page.evaluate(()=>({selection:window.sdk.editor.view().selection,active:document.activeElement?.id}));
 await page.evaluate(()=>window.sdk.editor.focus());await page.keyboard.type("C");
 if(await paragraph(page).textContent()!=="aABC🙂b")await testInfo.attach("outside-focus-selection",{body:JSON.stringify({beforeRestore,after:await page.evaluate(()=>({selection:window.sdk.editor.view().selection,errors:window.sdk.errors}))}),contentType:"application/json"});
 await expect(paragraph(page)).toHaveText("aABC🙂b");expect(await page.evaluate(()=>window.sdk.errors)).toEqual([]);
});

test("local React natural history retains one owner across renders and exact declared recovery",async({page})=>{
 await ready(page,"/react.html?history=typing");await page.evaluate(()=>{const t=window.reactSdk,e=t.ref.current.getEditor();t.original=e;e.execute({kind:"setSelection",selection:t.range("p",1)});e.focus();});await page.keyboard.type("ABC");
 const before=await page.evaluate(()=>{const t=window.reactSdk;t.ref.current.closeTypingGroup();return t.ref.current.checkpointJson();});await page.locator("#rerender").click();await expect(page.locator("#render-count")).toHaveText("1");
 expect(await page.evaluate(()=>({same:window.reactSdk.original===window.reactSdk.ref.current.getEditor(),checkpoint:window.reactSdk.ref.current.checkpointJson(),ready:window.reactSdk.ready}))).toEqual({same:true,checkpoint:before,ready:1});
 await page.evaluate(()=>window.reactSdk.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.reactSdk.ref.current.checkpointJson())).toBe(before);
 await page.evaluate(()=>window.reactSdk.ref.current.execute({kind:"undo"}));await expect(page.locator('[data-rich-text="p"]')).toHaveText("a🙂b");await page.evaluate(()=>window.reactSdk.ref.current.execute({kind:"redo"}));await expect(page.locator('[data-rich-text="p"]')).toHaveText("aABC🙂b");expect(await page.evaluate(()=>window.reactSdk.errors)).toEqual([]);
});
