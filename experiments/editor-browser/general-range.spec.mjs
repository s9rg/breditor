import {test,expect} from "@playwright/test";
const ready=async(page,mode,natural,extra="")=>{await page.goto(`/general-range.html?mode=${mode}&history=${natural?"typing":"explicit"}${extra}`);await expect(page.locator("#ready")).toHaveText("Ready");};
const document=page=>page.evaluate(()=>window.generalRange.a.view().documentJson);
const history=(page,redo=false)=>page.evaluate(redo=>window.generalRange.history(redo),redo);
const clean=async page=>{expect(await page.evaluate(()=>({errors:window.generalRange.errors,close:window.generalRange.closeErrors}))).toEqual({errors:[],close:[]});};
async function nativeRange(page,backward=false,caption=false){return page.evaluate(({backward,caption})=>{
 const t=window.generalRange,s=caption?t.range("caption",1,"q1",2):t.range("p-1-2",1,"p-2-0",3);if(backward)[s.anchor,s.focus]=[s.focus,s.anchor];
 const endpoint=p=>{const block=t.a.surface.querySelector(`[data-rich-text="${p.block}"]`),walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);let n=walker.nextNode(),left=Number(p.offset);while(n&&left>n.textContent.length){left-=n.textContent.length;n=walker.nextNode();}if(!n)throw Error("Missing range endpoint");return[n,left];};
 t.a.focus();const a=endpoint(s.anchor),f=endpoint(s.focus);getSelection().setBaseAndExtent(a[0],a[1],f[0],f[1]);return s;
 },{backward,caption});}
for(const mode of ["local","shared"])for(const natural of [false,true]){
 for(const backward of [false,true])test(`${mode} ${natural?"natural":"explicit"} ${backward?"backward":"forward"} cross-cell typing deletion and plain paste recover exactly`,async({page})=>{
  await ready(page,mode,natural);const before=await document(page),target=await nativeRange(page,backward);await page.keyboard.type(natural?"QY":"Q");
  const after=await document(page);expect(after).not.toBe(before);expect(await page.evaluate(()=>window.generalRange.a.view().undoDepth)).toBe(1);expect(await page.locator('#a [data-rich-table="t"]').count()).toBe(1);await history(page);expect(await document(page)).toBe(before);expect(await page.evaluate(()=>window.generalRange.a.view().selection)).toEqual(target);await history(page,true);expect(await document(page)).toBe(after);
  const saved=await page.evaluate(()=>window.generalRange.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.generalRange.a.checkpointJson())).toBe(saved);await history(page);expect(await document(page)).toBe(before);await history(page,true);expect(await document(page)).toBe(after);await history(page);
  await nativeRange(page,backward);await page.keyboard.press("Backspace");expect(await document(page)).not.toBe(before);await history(page);expect(await document(page)).toBe(before);
  await nativeRange(page,backward);await page.keyboard.press("Shift+Enter");expect(await document(page)).not.toBe(before);await history(page);expect(await document(page)).toBe(before);
  await nativeRange(page,backward);await page.evaluate(()=>{const transfer=new DataTransfer();transfer.setData("text/plain","Pasted🙂");const event=new ClipboardEvent("paste",{bubbles:true,cancelable:true});
   // Firefox ignores constructor-supplied DataTransfer for synthetic ClipboardEvent.
   // This deliberately injected fixture qualifies routing, never native OS clipboard delivery.
   Object.defineProperty(event,"clipboardData",{value:transfer});if(event.clipboardData.getData("text/plain")!=="Pasted🙂")throw Error("Synthetic paste fixture lost its payload");window.generalRange.a.surface.dispatchEvent(event);
  });await expect(page.locator('#a [data-rich-text="p-1-2"]')).toHaveText("aPasted🙂");await history(page);expect(await document(page)).toBe(before);
  await page.evaluate(()=>window.generalRange.a.setReadOnly(true));await nativeRange(page,backward);await page.keyboard.type("blocked");expect(await document(page)).toBe(before);await page.evaluate(()=>window.generalRange.a.setReadOnly(false));await page.evaluate(()=>window.generalRange.save());await clean(page);
  if(mode==="shared"){expect(await page.evaluate(()=>window.generalRange.rejectOriginal())).toBe(true);await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await document(page)).toBe(before);await clean(page);}
 });
 test(`${mode} ${natural?"natural":"explicit"} partially selected caption and table survive native input`,async({page})=>{
  await ready(page,mode,natural);const before=await document(page);await nativeRange(page,false,true);await page.keyboard.type("Q");const after=await document(page);expect(after).not.toBe(before);await expect(page.locator('#a [data-rich-image="img"]')).toHaveCount(1);await expect(page.locator('#a [data-rich-text="caption"]')).toContainText("xQ");await expect(page.locator('#a [data-rich-table="t"]')).toHaveCount(1);const saved=await page.evaluate(()=>window.generalRange.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.generalRange.a.checkpointJson())).toBe(saved);await history(page);expect(await document(page)).toBe(before);await history(page,true);expect(await document(page)).toBe(after);await clean(page);
 });
 test(`${mode} ${natural?"natural":"explicit"} React general mode retains one owner on rerender and exact reload history`,async({page})=>{
  await ready(page,mode,natural,"&react=1");const before=await document(page);await nativeRange(page);await page.keyboard.type(natural?"QY":"Q");const after=await document(page),saved=await page.evaluate(()=>{const t=window.generalRange;t.original=t.a;return t.save();});await page.locator("#rerender").click();await expect(page.locator("#count")).toHaveText("1");expect(await page.evaluate(()=>window.generalRange.a===window.generalRange.original&&window.generalRange.ready===1)).toBe(true);expect(await page.evaluate(()=>window.generalRange.a.checkpointJson())).toBe(saved);await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.generalRange.a.checkpointJson())).toBe(saved);await history(page);expect(await document(page)).toBe(before);await history(page,true);expect(await document(page)).toBe(after);await clean(page);
 });
}
