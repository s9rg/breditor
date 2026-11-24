import {test,expect} from "@playwright/test";
import {createHash} from "node:crypto";
import {readFileSync,realpathSync} from "node:fs";
import {cpus,release,version} from "node:os";
import {basename,join} from "node:path";

const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
function durations(values){
  const sorted=values.toSorted((a,b)=>a-b);
  const percentile=fraction=>sorted[Math.ceil(sorted.length*fraction)-1];
  return {samples:sorted.length,p50Ms:percentile(.5),p95Ms:percentile(.95)};
}

test("measure shared editor memory across edit, peer sync, Undo, and exact recovery",async({page,browser},testInfo)=>{
  const {rangeEditing}=testInfo.project.metadata;
  const installed=JSON.parse(readFileSync("target/editor-installed-consumer.json","utf8"));
  const consumer=realpathSync(process.env.BREDITOR_EDITOR_CONSUMER??installed.consumer);
  expect(consumer).toBe(realpathSync(installed.consumer));
  expect(installed.archiveEvidence).toHaveLength(installed.archives.length);
  const archiveDigests=()=>installed.archiveEvidence.map(({filename,sha256:expected},index)=>{
    const path=installed.archives[index];
    expect(basename(path)).toBe(filename);
    const digest=sha256(readFileSync(path));
    expect(digest).toBe(expected);
    return {filename,sha256:digest};
  });
  const archives=archiveDigests();
  const wasm=readFileSync(join(consumer,"node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm"));
  const response=page.waitForResponse(resource=>/\/breditor_shared_bg-[^/]+\.wasm$/.test(new URL(resource.url()).pathname));
  const navigating=performance.now();
  await page.goto(`/shared-session.html?ranges=${rangeEditing}`);
  await expect(page.locator("#ready")).toHaveText("Ready");
  const navigationToReadyMs=performance.now()-navigating;
  const browserWasm=await (await response).body();
  expect(sha256(browserWasm)).toBe(sha256(wasm));
  expect(await page.evaluate(()=>[window.durableSdk.a.rangePolicy(),window.durableSdk.b.rangePolicy()]))
    .toEqual([rangeEditing,rangeEditing]);
  const original=await page.evaluate(()=>window.durableSdk.a.view().documentJson);
  const fixture={documentSha256:sha256(original),documentBytes:Buffer.byteLength(original),
    topLevelBlocks:JSON.parse(original).root.children.length};
  const client=await page.context().newCDPSession(page);
  const started=performance.now(),samples=[],latency=[];
  const measure=async phase=>{
    await client.send("HeapProfiler.collectGarbage");
    const heap=await client.send("Runtime.getHeapUsage");
    const dom=await client.send("Memory.getDOMCounters");
    samples.push({phase,elapsedMs:performance.now()-started,heap,dom});
  };
  await measure(0);
  let completed=0;
  for(const checkpoint of [10,25,50,100]){
    const batch=await page.evaluate(async rounds=>{
      const {a,b,range,sync,errors}=window.durableSdk;
      const baseline=a.view().documentJson;
      const typing=[],undo=[],frameSync=[];
      for(let round=0;round<rounds;round++){
        a.select(range("deep-head",0));
        const typingStarted=performance.now();
        a.core.type("x");
        typing.push(performance.now()-typingStarted);
        const syncStarted=performance.now();
        await sync();
        frameSync.push(performance.now()-syncStarted);
        if(!b.view().documentJson.includes("xNested idea"))throw Error("Peer edit did not arrive");
        const undoStarted=performance.now();
        a.core.undo();
        undo.push(performance.now()-undoStarted);
        await sync();
        if(a.view().documentJson!==baseline||b.view().documentJson!==baseline)throw Error("Undo did not restore both peer documents");
      }
      await Promise.all([a.flush(),b.flush()]);
      if(errors.length)throw Error("Unexpected editor fixture errors");
      return {typing,undo,frameSync};
    },checkpoint-completed);
    latency.push({firstRound:completed+1,lastRound:checkpoint,
      typing:durations(batch.typing),undo:durations(batch.undo),frameSync:durations(batch.frameSync)});
    completed=checkpoint;
    await measure(completed);
  }
  const saved=await page.evaluate(async()=>{
    const {a,b}=window.durableSdk;
    const checkpoints=[a.checkpointJson(),b.checkpointJson()];
    await Promise.all([a.close(),b.close()]);
    return checkpoints;
  });
  const activeBackingStorage=samples.at(-1).heap.backingStorageSize;
  await measure("closed");
  const releasedBackingStorage=activeBackingStorage-samples.at(-1).heap.backingStorageSize;
  const checkpointCodeUnits=saved.reduce((total,checkpoint)=>total+checkpoint.length,0);
  await page.reload();
  await expect(page.locator("#ready")).toHaveText("Ready");
  const reopened=await page.evaluate(()=>{
    const {a,b}=window.durableSdk;
    return {recovered:[a.recovered,b.recovered],checkpoints:[a.checkpointJson(),b.checkpointJson()],
      rangeEditing:[a.rangePolicy(),b.rangePolicy()]};
  });
  expect(reopened).toEqual({recovered:[true,true],checkpoints:saved,rangeEditing:[rangeEditing,rangeEditing]});
  await measure("reopened");
  expect(archiveDigests()).toEqual(archives);
  const report={
    format:"breditor/installed-shared-memory",formatVersion:3,rangeEditing,
    chromeVersion:browser.version(),platform:process.platform,arch:process.arch,
    host:{cpu:cpus()[0]?.model,osRelease:release(),osVersion:version()},
    fixture,archives,wasm:{sha256:sha256(browserWasm),bytes:browserWasm.length},navigationToReadyMs,latency,
    peers:2,editUndoRounds:completed,samples,checkpointCodeUnits,releasedBackingStorage,
    exactReopenedCheckpoints:reopened.checkpoints.length,
  };
  await testInfo.attach("shared-editor-memory",{contentType:"application/json",body:JSON.stringify(report,null,2)});
  console.log(JSON.stringify(report));
  // The isolate counter also includes unrelated buffers. Require a drop large
  // enough to account for the retired journals without pinning total memory.
  expect(releasedBackingStorage).toBeGreaterThan(checkpointCodeUnits/2);
});
