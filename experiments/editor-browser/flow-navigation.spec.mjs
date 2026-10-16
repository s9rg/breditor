import {test,expect} from "@playwright/test";
const ready=async(page,mode,extra="")=>{await page.goto(`/code-exit.html?flow=1&mode=${mode}${extra}`);await expect(page.locator("#ready")).toHaveText("Ready");};
const select=async(page,selection)=>page.evaluate(selection=>{const t=window.codeExit;t.select(selection);t.a.focus();},selection);
const caret=(block,offset=0,end=offset)=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}});
const node=block=>({kind:"node",block});
const doc=page=>page.evaluate(()=>window.codeExit.a.view().documentJson);
const selection=page=>page.evaluate(()=>window.codeExit.a.view().selection);
const controls=(page,name)=>page.locator("#a").getByRole("button",{name,exact:true});
const errors=async page=>expect(await page.evaluate(()=>window.codeExit.errors)).toEqual([]);
const history=(page,redo=false)=>page.evaluate(redo=>window.codeExit.history(redo),redo);
async function placement(page,target,fresh){return page.evaluate(({target,fresh})=>{
 const root=JSON.parse(window.codeExit.a.view().documentJson).root;
 function find(parent){const children=parent.children??[],index=children.findIndex(n=>n.properties?.["breditor/block-id"]===target);if(index!==-1)return {target:children[index],index,fresh:children.findIndex(n=>n.properties?.["breditor/block-id"]===fresh),parent:parent.properties?.["breditor/block-id"]??"document"};for(const n of children){const found=find(n);if(found)return found;}}
 return find(root);
},{target,fresh});}

for(const mode of ["local","shared"]){
 test(`${mode} native logical controls retain readonly Redo ranges domains and hidden-table boundaries`,async({page})=>{
  await ready(page,mode);await select(page,caret("before",4));const original=await doc(page);
  await page.keyboard.type("Q");await history(page);expect(await doc(page)).toBe(original);
  const frame=mode==="shared"?await page.evaluate(()=>window.codeExit.a.core.updateFrame()):null;
  await controls(page,"Next block").click();expect(await selection(page)).toEqual(node("table-block"));
  await page.evaluate(()=>window.codeExit.a.setReadOnly(true));await expect(controls(page,"Next block")).toBeEnabled();await expect(controls(page,"Paragraph after")).toBeDisabled();
  await controls(page,"Next block").click();expect(await selection(page)).toEqual(caret("code-root"));
  await select(page,caret("code-root",7));await controls(page,"Next block").click();expect(await selection(page)).toEqual(node("root-next"));await controls(page,"Next block").click();expect(await selection(page)).toEqual(caret("code-quote"));
  expect(await page.evaluate(()=>window.codeExit.a.view().redoDepth)).toBe(1);expect(await doc(page)).toBe(original);if(mode==="shared")expect(await page.evaluate(()=>window.codeExit.a.core.updateFrame())).toBe(frame);
  await page.evaluate(()=>window.codeExit.a.setReadOnly(false));await select(page,caret("before",4,0));await expect(controls(page,"Next block")).toBeDisabled();expect(await selection(page)).toEqual(caret("before",4,0));const rangeCheckpoint=await page.evaluate(()=>window.codeExit.a.checkpointJson());await page.keyboard.press("Alt+PageDown");expect(await selection(page)).toEqual(caret("before",4,0));expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(rangeCheckpoint);
  await select(page,caret("p"));const prior=await page.evaluate(()=>window.codeExit.a.checkpointJson());await controls(page,"Previous block").click();expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(prior);
  await select(page,caret("code-root"));await page.locator("#a").getByRole("textbox",{name:"Code language",exact:true}).focus();await page.keyboard.press("Alt+PageDown");expect(await selection(page)).toEqual(caret("code-root"));await errors(page);
 });
 for(const target of ["table-block","image-block","root-next"]){
  test(`${mode} explicit paragraph before and after ${target} retain source placement and exact future reload`,async({page})=>{
   await ready(page,mode);const before=await doc(page);let after;
   for(const side of ["before","after"]){
    await select(page,node(target));const source=await page.evaluate(id=>window.codeExit.node(id),target);await controls(page,`Paragraph ${side}`).click();const fresh=(await selection(page)).focus.block;
    expect(await selection(page)).toEqual(caret(fresh));const at=await placement(page,target,fresh);expect(at.target).toEqual(source);expect(at.fresh).toBe(at.index+(side==="before"?-1:1));expect(await page.evaluate(()=>window.codeExit.a.view().undoDepth)).toBe(1);
    after=await doc(page);await history(page);expect(await doc(page)).toBe(before);await history(page,true);expect(await doc(page)).toBe(after);if(side==="before")await history(page);
   }
   const saved=await page.evaluate(()=>window.codeExit.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(saved);await history(page);expect(await doc(page)).toBe(before);await history(page,true);expect(await doc(page)).toBe(after);await errors(page);
  });
 }
 test(`${mode} selected atom Enter Shift Enter and synthetic beforeinput routes create only one native paragraph`,async({page})=>{
  await ready(page,mode);const before=await doc(page);await select(page,node("root-next"));await page.keyboard.press("Enter");let fresh=(await selection(page)).focus.block;let at=await placement(page,"root-next",fresh);expect(at.fresh).toBe(at.index+1);
  await page.keyboard.type("A");await history(page);await history(page);expect(await doc(page)).toBe(before);
  await select(page,node("root-next"));await page.keyboard.press("Shift+Enter");fresh=(await selection(page)).focus.block;at=await placement(page,"root-next",fresh);expect(at.fresh).toBe(at.index-1);expect(await page.evaluate(()=>window.codeExit.a.view().undoDepth)).toBe(1);await history(page);expect(await doc(page)).toBe(before);
  await select(page,node("root-next"));await page.evaluate(()=>window.codeExit.a.surface.dispatchEvent(new InputEvent("beforeinput",{bubbles:true,cancelable:true,inputType:"insertLineBreak"})));fresh=(await selection(page)).focus.block;at=await placement(page,"root-next",fresh);expect(at.fresh).toBe(at.index-1);expect(await page.evaluate(()=>window.codeExit.a.view().undoDepth)).toBe(1);await errors(page);
 });
 for(const [scope,parent] of [["cell","cell"],["quote","quote"],["list","item"],["task","task"]]){
  test(`${mode} atom-adjacent paragraphs retain ${scope} parent and exact restored history`,async({page})=>{
   await ready(page,mode);const target=`rule-${scope}`,before=await doc(page);let after;
   for(const side of ["before","after"]){
    await select(page,node(target));await controls(page,`Paragraph ${side}`).click();const fresh=(await selection(page)).focus.block,at=await placement(page,target,fresh);expect(at.parent).toBe(parent);expect(at.fresh).toBe(at.index+(side==="before"?-1:1));after=await doc(page);await history(page);expect(await doc(page)).toBe(before);if(side==="after")await history(page,true);
   }
   const saved=await page.evaluate(()=>window.codeExit.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(saved);expect(await doc(page)).toBe(after);await history(page);expect(await doc(page)).toBe(before);await history(page,true);expect(await doc(page)).toBe(after);await errors(page);
  });
 }
 test(`${mode} bare toolbar logical keyboard and atom Enter preserve three natural units after reload`,async({page})=>{
  await ready(page,mode,"&toolbar=none&history=typing");await expect(controls(page,"Next block")).toHaveCount(0);await select(page,caret("before",4));const original=await doc(page);
  await page.keyboard.type("X");const first=await doc(page);await page.keyboard.press("Alt+PageDown");expect(await selection(page)).toEqual(node("table-block"));await page.keyboard.press("Enter");await page.keyboard.type("A");expect(await page.evaluate(()=>window.codeExit.a.view().undoDepth)).toBe(3);
  const after=await doc(page),saved=await page.evaluate(()=>window.codeExit.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(saved);await history(page);await history(page);expect(await doc(page)).toBe(first);await history(page);expect(await doc(page)).toBe(original);for(let i=0;i<3;i++)await history(page,true);expect(await doc(page)).toBe(after);await errors(page);
 });
 for(const [only,target] of [["table","table-block"],["image","image-block"],["rule","root-next"]]){
  test(`${mode} atom-only ${only} gains real text on either side without hidden normalization`,async({page})=>{
   await ready(page,mode,`&only=${only}&toolbar=none`);await select(page,node(target));const original=await doc(page),source=await page.evaluate(id=>window.codeExit.node(id),target),saved=await page.evaluate(()=>window.codeExit.a.checkpointJson());
   await page.keyboard.press("Alt+PageDown");expect(await selection(page)).toEqual(node(target));expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(saved);
   await page.keyboard.press("Enter");await page.keyboard.type("P");await history(page);await history(page);expect(await doc(page)).toBe(original);
   await select(page,node(target));await page.keyboard.press("Shift+Enter");const fresh=(await selection(page)).focus.block,at=await placement(page,target,fresh);expect(at.target).toEqual(source);expect(at.fresh).toBe(at.index-1);
   const checkpoint=await page.evaluate(()=>window.codeExit.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(checkpoint);await history(page);expect(await doc(page)).toBe(original);await errors(page);
  });
 }
}
test("shared concurrent atom exits and text inside an owned paragraph survive selective Undo and exact restart",async({page})=>{
 await ready(page,"shared","&history=typing");await select(page,node("root-next"));await page.keyboard.press("Enter");const own=(await selection(page)).focus.block;
 await page.evaluate(()=>{const t=window.codeExit;t.select({kind:"node",block:"root-next"},t.b);t.b.focus();});await page.keyboard.press("Enter");const peer=await page.evaluate(()=>window.codeExit.b.view().selection.focus.block);expect(peer).not.toBe(own);
 await page.evaluate(async own=>{const t=window.codeExit;await t.sync();t.b.core.dispatch({commands:[{kind:"insert_text",data:{block:own,offset:0,text:"Peer 🙂"}}]});await t.sync();},own);const both=await doc(page);
 await history(page);expect(await page.evaluate(id=>window.codeExit.node(id)??null,own)).toBeNull();expect(await page.evaluate(id=>!!window.codeExit.node(id),peer)).toBe(true);
 const saved=await page.evaluate(()=>window.codeExit.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(saved);await history(page,true);expect(await doc(page)).toBe(both);await page.evaluate(()=>window.codeExit.sync());expect(await doc(page)).toBe(both);await errors(page);
});

test("installed local React flow insertion retains its owner on rerender and exact future history after reload",async({page})=>{
 await page.goto("/structural-react.html");await expect(page.locator("#ready")).toHaveText("Ready");
 const before=await page.evaluate(()=>{const t=window.v2React,e=t.ref.current.getEditor();t.original=e;e.execute({kind:"setSelection",selection:{kind:"node",block:"rule"}});e.focus();return e.view().documentJson;});
 await page.getByRole("button",{name:"Paragraph after",exact:true}).click();await page.keyboard.type("R");
 const saved=await page.evaluate(()=>{const t=window.v2React,e=t.ref.current.getEditor();t.save();return {checkpoint:e.checkpointJson(),document:e.view().documentJson,ready:t.ready};});
 await page.locator("#rerender").click();await expect(page.locator("#count")).toHaveText("1");expect(await page.evaluate(()=>({same:window.v2React.original===window.v2React.ref.current.getEditor(),checkpoint:window.v2React.ref.current.checkpointJson(),ready:window.v2React.ready,errors:window.v2React.errors}))).toEqual({same:true,checkpoint:saved.checkpoint,ready:saved.ready,errors:[]});
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.v2React.ref.current.checkpointJson())).toBe(saved.checkpoint);
 await page.evaluate(()=>{const e=window.v2React.ref.current.getEditor();e.execute({kind:"undo"});e.execute({kind:"undo"});});expect(await page.evaluate(()=>window.v2React.ref.current.getEditor().view().documentJson)).toBe(before);
 await page.evaluate(()=>{const e=window.v2React.ref.current.getEditor();e.execute({kind:"redo"});e.execute({kind:"redo"});});expect(await page.evaluate(()=>window.v2React.ref.current.getEditor().view().documentJson)).toBe(saved.document);expect(await page.evaluate(()=>window.v2React.errors)).toEqual([]);
});

test("installed shared React flow insertion retains grouped history on rerender writer replacement and reload",async({page})=>{
 await page.goto("/shared-structural-react.html?history=typing");await expect(page.locator("#ready")).toHaveText("Ready");
 const before=await page.evaluate(()=>{const t=window.sharedV2React,e=t.ref.current.getEditor();t.original=e;e.select({kind:"node",block:"rule"});e.focus();return e.view().documentJson;});
 await page.getByRole("button",{name:"Paragraph before",exact:true}).click();await page.keyboard.type("R");
 const saved=await page.evaluate(async()=>{const t=window.sharedV2React,e=t.ref.current.getEditor();e.closeTypingGroup();await e.flush();return {checkpoint:e.checkpointJson(),document:e.view().documentJson,ready:t.ready};});
 await page.locator("#rerender").click();await expect(page.locator("#count")).toHaveText("1");expect(await page.evaluate(()=>({same:window.sharedV2React.original===window.sharedV2React.ref.current.getEditor(),checkpoint:window.sharedV2React.ref.current.checkpointJson(),ready:window.sharedV2React.ready}))).toEqual({same:true,checkpoint:saved.checkpoint,ready:saved.ready});
 await page.locator("#reopen").click();await expect.poll(()=>page.evaluate(()=>window.sharedV2React.ready)).toBeGreaterThan(saved.ready);expect(await page.evaluate(()=>window.sharedV2React.ref.current.checkpointJson())).toBe(saved.checkpoint);expect(await page.evaluate(()=>({errors:window.sharedV2React.errors,closeErrors:window.sharedV2React.closeErrors}))).toEqual({errors:[],closeErrors:[]});
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.sharedV2React.ref.current.checkpointJson())).toBe(saved.checkpoint);
 await page.evaluate(()=>{const e=window.sharedV2React.ref.current.getEditor();e.core.undo();e.core.undo();});expect(await page.evaluate(()=>window.sharedV2React.ref.current.getEditor().view().documentJson)).toBe(before);
 await page.evaluate(()=>{const e=window.sharedV2React.ref.current.getEditor();e.core.redo();e.core.redo();});expect(await page.evaluate(()=>window.sharedV2React.ref.current.getEditor().view().documentJson)).toBe(saved.document);expect(await page.evaluate(()=>({errors:window.sharedV2React.errors,closeErrors:window.sharedV2React.closeErrors}))).toEqual({errors:[],closeErrors:[]});
});
