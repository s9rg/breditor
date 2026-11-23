import {test,expect} from "@playwright/test";

test("measure shared editor memory across edit, peer sync, Undo, and exact recovery",async({page,browser},testInfo)=>{
  await page.goto("/shared-session.html");
  await expect(page.locator("#ready")).toHaveText("Ready");
  const client=await page.context().newCDPSession(page);
  const started=performance.now(),samples=[];
  const measure=async phase=>{
    await client.send("HeapProfiler.collectGarbage");
    const heap=await client.send("Runtime.getHeapUsage");
    const dom=await client.send("Memory.getDOMCounters");
    samples.push({phase,elapsedMs:performance.now()-started,heap,dom});
  };
  await measure(0);
  let completed=0;
  for(const checkpoint of [10,25,50,100]){
    await page.evaluate(async rounds=>{
      const {a,b,range,sync,errors}=window.durableSdk;
      const baseline=a.view().documentJson;
      for(let round=0;round<rounds;round++){
        a.select(range("deep-head",0));
        a.core.type("x");
        await sync();
        if(!b.view().documentJson.includes("xNested idea"))throw Error("Peer edit did not arrive");
        a.core.undo();
        await sync();
        if(a.view().documentJson!==baseline)throw Error("Undo did not restore the document");
      }
      await Promise.all([a.flush(),b.flush()]);
      if(errors.length)throw Error("Unexpected editor fixture errors");
    },checkpoint-completed);
    completed=checkpoint;
    await measure(completed);
  }
  const saved=await page.evaluate(async()=>{
    const {a,b}=window.durableSdk;
    const checkpoints=[a.checkpointJson(),b.checkpointJson()];
    await Promise.all([a.close(),b.close()]);
    return checkpoints;
  });
  await measure("closed");
  await page.reload();
  await expect(page.locator("#ready")).toHaveText("Ready");
  const reopened=await page.evaluate(()=>{
    const {a,b}=window.durableSdk;
    return {recovered:[a.recovered,b.recovered],checkpoints:[a.checkpointJson(),b.checkpointJson()]};
  });
  expect(reopened).toEqual({recovered:[true,true],checkpoints:saved});
  await measure("reopened");
  const report={
    format:"breditor/installed-shared-memory",formatVersion:1,
    chromeVersion:browser.version(),platform:process.platform,arch:process.arch,
    peers:2,editUndoRounds:completed,samples,exactReopenedCheckpoints:reopened.checkpoints.length,
  };
  await testInfo.attach("shared-editor-memory",{contentType:"application/json",body:JSON.stringify(report,null,2)});
  console.log(JSON.stringify(report));
});
