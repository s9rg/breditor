import {expect,test} from "@playwright/test";

for(const family of ["segmented","independent"])test(`installed ${family} rotation refuses an occupied undefined immutable generation file`,async({page})=>{
 await page.goto(`/shared-generation-rollover.html?occupiedFile=${family}`);
 const result=page.locator("#result");
 await expect(result).toHaveText(/^\{/, {timeout:15000});
 const report=JSON.parse(await result.textContent());
 expect(report,report.reason).toEqual({passed:true,independent:family==="independent",occupiedAdds:0,
  refusedCode:family==="independent"?"independent_history_storage":"segmented_storage",exactDurableRefusal:true,exactRetriedRecovery:true,heldAndReleasedLeases:true,offlineUndoRedo:true});
});
