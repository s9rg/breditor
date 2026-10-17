/** Mixed review acceptance using real native raster transfer and the public SDK.
 * IndexedDB, Web Locks and the two known-raster Image decodes are deterministic fixtures.
 * This is not a physical browser/IME/accessibility or arbitrary-raster qualification. */
import assert from "node:assert/strict";
import {pixel,pixelAsset,secondPixel,secondAsset,ReviewFixtureImage} from "./fixtures/review-assets/pixels.mjs";
const principals=["alice","bob"],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label){for(let n=0;n<1600;n++){if(predicate())return;await pause(5);}throw Error(`Timed out: ${label}`);}
function nodes(root){return root.kind==="text"?[]:[root,...root.children.flatMap(nodes)];}
const block=node=>node.properties["breditor/block-id"],asset=node=>node.properties["breditor/asset-id"];
const draft=commands=>({scope:"commands",edit:{kind:"commands",data:commands}});
const insert=(block,text)=>({kind:"insert_text",data:{block,offset:0,text}});

export async function exerciseReviewAssets({sdkModule,editorModule,sessions,queues,syncs,documents,reviews,catalogs,endpoint,tokens,trial,pauseOwners,reopenOwners,restartHost,onProgress}){
 const {SharedRelayAssets,imageNode,paragraph}=await import(sdkModule),{RichAssetStore}=await import(editorModule);
 const originalImage=Object.getOwnPropertyDescriptor(globalThis,"Image"),fetchBefore=globalThis.fetch;
 const transfers={get:0,put:0},stores={},providers={},extraStores=[],extraProviders=[];
 let phase="asset cache setup",exactAuthorReopens=0,cacheReopens=0;
 const progress=onProgress?setInterval(()=>onProgress({assetPhase:phase}),1000):undefined;progress?.unref();
 Object.defineProperty(globalThis,"Image",{value:ReviewFixtureImage,configurable:true,writable:true});
 globalThis.fetch=(input,options={})=>{if(String(input).includes("/assets/"))transfers[options.method==="PUT"?"put":"get"]++;return fetchBefore(input,options);};
 const core=principal=>sessions[principal].core;
 const root=principal=>JSON.parse(core(principal).documentJson()).root;
 const all=principal=>nodes(root(principal));
 const image=principal=>all(principal).find(node=>node.type==="breditor/image"&&block(node)===`asset-review-${trial}-block`);
 const threadView=(principal,id)=>core(principal).reviewSnapshot().view.threads.find(row=>row.thread.id.actor===id.actor&&row.thread.id.counter===id.counter);
 const reviewAction=(principal,kind,data)=>{const outcome=core(principal).dispatchReview({kind,data});assert.equal(outcome.kind,"committed",`${kind} is an actual review operation`);return outcome.event;};
 const provider=(principal,store)=>new SharedRelayAssets({endpoint,principal,getToken:()=>tokens[principal],store,requestTimeoutMs:3000});
 const openStores=async()=>{for(const principal of principals){stores[principal]=await RichAssetStore.open(`review-assets-${trial}-${principal}`);providers[principal]=provider(principal,stores[principal]);}};
 const reopenStores=async()=>{const saved={};for(const principal of principals){saved[principal]=await stores[principal].list();providers[principal].dispose();stores[principal].close();}await openStores();for(const principal of principals){assert.deepEqual(await stores[principal].list(),saved[principal]);cacheReopens++;}};
 const converge=async()=>{for(const principal of principals){await documents[principal].connect();await documents[principal].flush();}for(const principal of principals){await syncs[principal].connect();await syncs[principal].flushShared();await reviews[principal].connect();await reviews[principal].flush();await catalogs[principal].connect();await catalogs[principal].flushShared();}await until(()=>core("alice").documentJson()===core("bob").documentJson(),"document convergence");};
 const reopen=async()=>{await reopenOwners();exactAuthorReopens+=2;};
 const proposeAccept=(title,commands)=>{const queue=queues.alice,info=queue.propose(title,"1792200010000",draft(commands)),before=core("alice").checkpointJson(),prepared=core("alice").prepareSuggestion(queue.packet(info.id));assert.equal(prepared.kind,"ready");try{assert.equal(core("alice").checkpointJson(),before,"Native preview is pure");queue.queueDecision(info.id,"accept","1792200010001",prepared.preview);}finally{prepared.preview.dispose();}assert.equal(core("alice").checkpointJson(),before,"Queued offline decision cannot edit accepted content");assert.equal(queue.status(info.id).decision,null);return info;};
 const verifyBytes=async(store,id,expected)=>{const file=await store.blob(id);assert.ok(file);assert.equal(file.type,"image/png");assert.deepEqual(Buffer.from(await file.arrayBuffer()),expected);};
 const coldDownload=async(principal,label,id,expected)=>{const store=await RichAssetStore.open(`review-assets-${trial}-${label}`),transport=provider(principal,store);extraStores.push(store);extraProviders.push(transport);assert.deepEqual(await store.list(),[]);assert.ok(await transport.resolve(id));await verifyBytes(store,id,expected);const info=await store.get(id);assert.equal(info.status,"uploaded");assert.equal(info.attempts,0,"Remote downloads never enter the local upload queue");const put=transfers.put;await transport.flush();assert.equal(transfers.put,put);return transport;};
 try{
  await converge();pauseOwners();await openStores();for(const principal of principals)providers[principal].setOnline(false);
  for(const [bytes,id] of [[pixel,pixelAsset],[secondPixel,secondAsset]]){const info=await stores.alice.ingest(new Blob([bytes],{type:"image/png"}));assert.equal(info.asset,id);assert.equal(info.status,"pending");assert.equal(info.width,1);assert.equal(info.height,1);await verifyBytes(stores.alice,id,bytes);}
  assert.deepEqual(await stores.bob.list(),[]);
  const target=block(all("alice").find(node=>node.type==="breditor/paragraph"));
  core("alice").dispatch({commands:[insert(target,"Alice offline image review ")]});
  core("bob").dispatch({commands:[insert(target,"Bob offline image review ")]});
  const newBlock=`asset-review-${trial}-block`,caption=`asset-review-${trial}-caption`,newImage=imageNode(newBlock,`asset-review-${trial}-image`,secondAsset,`asset-review-${trial}-generation-1`,"Uploaded review image",caption,{width:1,height:1});newImage.children=[paragraph(caption,"Durable image caption 🙂")];
  phase="offline image proposal and exact author/cache reload";
  const insertion=proposeAccept("Insert actual raster",[{kind:"insert_blocks",data:{parent:null,before:null,nodes:[newImage]}}]);
  assert.equal(image("alice"),undefined);await queues.alice.flush();await reopen();await reopenStores();
  for(const principal of principals)providers[principal].setOnline(false);
  assert.equal(queues.alice.status(insertion.id).decision,null);assert.equal(image("alice"),undefined);
  await verifyBytes(stores.alice,secondAsset,secondPixel);assert.equal((await stores.alice.get(secondAsset)).status,"pending");
  phase="once-only image accept before remote byte availability";await converge();
  assert.equal(asset(image("alice")),secondAsset);assert.equal(asset(image("bob")),secondAsset);
  assert.match(core("alice").documentJson(),/Alice offline image review/);assert.match(core("alice").documentJson(),/Bob offline image review/);
  const insertionDecision=queues.alice.status(insertion.id).decision;assert.equal(insertionDecision.decision,"accept");assert.ok(core("alice").adoptedSuggestion(insertion.id));
  providers.bob.setOnline(true);assert.equal(await providers.bob.resolve(secondAsset),undefined,"Document acceptance does not invent remote bytes");assert.equal(await stores.bob.get(secondAsset),undefined);
  phase="native two-raster upload and authenticated peer download";
  providers.alice.setOnline(true);const beforeUpload=transfers.put;await providers.alice.flush();assert.equal(transfers.put-beforeUpload,2);
  for(const [id,bytes] of [[pixelAsset,pixel],[secondAsset,secondPixel]]){assert.equal((await stores.alice.get(id)).status,"uploaded");assert.ok(await providers.bob.resolve(id));await verifyBytes(stores.bob,id,bytes);assert.equal((await stores.bob.get(id)).attempts,0);}
  const noEcho=transfers.put;await providers.bob.flush();assert.equal(transfers.put,noEcho);
  const anchor=core("alice").captureReviewAnchor({kind:"selection",selection:{kind:"node",block:newBlock}}),quote=core("alice").readReviewQuote(anchor);assert.equal(quote.kind,"quoted");assert.match(quote.plainText,/Durable image caption 🙂/);
  const thread=reviewAction("alice","create_thread",{anchorJson:anchor,body:"Discuss the uploaded image"});await reviews.alice.flush();await until(()=>threadView("bob",thread),"anchored peer thread");
  reviewAction("bob","reply",{thread,body:"Peer reply survives review and restore"});await reviews.bob.flush();await until(()=>threadView("alice",thread).thread.messages.length===2,"peer reply convergence");
  phase="named image version and offline opposing thread resolutions";
  const named=catalogs.alice.saveVersion("Version retaining uploaded raster","1792200010002"),packet=catalogs.alice.versionPacket(named.id);await catalogs.alice.flushShared();await until(()=>catalogs.bob.versions().some(value=>value.id===named.id),"named asset version metadata");assert.equal(await catalogs.bob.loadVersion(named.id),packet);
  pauseOwners();
  reviewAction("alice","set_thread_state",{thread,resolved:true});reviewAction("bob","set_thread_state",{thread,resolved:true});reviewAction("bob","set_thread_state",{thread,resolved:false});
  const replacement=proposeAccept("Replace raster without replacing caption",[{kind:"replace_image",data:{block:newBlock,asset:pixelAsset,generation:`asset-review-${trial}-generation-2`}}]);
  core("bob").dispatch({commands:[{kind:"set_image_alt",data:{block:newBlock,text:"Peer alternative text retained",decorative:false}},insert(target,"Peer work retained by image Undo ")]});
  await queues.alice.flush();await reopen();await converge();
  assert.equal(asset(image("alice")),pixelAsset);assert.equal(image("alice").properties["breditor/alt-text"],"Peer alternative text retained");
  await until(()=>threadView("alice",thread).thread.state==="conflicted"&&threadView("bob",thread).thread.state==="conflicted","explicit concurrent review state");
  const replacementDecision=queues.alice.status(replacement.id).decision;assert.equal(replacementDecision.decision,"accept");assert.equal(core("alice").resolveReviewAnchor(anchor).kind,"resolved");assert.deepEqual(core("alice").readReviewQuote(anchor),quote);
  phase="selective accepted-image Undo and independent review history";
  const reviewBefore=core("alice").reviewCheckpoint(),putBeforeHistory=transfers.put;
  assert.equal(core("alice").undo(),true);await documents.alice.flush();assert.equal(asset(image("alice")),secondAsset);assert.equal(core("alice").reviewCheckpoint(),reviewBefore);assert.match(core("alice").documentJson(),/Peer work retained by image Undo/);assert.equal(image("alice").properties["breditor/alt-text"],"Peer alternative text retained");
  assert.equal(core("alice").redo(),true);await documents.alice.flush();assert.equal(asset(image("alice")),pixelAsset);assert.equal(transfers.put,putBeforeHistory);
  const comparison=core("alice").compareVersion(packet);assert.equal(comparison.identical,false);assert.ok(comparison.versionAssets.some(value=>value.asset===secondAsset));assert.ok(comparison.currentAssets.some(value=>value.asset===pixelAsset));assert.ok(!comparison.currentAssets.some(value=>value.asset===secondAsset));
  phase="stale restore refusal followed by explicit fresh-ID restore";
  const stale=core("alice").prepareVersionRestore(packet,`asset-stale-${trial}`);try{core("bob").dispatch({commands:[insert(target,"Invalidate old restore plan ")]});await documents.bob.flush();await until(()=>core("alice").documentJson().includes("Invalidate old restore plan"),"fresh peer source invalidates restore");const before=core("alice").checkpointJson();assert.throws(()=>core("alice").applyVersionRestore(stale),/stale or foreign shared observation/);assert.equal(core("alice").checkpointJson(),before);}finally{stale.dispose();}
  const plan=core("alice").prepareVersionRestore(packet,`asset-restored-${trial}`),reviewAtRestore=core("alice").reviewCheckpoint();let restored;
  try{restored=plan.documentJson();assert.equal(core("alice").applyVersionRestore(plan),true);}finally{plan.dispose();}
  await documents.alice.flush();assert.equal(core("alice").documentJson(),restored);assert.equal(core("alice").reviewCheckpoint(),reviewAtRestore);assert.equal(core("alice").resolveReviewAnchor(anchor).kind,"orphaned");assert.deepEqual(core("alice").readReviewQuote(anchor),quote);assert.ok(all("alice").some(node=>node.type==="breditor/image"&&asset(node)===secondAsset));
  assert.equal(core("alice").undo(),true);await documents.alice.flush();assert.equal(asset(image("alice")),pixelAsset);assert.equal(core("alice").redo(),true);await documents.alice.flush();assert.equal(core("alice").documentJson(),restored);assert.equal(transfers.put,putBeforeHistory);
  const beforeResolution=core("alice").documentJson();reviewAction("alice","set_thread_state",{thread,resolved:true});await reviews.alice.flush();assert.equal(threadView("alice",thread).thread.state,"resolved");assert.equal(core("alice").undoReview().kind,"committed");await reviews.alice.flush();assert.equal(threadView("alice",thread).thread.state,"conflicted");assert.equal(core("alice").redoReview().kind,"committed");await reviews.alice.flush();assert.equal(core("alice").documentJson(),beforeResolution);assert.ok(threadView("alice",thread).thread.messages.some(message=>message.versions.some(version=>version.text==="Peer reply survives review and restore")));
  phase="exact final author/catalog/cache recovery and host restart";await converge();pauseOwners();await reopen();await reopenStores();await restartHost();await converge();
  assert.equal(core("alice").documentJson(),restored);assert.equal(catalogs.alice.versionPacket(named.id),packet);assert.deepEqual(queues.alice.status(insertion.id).decision,insertionDecision);assert.deepEqual(queues.alice.status(replacement.id).decision,replacementDecision);assert.deepEqual(core("alice").readReviewQuote(anchor),quote);assert.equal(core("alice").resolveReviewAnchor(anchor).kind,"orphaned");
  await coldDownload("bob","restart-cold-reader",secondAsset,secondPixel);await coldDownload("carol","permanent-reader",pixelAsset,pixel);
  phase="host-owned binary authorization";
  const url=`${endpoint.replace(/^ws/,"http").replace(/\/ws$/,"/assets/")}${encodeURIComponent(secondAsset)}`;
  assert.equal((await fetch(url)).status,403);assert.equal((await fetch(url,{method:"PUT",headers:{Authorization:`Bearer ${tokens.carol}`,"X-Breditor-Principal":"carol","Content-Type":"image/png"},body:new Blob([secondPixel],{type:"image/png"})})).status,403);
  await verifyBytes(stores.alice,secondAsset,secondPixel);assert.equal(transfers.put,putBeforeHistory+1,"Only the deliberately denied Reader PUT occurs after initial upload");
  return {trial,passed:true,exactAuthorReopens,cacheReopens,rasterHashes:[pixelAsset,secondAsset],acceptedImageDecisions:2,conflictingThreadResolutions:1,guardedVersionRestores:1,staleRestoreRefusals:1,coldDownloadsAfterRestart:2,readerUploadRefusals:1,unauthenticatedDownloadRefusals:1,transfers,scope:"Two known raster fixtures; separate host cache and binary receipts, actual native raster validation. The seed's host-owned legacy asset reference is not reinterpreted or supplied by this test."};
 }catch(error){throw Error(`${phase}: ${error.message}`,{cause:error});}
 finally{clearInterval(progress);for(const value of [...Object.values(providers),...extraProviders])value.dispose();for(const value of [...Object.values(stores),...extraStores])value.close();globalThis.fetch=fetchBefore;if(originalImage)Object.defineProperty(globalThis,"Image",originalImage);else delete globalThis.Image;}
}
