import {expect,test} from "@playwright/test";

test.use({hasTouch:true,viewport:{width:390,height:844}});

test("wide table scroll controls are easy to tap at narrow touch widths",async({page})=>{
 await page.goto("/demo");
 await expect(page.locator("#ready")).toContainText("Ready");
 expect(await page.evaluate(()=>matchMedia("(pointer: coarse)").matches)).toBe(true);
 const table=page.locator("[data-rich-table-scroll='t']");
 const left=page.getByRole("button",{name:"Scroll table 1 left"});
 const right=page.getByRole("button",{name:"Scroll table 1 right"});
 for(const button of [left,right]){
  await expect(button).toBeVisible();
  const {width,height}=await button.boundingBox();
  expect(width).toBeGreaterThanOrEqual(44);
  expect(height).toBeGreaterThanOrEqual(44);
 }
 const original=await page.evaluate(()=>window.demo.editor.view().documentJson);
 await right.tap();
 await expect.poll(()=>table.evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);
 await left.tap();
 await expect.poll(()=>table.evaluate(element=>element.scrollLeft)).toBe(0);
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(original);
});
