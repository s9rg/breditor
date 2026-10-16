import {test,expect} from "@playwright/test";
const ready=async(page,mode,extra="")=>{const wrongBootstrap=[];page.on("request",r=>{if(new URL(r.url()).pathname==="/relay-bootstrap.json")wrongBootstrap.push(r.url());});await page.goto(`/code-exit.html?mode=${mode}${extra}`);await expect(page.locator("#ready")).toHaveText("Ready");expect(wrongBootstrap).toEqual([]);};
const select=async(page,block,start=1,end=start)=>page.evaluate(({block,start,end})=>{const t=window.codeExit;t.select(t.range(block,start,end));t.a.focus();},{block,start,end});
const doc=page=>page.evaluate(()=>window.codeExit.a.view().documentJson);
const errors=page=>page.evaluate(()=>window.codeExit.errors);
const action=page=>page.locator("#a").getByRole("button",{name:"Exit code",exact:true});
for(const mode of ["local","shared"]){
 for(const [name,targets] of [["root and trailing empty code",["code-root","code-last"]],["cell and quote flows",["code-cell","code-quote"]],["list and task bodies",["code-list","code-task"]]]){
  test(`${mode} Mod Enter preserves ${name} and exact recovered future history`,async({page})=>{
   await ready(page,mode);
   for(const target of targets){
    await select(page,target,target==="code-last"?0:1);await expect(action(page)).toBeEnabled();
    const before=await doc(page),source=await page.evaluate(id=>window.codeExit.node(id),target);
    await page.keyboard.press("Control+Enter");
    const state=await page.evaluate(target=>{const t=window.codeExit,s=t.a.view().selection,n=t.a.surface.querySelector(`[data-rich-text="${target}"]`),fresh=n?.closest("[data-rich-block]")?.nextElementSibling;return {selection:s,depth:t.a.view().undoDepth,pending:t.a.view().pendingFormatsJson,source:t.node(target),fresh:fresh?.dataset.richText,tag:fresh?.tagName};},target);
    expect(state.source).toEqual(source);expect(state.depth).toBe(1);expect(state.pending).toBeNull();expect(state.selection.anchor).toEqual(state.selection.focus);expect(state.selection.focus.offset).toBe("0");expect(state.fresh).toBe(state.selection.focus.block);expect(state.tag).toBe("P");await expect(action(page)).toBeDisabled();
    const after=await doc(page);await page.evaluate(()=>window.codeExit.history());expect(await doc(page)).toBe(before);await page.evaluate(()=>window.codeExit.history(true));expect(await doc(page)).toBe(after);await page.evaluate(()=>window.codeExit.history());expect(await doc(page)).toBe(before);
   }
   await select(page,targets.at(-1),targets.at(-1)==="code-last"?0:1);await page.keyboard.press("Meta+Enter");const after=await doc(page),saved=await page.evaluate(()=>window.codeExit.save());
   await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(saved);expect(await doc(page)).toBe(after);
   await page.evaluate(()=>{window.codeExit.history();window.codeExit.history(true);});expect(await doc(page)).toBe(after);expect(await errors(page)).toEqual([]);
  });
 }
 test(`${mode} code exit button and normal Enter respect ranges readonly and native fields`,async({page})=>{
  await ready(page,mode);await select(page,"code-root");const original=await doc(page);
  await page.keyboard.press("Enter");expect(await page.evaluate(()=>window.codeExit.node("code-root").children.map(x=>x.text).join(""))).toBe("a\n🙂\r\n\tb");await page.evaluate(()=>window.codeExit.history());expect(await doc(page)).toBe(original);
  await select(page,"code-root",3,1);await expect(action(page)).toBeDisabled();const selected=await doc(page);await page.keyboard.press("Control+Enter");expect(await doc(page)).toBe(selected);expect(await page.evaluate(()=>window.codeExit.a.view().selection.focus.offset)).toBe("1");
  await select(page,"code-root");await page.evaluate(()=>{window.codeExit.a.setReadOnly(true);window.codeExit.a.focus();});await page.keyboard.press("Control+Enter");expect(await doc(page)).toBe(original);await expect(action(page)).toBeDisabled();await page.evaluate(()=>window.codeExit.a.setReadOnly(false));
  await select(page,"code-root");await page.locator("#a").getByRole("textbox",{name:"Code language",exact:true}).focus();await page.keyboard.press("Control+Enter");expect(await doc(page)).toBe(original);
  await action(page).click();expect(await page.evaluate(()=>window.codeExit.a.view().selection.focus.offset)).toBe("0");await page.keyboard.type("A");
  expect(await page.evaluate(()=>{const t=window.codeExit;return t.node(t.a.view().selection.focus.block).children;})).toEqual([{kind:"text",text:"A",formats:[]}]);expect(await errors(page)).toEqual([]);
 });
 test(`${mode} code exit works without a toolbar and fences natural typing through reload`,async({page})=>{
  await ready(page,mode,"&toolbar=none&history=typing");await expect(action(page)).toHaveCount(0);await select(page,"code-task");const original=await doc(page);
  await page.keyboard.type("X");const code=await doc(page);await page.keyboard.press("Control+Enter");await page.keyboard.type("A");expect(await page.evaluate(()=>window.codeExit.a.view().undoDepth)).toBe(3);
  const after=await doc(page),saved=await page.evaluate(()=>window.codeExit.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(saved);
  await page.evaluate(()=>{window.codeExit.history();window.codeExit.history();});expect(await doc(page)).toBe(code);await page.evaluate(()=>window.codeExit.history());expect(await doc(page)).toBe(original);
  await page.evaluate(()=>{for(let i=0;i<3;i++)window.codeExit.history(true);});expect(await doc(page)).toBe(after);expect(await errors(page)).toEqual([]);
 });
}
test("shared concurrent code exits retain peer paragraph code edits and exact selective recovery",async({page})=>{
 await ready(page,"shared");await select(page,"code-root");await page.keyboard.press("Control+Enter");const own=await page.evaluate(()=>window.codeExit.a.view().selection.focus.block);
 await page.evaluate(()=>{const t=window.codeExit;t.select(t.range("code-root",1),t.b);t.b.focus();});await page.keyboard.press("Meta+Enter");const peer=await page.evaluate(()=>window.codeExit.b.view().selection.focus.block);expect(peer).not.toBe(own);
 await page.evaluate(async()=>{const t=window.codeExit;t.b.core.dispatch({commands:[{kind:"insert_text",data:{block:"code-root",offset:0,text:"Peer "}}]});await t.sync();});const both=await doc(page);
 await page.evaluate(()=>window.codeExit.history());const result=await page.evaluate(({own,peer})=>{const t=window.codeExit;return {own:!!t.node(own),peer:!!t.node(peer),code:t.node("code-root").children.map(n=>n.text).join("")};},{own,peer});expect(result).toEqual({own:false,peer:true,code:"Peer a🙂\r\n\tb"});
 const saved=await page.evaluate(()=>window.codeExit.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.codeExit.a.checkpointJson())).toBe(saved);await page.evaluate(()=>window.codeExit.history(true));expect(await doc(page)).toBe(both);await page.evaluate(()=>window.codeExit.sync());expect(await doc(page)).toBe(both);expect(await errors(page)).toEqual([]);
});
