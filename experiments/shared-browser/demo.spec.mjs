import {test,expect} from "@playwright/test";
async function caret(page,side,block,end){
 const surface=page.locator(`#${side} .breditor-shared-surface`);await surface.focus();await surface.locator(`[data-rich-text="${block}"]`).evaluate((element,end)=>{const range=document.createRange();range.selectNodeContents(element);range.collapse(!end);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);},end);
}
test("combined demo saves both offline writers reconnects and reloads selective history",async({page})=>{
 await page.goto("/demo");await expect(page.locator("#state")).toHaveText("Connected · A saved · B saved");
 await page.locator("#connection").click();await caret(page,"a","p",true);await page.keyboard.type(" demoA");await caret(page,"b","caption",false);await page.keyboard.type("demoB ");
 await expect(page.locator("#state")).toHaveText("Disconnected · A saved · B saved");await expect(page.locator('#b [data-rich-text="p"]')).toHaveText("a🙂b");
 await page.locator("#connection").click();await expect(page.locator("#state")).toHaveText("Connected · A saved · B saved");
 await expect(page.locator('#b [data-rich-text="p"]')).toHaveText("a🙂b demoA");await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("demoB xy🙂");
 await page.reload();await expect(page.locator("#state")).toHaveText("Connected · A saved · B saved");await expect(page.locator('#a [data-rich-text="p"]')).toHaveText("a🙂b demoA");
 await page.locator('#a [data-shared-action="undo"]').click();await expect(page.locator('#b [data-rich-text="p"]')).toHaveText("a🙂b demo");await expect(page.locator('#b [data-rich-text="caption"]')).toHaveText("demoB xy🙂");
 await page.locator('#a [data-shared-action="redo"]').click();await expect(page.locator('#b [data-rich-text="p"]')).toHaveText("a🙂b demoA");await expect(page.locator("#state")).toHaveText("Connected · A saved · B saved");
});
