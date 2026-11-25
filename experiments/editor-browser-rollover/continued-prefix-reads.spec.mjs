import {expect,test} from "@playwright/test";

test("installed continued history reads shared immutable prefix rows once per snapshot",async({page,browser},testInfo)=>{
 await page.goto("/continued-prefix-reads.html");
 const result=page.locator("#result");
 await expect(result).toHaveText(/^\{/, {timeout:30000});
 const report=JSON.parse(await result.textContent());
 await testInfo.attach("continued-prefix-reads",{contentType:"application/json",body:JSON.stringify({...report,browser:browser.version()})});
 expect(report,report.reason).toMatchObject({passed:true,predecessorMismatchRefused:true,exactBothCuts:true,coldNativeUndoRedoAndOffline:true});
 expect(report.open).toHaveLength(2);
 expect(report.export).toHaveLength(1);
 expect(report.coldRestoredOpen).toHaveLength(2);
 for(const snapshot of [...report.open,...report.export,...report.coldRestoredOpen]){
  expect(snapshot).toMatchObject({records:7,distinctRecords:7});
  expect(snapshot.logicalBytes).toBeGreaterThan(0);
 }
});
