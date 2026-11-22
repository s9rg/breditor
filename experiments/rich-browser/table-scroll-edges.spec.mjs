import {expect,test} from "@playwright/test";

test("scroll buttons report physical edges in both directions without dropping keyboard focus",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto("/demo");
 await expect(page.locator("#ready")).toContainText("Ready");
 const table=page.locator("[data-rich-table-scroll='t']");
 const left=page.getByRole("button",{name:"Scroll table 1 left"});
 const right=page.getByRole("button",{name:"Scroll table 1 right"});
 await expect(left).toHaveAttribute("aria-disabled","true");
 await expect(right).toHaveAttribute("aria-disabled","false");
 await table.evaluate(element=>{element.scrollLeft=element.scrollWidth;});
 await expect(right).toHaveAttribute("aria-disabled","true");
 await right.focus();
 await page.keyboard.press("ArrowLeft");
 await expect(right).toHaveAttribute("aria-disabled","false");
 await expect(right).toBeFocused();

 await page.locator(".breditor-rich-surface").evaluate(element=>{element.dir="rtl";});
 await table.evaluate(element=>{element.scrollLeft=0;});
 await expect(right).toHaveAttribute("aria-disabled","true");
 await expect(left).toHaveAttribute("aria-disabled","false");
 await left.click();
 await expect.poll(()=>table.evaluate(element=>element.scrollLeft)).toBeLessThan(0);
 await expect(right).toHaveAttribute("aria-disabled","false");
});
