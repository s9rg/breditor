import {expect,test} from "@playwright/test";

for(const close of ["graceful","with a started write"]){
 test(`closed paired session releases cached recovery bytes ${close}`,async({page,browser},testInfo)=>{
  await page.goto("/paired-memory.html");
  await page.waitForFunction(()=>!!window.pairedMemory);
  const before=await page.evaluate(()=>window.pairedMemory.prepare());
  expect(before.bytes).toBeGreaterThan(2_000_000);

  let expected=before;
  if(close==="graceful")expect(await page.evaluate(()=>window.pairedMemory.close())).toBe("closed");
  else{
   expected=await page.evaluate(()=>window.pairedMemory.discardStartedWrite());
   expect(expected.digest).not.toBe(before.digest);
  }

  const client=await page.context().newCDPSession(page);
  const measure=async()=>{
   await client.send("HeapProfiler.collectGarbage");
   return client.send("Runtime.getHeapUsage");
  };
  const closed=await measure();
  await page.evaluate(()=>window.pairedMemory.forget());
  const forgotten=await measure();
  const retained=closed.usedSize+closed.backingStorageSize-forgotten.usedSize-forgotten.backingStorageSize;
  const recovered=await page.evaluate(()=>window.pairedMemory.reopen());
  expect(recovered).toEqual({recovered:true,...expected});
  await testInfo.attach("paired-session-close",{contentType:"application/json",body:JSON.stringify({
   chromeVersion:browser.version(),close,expected,closed,forgotten,retained,
  },null,2)});
  // The isolate includes unrelated allocations. Allow noise below half the exact journal and version payload.
  expect(retained).toBeLessThan(expected.bytes/2);
 });
}
