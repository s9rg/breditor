import {test,expect} from "@playwright/test";
const ready=async(page,mode,extra="")=>{await page.goto(`/code-exit.html?flow=1&mode=${mode}${extra}`);await expect(page.locator("#ready")).toHaveText("Ready");};
const select=async(page,block)=>page.evaluate(block=>{const t=window.codeExit;t.select({kind:"node",block});t.a.focus();},block);
const document=page=>page.evaluate(()=>window.codeExit.a.view().documentJson);
const selection=page=>page.evaluate(()=>window.codeExit.a.view().selection);
const history=(page,redo=false)=>page.evaluate(redo=>window.codeExit.history(redo),redo);
const errors=async page=>expect(await page.evaluate(()=>window.codeExit.errors)).toEqual([]);
const node=async(page,id)=>page.evaluate(id=>window.codeExit.node(id)??null,id);
async function reload(page){const saved=await page.evaluate(()=>window.codeExit.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(saved);}
// Firefox supplies a different event store; populate the actual clipboard boundary.
const transfer=(page,type,plain="")=>page.evaluate(({type,plain})=>{const event=new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:new DataTransfer()});if(plain)event.clipboardData.setData("text/plain",plain);return window.codeExit.a.surface.dispatchEvent(event);},{type,plain});
for(const mode of ["local","shared"]){
 for(const [only,target] of [["table","table-block"],["image","image-block"],["rule","root-next"]]){
  test(`${mode} selected ${only} first-key replacement and following typing are one exact natural unit`,async({page})=>{
   await ready(page,mode,`&only=${only}&history=typing&toolbar=none`);await select(page,target);const before=await document(page),original=await node(page,target);
   await page.keyboard.type("Q");await page.keyboard.type("R");let s=await selection(page);expect(s.kind).toBe("text");expect(s.focus.offset).toBe("2");expect(await node(page,target)).toBeNull();expect(await page.evaluate(()=>window.codeExit.a.view().undoDepth)).toBe(1);
   const after=await document(page);await reload(page);await history(page);expect(await document(page)).toBe(before);expect(await node(page,target)).toEqual(original);await history(page,true);expect(await document(page)).toBe(after);await errors(page);
  });
  test(`${mode} sole ${only} deletion creates a usable real floor and retains exact source through history`,async({page})=>{
   await ready(page,mode,`&only=${only}&toolbar=none`);const before=await document(page);
   for(const key of ["Backspace","Delete"]){await select(page,target);await page.keyboard.press(key);const s=await selection(page);expect(s.kind).toBe("text");expect(s.focus.offset).toBe("0");expect(await node(page,target)).toBeNull();expect(JSON.parse(await document(page)).root.children).toHaveLength(1);await page.keyboard.type("X");await history(page);await history(page);expect(await document(page)).toBe(before);}
   await select(page,target);await page.keyboard.press("Delete");const after=await document(page);await reload(page);await history(page);expect(await document(page)).toBe(before);await history(page,true);expect(await document(page)).toBe(after);await errors(page);
  });
 }
 test(`${mode} directional deletion chooses native stops without adding gratuitous paragraphs`,async({page})=>{
  await ready(page,mode);const before=await document(page);
  for(const [key,block,offset] of [["Backspace","code-root","7"],["Delete","code-quote","0"]]){
   await select(page,"root-next");await page.keyboard.press(key);const s=await selection(page);expect(s.kind).toBe("text");expect(s.focus.block).toBe(block);expect(s.focus.offset).toBe(offset);expect(await node(page,"root-next")).toBeNull();await history(page);expect(await document(page)).toBe(before);
  }await errors(page);
 });
 test(`${mode} plain clipboard replacement is explicit while empty paste and readonly keys retain the atom`,async({page})=>{
  await ready(page,mode,"&only=image&history=typing&toolbar=none");await select(page,"image-block");const before=await document(page),checkpoint=await page.evaluate(()=>window.codeExit.a.checkpointJson());
  await transfer(page,"paste");expect(await document(page)).toBe(before);expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(checkpoint);
  await page.evaluate(()=>window.codeExit.a.setReadOnly(true));await select(page,"image-block");await page.keyboard.press("Delete");await page.keyboard.type("Q");await transfer(page,"paste","Blocked");expect(await document(page)).toBe(before);expect((await selection(page)).kind).toBe("node");
  await page.evaluate(()=>window.codeExit.a.setReadOnly(false));await select(page,"image-block");await transfer(page,"paste","Paste 🙂\nNext");const s=await selection(page);expect(s.kind).toBe("text");expect(s.focus.offset).toBe("13");expect(await node(page,"image-block")).toBeNull();expect(await page.evaluate(()=>window.codeExit.a.view().undoDepth)).toBe(1);
  await page.keyboard.type("Q");expect(await page.evaluate(()=>window.codeExit.a.view().undoDepth)).toBe(2);const after=await document(page);await reload(page);await history(page);await history(page);expect(await document(page)).toBe(before);await history(page,true);await history(page,true);expect(await document(page)).toBe(after);await errors(page);
 });
 test(`${mode} browser beforeinput and Cut route through native deletion and safe recovery`,async({page})=>{
  await ready(page,mode,"&only=rule&toolbar=none");await select(page,"root-next");const before=await document(page);
  await page.evaluate(()=>window.codeExit.a.surface.dispatchEvent(new InputEvent("beforeinput",{bubbles:true,cancelable:true,inputType:"deleteContentBackward"})));expect((await selection(page)).kind).toBe("text");await history(page);expect(await document(page)).toBe(before);
  await select(page,"root-next");await page.evaluate(()=>window.codeExit.a.surface.dispatchEvent(new InputEvent("beforeinput",{bubbles:true,cancelable:true,inputType:"insertReplacementText",data:"Replacement"})));expect((await selection(page)).focus.offset).toBe("11");await history(page);expect(await document(page)).toBe(before);
  await select(page,"root-next");await transfer(page,"cut");expect(await node(page,"root-next")).toBeNull();expect((await selection(page)).kind).toBe("text");await history(page);expect(await document(page)).toBe(before);await errors(page);
 });
 test(`${mode} atom first-key routing retains widget composition and modified-key ownership`,async({page})=>{
  await ready(page,mode,"&only=image&history=typing&toolbar=none");await select(page,"image-block");const before=await document(page),saved=await page.evaluate(()=>window.codeExit.a.checkpointJson());
  await page.locator("#a").getByRole("button",{name:"Select image",exact:true}).focus();await page.keyboard.type("Q");expect(await document(page)).toBe(before);
  await select(page,"image-block");await page.evaluate(()=>{const s=window.codeExit.a.surface;for(const init of [{key:"Q",isComposing:true},{key:"Q",altKey:true},{key:"Q",ctrlKey:true}])s.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,cancelable:true,...init}));s.dispatchEvent(new InputEvent("beforeinput",{bubbles:true,cancelable:true,isComposing:true,inputType:"insertText",data:"Q"}));});
  expect(await document(page)).toBe(before);expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(saved);
  const prevented=await page.evaluate(()=>!window.codeExit.a.surface.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,cancelable:true,key:"🙂"})));expect(prevented).toBe(true);expect((await selection(page)).focus.offset).toBe("2");expect(await page.evaluate(()=>window.codeExit.a.view().undoDepth)).toBe(1);await history(page);expect(await document(page)).toBe(before);await errors(page);
 });
}
test("shared atom replacement preserves offline peer caption edits and peer replacement text across selective history and restart",async({page})=>{
 await ready(page,"shared","&only=image&history=typing&toolbar=none");await select(page,"image-block");await page.keyboard.type("QR");const own=(await selection(page)).focus.block;
 await page.evaluate(async own=>{const t=window.codeExit;t.b.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Peer source"}}]});await t.sync();t.b.core.dispatch({commands:[{kind:"insert_text",data:{block:own,offset:0,text:"Peer destination"}}]});await t.sync();},own);
 const after=await document(page);await reload(page);await history(page);expect(JSON.stringify(await node(page,"caption"))).toContain("Peer source");expect(await node(page,own)).toBeNull();await history(page,true);expect(await document(page)).toBe(after);expect(JSON.stringify(await node(page,own))).toContain("Peer destination");await errors(page);
});
test("installed local React atom replacement survives rerender and exact history after reload",async({page})=>{
 await page.goto("/structural-react.html");await expect(page.locator("#ready")).toHaveText("Ready");
 const before=await page.evaluate(()=>{const t=window.v2React,e=t.ref.current.getEditor();t.original=e;e.execute({kind:"setSelection",selection:{kind:"node",block:"rule"}});e.focus();return e.view().documentJson;});
 await page.keyboard.type("Q");const after=await page.evaluate(()=>window.v2React.ref.current.getEditor().view().documentJson);expect(after).not.toBe(before);
 const saved=await page.evaluate(()=>{const t=window.v2React;t.save();return t.ref.current.checkpointJson();});await page.locator("#rerender").click();await expect(page.locator("#count")).toHaveText("1");expect(await page.evaluate(()=>window.v2React.original===window.v2React.ref.current.getEditor())).toBe(true);
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.v2React.ref.current.checkpointJson())).toBe(saved);
 await page.evaluate(()=>window.v2React.ref.current.getEditor().execute({kind:"undo"}));expect(await page.evaluate(()=>window.v2React.ref.current.getEditor().view().documentJson)).toBe(before);await page.evaluate(()=>window.v2React.ref.current.getEditor().execute({kind:"redo"}));expect(await page.evaluate(()=>window.v2React.ref.current.getEditor().view().documentJson)).toBe(after);expect(await page.evaluate(()=>window.v2React.errors)).toEqual([]);
});
test("installed shared React atom typing retains its native unit across writer replacement and reload",async({page})=>{
 await page.goto("/shared-structural-react.html?history=typing");await expect(page.locator("#ready")).toHaveText("Ready");
 const before=await page.evaluate(()=>{const t=window.sharedV2React,e=t.ref.current.getEditor();t.original=e;e.select({kind:"node",block:"rule"});e.focus();return e.view().documentJson;});await page.keyboard.type("QR");
 const saved=await page.evaluate(async()=>{const t=window.sharedV2React,e=t.ref.current.getEditor();e.closeTypingGroup();await e.flush();return {checkpoint:e.checkpointJson(),document:e.view().documentJson,depth:e.view().undoDepth,ready:t.ready};});expect(saved.depth).toBe(1);
 await page.locator("#rerender").click();await expect(page.locator("#count")).toHaveText("1");expect(await page.evaluate(()=>window.sharedV2React.original===window.sharedV2React.ref.current.getEditor())).toBe(true);
 await page.locator("#reopen").click();await expect.poll(()=>page.evaluate(()=>window.sharedV2React.ready)).toBeGreaterThan(saved.ready);expect(await page.evaluate(()=>window.sharedV2React.ref.current.checkpointJson())).toBe(saved.checkpoint);
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.sharedV2React.ref.current.checkpointJson())).toBe(saved.checkpoint);
 await page.evaluate(()=>window.sharedV2React.ref.current.getEditor().core.undo());expect(await page.evaluate(()=>window.sharedV2React.ref.current.getEditor().view().documentJson)).toBe(before);await page.evaluate(()=>window.sharedV2React.ref.current.getEditor().core.redo());expect(await page.evaluate(()=>window.sharedV2React.ref.current.getEditor().view().documentJson)).toBe(saved.document);expect(await page.evaluate(()=>({errors:window.sharedV2React.errors,close:window.sharedV2React.closeErrors}))).toEqual({errors:[],close:[]});
});
