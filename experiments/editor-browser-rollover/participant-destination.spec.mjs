import {expect,test} from "@playwright/test";

for(const continued of [false,true])test(`installed ${continued?"continued":"segmented"} participant recovery fences exact destination custody`,async({page})=>{
 await page.goto(`/participant-destination.html${continued?"?continued":""}`);
 const result=page.locator("#result");
 await expect(result).toHaveText(/^\{/, {timeout:30000});
 const report=JSON.parse(await result.textContent());
 expect(report,report.reason).toEqual({passed:true,continued,foreignRowRefusedBeforeReplay:true,cancelledOpenReleased:true,
  exactRecoverableRows:true,offlineDocumentAndReviewHistory:true});
});
