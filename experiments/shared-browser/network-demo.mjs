// Actual native relay integration. Editor state, selective history, presence and assets use the
// packaged contracts; this module owns only demo UI and separate local account credentials.
import init,* as wasm from "/probe.js";
import {compileSharedProfile,SharedPersistentSession,SharedRelaySync,SharedRelayAssets,SharedPresence,SharedPresenceOverlay,registerSharedRelayWriter,mountSharedEditor,insertSharedImageFiles} from "/shared.js";
import {RichAssetStore} from "/rich.js";
await init();
const app={peers:{},errors:[],ready:false,closed:false};window.breditorNetworkDemo=app;
const status=document.querySelector("#network-state"),report=error=>{const message=error?.code??String(error);app.errors.push(message);status.textContent=message;};
const reportPeerError=(peer,error)=>{if(!app.closed&&!peer.closing)report(error);};
window.addEventListener("pagehide",()=>{app.closed=true;for(const peer of Object.values(app.peers)){retirePeer(peer);peer.session?.discardAndClose();peer.cache?.close();}},{once:true});
function identityDatabase(database){
 return new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onupgradeneeded=()=>r.result.createObjectStore("identities");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
async function credentials(database,key,value){
 const db=await identityDatabase(database);
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction("identities",value?"readwrite":"readonly"),s=tx.objectStore("identities"),r=value?s.put(value,key):s.get(key);let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
async function requireUniqueLegacyWriter(database,identity){
 const db=await identityDatabase(database);
 try{
  const count=await new Promise((resolve,reject)=>{
   const tx=db.transaction("identities","readonly"),read=tx.objectStore("identities").openCursor();
   let matches=0;
   read.onsuccess=()=>{
    const cursor=read.result;
    if(!cursor)return;
    const entry=cursor.value;
    if(entry?.identity?.room===identity.room&&entry.identity.writer===identity.writer&&!Object.hasOwn(entry,"scopedStorageVersion")&&++matches>1)return;
    cursor.continue();
   };
   tx.oncomplete=()=>resolve(matches);
   tx.onabort=()=>reject(tx.error);
  });
  if(count!==1)throw Object.assign(Error("The legacy journal has no unique pilot binding"),{code:"pilot_journal_ambiguous"});
 }finally{db.close();}
}
const placeholder="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" rx="10" fill="#d9eee2"/><text x="22" y="70" font-size="25" fill="#175c48">breditor image</text></svg>');
async function sha256Hex(bytes){
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
 return Array.from(digest,byte=>byte.toString(16).padStart(2,"0")).join("");
}
async function pilotStorageScope(endpoint,principal,codeSha256){
 const identity=new TextEncoder().encode(JSON.stringify([endpoint,principal,codeSha256]));
 return sha256Hex(identity);
}
async function recoverLegacyPilotImages(peer){
 if(peer.closing)throw Error("The pilot writer has closed");
 const {core}=peer.session,inventory=core.retainedAssetReferences();
 const assets=new Set(inventory.references.map(reference=>reference.asset).filter(asset=>/^sha256:[0-9a-f]{64}$/u.test(asset)));
 if(!assets.size)return 0;
 const check=()=>{
  if(peer.closing)throw Error("The pilot writer has closed");
  core.checkRetainedAssetReferences(inventory);
 };
 const legacy=await RichAssetStore.openRetained("breditor-pilot-assets-"+peer.principal);
 try{
  let recovered=0;
  for(const asset of assets){
   check();
   if(await peer.cache.get(asset))continue;
   const bytes=await legacy.blob(asset);
   if(!bytes)continue;
   if("sha256:"+await sha256Hex(await bytes.arrayBuffer())!==asset)throw Error("Legacy image bytes changed");
   check();
   // A legacy receipt or upload epoch cannot identify the provider that issued it.
   await peer.cache.ingest(bytes);
   recovered++;
  }
  return recovered;
 }finally{legacy.close();}
}
function setStatusText(element,text){if(element.textContent!==text)element.textContent=text;}
async function show(peer){
 if(!peer.session||!peer.cache||!peer.sync||app.closed||peer.closing)return;const generation=++peer.paint,assets=await peer.cache.list();if(generation!==peer.paint||app.closed||peer.closing)return;
 const state=peer.sync.state(),saved=state.serverThrough===null?"unknown":state.pending?"pending":"saved";
 if(app.ready&&Object.values(app.peers).every(p=>p.sync?.state().status==="ready"))setStatusText(status,"Editors ready");
 setStatusText(document.querySelector(`#state-${peer.key}`),`Local ${peer.session.state().status} · server ${saved} · ${state.status} · images ${assets.filter(a=>a.status==="uploaded").length}/${assets.length}`);
 document.querySelector(`#connect-${peer.key}`).textContent=peer.offline?"Reconnect":"Go offline";
 setStatusText(document.querySelector(`#presence-${peer.key}`),peer.presence.view().map(p=>{const r=p.resolution;if(r?.kind!=="resolved"||!r.selection)return`${p.label}: ${r?.kind??"waiting"}`;const s=r.selection;return s.kind==="text"?`${p.label}: caret ${s.focus.block}@${s.focus.offset}`:s.kind==="node"?`${p.label}: node ${s.block}`:`${p.label}: cells ${s.anchor.table}`;}).join(" · ")||"No peer selection");
}
const update=peer=>{void show(peer).catch(error=>reportPeerError(peer,error));};
/** Mount the selected accounts using the shared demo controls. Pilot mode supplies one code. */
export async function openNetworkDemo(bootstrap,chosen,{
 pilot=false,tokenFor=principal=>bootstrap.tokens[principal],codeSha256,isPaused=()=>false,onPause=()=>{},onJournalRetired,
}={}){
 if(chosen&&!["alice","bob"].includes(chosen))throw Error("Choose peer=alice or peer=bob");
 if(pilot&&(!chosen||!codeSha256||!/^[a-f0-9]{64}$/.test(codeSha256)))throw Error("Choose one pilot participant and code");
 if(chosen)document.querySelector(".editors").style.gridTemplateColumns="1fr";
 const namespace=pilot?"breditor-pilot":"breditor-network-demo";
 const identityDb=`${namespace}-identities-v1`;
 const pilotScope=pilot?await pilotStorageScope(bootstrap.endpoint,chosen,codeSha256):undefined;
 const profile=compileSharedProfile(wasm,bootstrap.configuration);
 try{for(const[key,principal]of[["a","alice"],["b","bob"]]){
  if(chosen&&chosen!==principal){
   const pane=document.querySelector(`#pane-${key}`);
   if(pilot)pane.hidden=true;else pane.remove();
   continue;
  }
  if(pilot)document.querySelector(`#pane-${key}`).hidden=false;
  const peer={key,principal,paint:0,offline:false,closing:false,journalRetirement:undefined,session:undefined,cache:undefined,sync:undefined,presence:undefined,assets:undefined,mounted:undefined,overlay:undefined};app.peers[key]=peer;
  const onError=error=>reportPeerError(peer,error);
  const onJournalError=error=>{
   if(pilot&&onJournalRetired&&!app.closed&&!peer.closing&&error?.code==="session_versionchange"){
    report(error);
    peer.journalRetirement=error;
    retirePeer(peer);
    if(app.ready)onJournalRetired(peer,error);
   }else onError(error);
  };
  const getToken=()=>tokenFor(principal),identityKey=[bootstrap.endpoint,principal];
  let legacyWriter=false;
  const openSession=async()=>{
   const saved=await credentials(identityDb,identityKey);
   if(pilot&&saved&&saved.codeSha256!==codeSha256)throw Error("Incorrect code for the saved pilot writer");
   if(pilot)peer.offline=isPaused(Boolean(saved));
   const marked=pilot&&saved&&Object.hasOwn(saved,"scopedStorageVersion");
   if(marked&&saved.scopedStorageVersion!==2)throw Object.assign(Error("Unsupported saved pilot storage version"),{code:"pilot_storage_version"});
   legacyWriter=pilot&&Boolean(saved?.identity)&&!marked;
   let identity=pilot?saved?.identity:saved,registration;
   if(!identity){
    registration=await registerSharedRelayWriter({endpoint:bootstrap.endpoint,principal,room:"room",getToken,
     saveIdentity:record=>credentials(identityDb,identityKey,pilot?{identity:record,codeSha256,scopedStorageVersion:2}:record)});
    identity=registration.identity;
   }
   peer.identity=identity;
   if(legacyWriter)await requireUniqueLegacyWriter(identityDb,identity);
   const journal=pilotScope&&!legacyWriter?`${namespace}-journals-v12-${pilotScope}`:`${namespace}-journals-v12`;
   const opened=await SharedPersistentSession.open({database:journal,room:identity.room,writer:identity.writer,create:()=>{if(!registration)throw Error("Exact saved writer journal is missing; refusing a new history");return profile.join_frame(identity.room,identity.writer,registration.frame);},restore:journal=>profile.restore(identity.room,journal),onState:()=>update(peer),onError:onJournalError});
   if(legacyWriter){
    try{await requireUniqueLegacyWriter(identityDb,identity);}
    catch(error){await opened.discardAndClose();throw error;}
   }
   return opened;
  };
  // Give the second tab the first tab's writer and the usual live journal lease check.
  // Keep the registration lock until the first exact local journal has been committed.
  peer.session=pilot?await navigator.locks.request(`breditor-pilot-login-v1:${JSON.stringify(identityKey)}`,openSession):await openSession();
  if(peer.journalRetirement)continue;
  const identity=peer.identity;
  try{peer.cache=await RichAssetStore.open(pilotScope?`${namespace}-assets-v2-${pilotScope}`:`${namespace}-assets-${principal}`,{onChange:()=>update(peer)});}
  catch(error){if(!peer.journalRetirement)throw error;}
  if(peer.journalRetirement){peer.cache?.close();peer.cache=undefined;continue;}
  if(legacyWriter&&peer.session.recovered)peer.recoverLegacyImages=()=>recoverLegacyPilotImages(peer);
  peer.assets=new SharedRelayAssets({endpoint:bootstrap.endpoint,principal,getToken,store:peer.cache});
  if(peer.offline)peer.assets.setOnline(false);
  peer.presence=new SharedPresence(peer.session.core,{onError});peer.presence.subscribe(()=>update(peer));
  const insert=async(files,position,revision)=>{
   if(peer.closing)return;
   await insertSharedImageFiles(peer.session.core,peer.cache,files,position,revision);
   update(peer);
   if(!peer.offline&&!peer.closing)await peer.assets.flush();
   update(peer);
  };
  peer.mounted=mountSharedEditor(document.querySelector(`#${key}`),{core:peer.session.core,label:`Network ${principal}`,scrollableTables:pilot,image:{asset:"asset",alt:"Shared diagram"},resolveAsset:binding=>binding.asset==="asset"||binding.asset==="alternate-asset"?placeholder:peer.assets.resolve(binding.asset),onFiles:insert,onError,onChange:()=>update(peer)});
  peer.overlay=new SharedPresenceOverlay({editor:peer.mounted,presence:peer.presence});
  peer.sync=new SharedRelaySync(peer.session.core,{identity,getToken,persistLocal:()=>peer.session.flush(),presence:peer.presence,autoConnect:false,onAssetsChanged:()=>{if(!peer.closing)peer.mounted.refreshAssets();},onState:()=>update(peer),onError});
  document.querySelector(`#connect-${key}`).addEventListener("click",async event=>{
   if(peer.closing)return;
   const button=event.currentTarget;
   button.disabled=true;
   try{
    const nextOffline=!peer.offline;
    onPause(nextOffline);
    peer.offline=nextOffline;
    peer.assets.setOnline(!nextOffline);
    if(peer.offline)peer.sync.disconnect();
    else{
     await peer.sync.connect();
     if(peer.closing)return;
     await peer.sync.flush();
     if(!peer.closing)peer.mounted.refreshAssets();
    }
   }catch(error){onError(error);}finally{button.disabled=peer.closing;update(peer);}
  });
  document.querySelector(`#upload-${key}`).addEventListener("click",async()=>{
   if(peer.closing)return;
   try{
    for(const info of await peer.cache.list()){
     if(peer.closing)return;
     if(info.status==="failed")await peer.cache.retry(info.asset);
    }
    if(peer.closing)return;
    await peer.assets.flush();
    if(!peer.closing)peer.mounted.refreshAssets();
    update(peer);
   }catch(error){onError(error);}
  });
  document.querySelector(`#files-${key}`).addEventListener("change",event=>{
   const input=event.currentTarget,files=[...input.files??[]];input.value="";
   if(files.length&&!peer.closing)void insert(files,{parent:null,before:null},peer.session.core.view().revision).catch(onError);
  });
  if(!pilot)document.querySelector(`#save-${key}`).addEventListener("click",()=>downloadNetworkCheckpoint(peer));
  if(!peer.offline)try{await peer.sync.connect();}catch{/* Saved journals can reopen while offline. */}
  update(peer);
 }}catch(error){
  if(pilot){
   for(const peer of Object.values(app.peers))await closePeer(peer,false);
   app.peers={};
  }
  throw error;
 }finally{profile.free();}
 app.ready=true;
 if(!Object.values(app.peers).some(peer=>peer.journalRetirement))status.textContent="Editors ready";
 app.close=async()=>{if(app.closed)return;for(const peer of Object.values(app.peers))await closePeer(peer,true);app.closed=true;};
 return app;
}

function retirePeer(peer){
 if(peer.closing)return;
 peer.closing=true;
 peer.overlay?.dispose();peer.sync?.dispose();peer.presence?.dispose();peer.assets?.dispose();
}

async function closePeer(peer,save){
 retirePeer(peer);
 if(save)await peer.session?.close();else await peer.session?.discardAndClose();
 peer.mounted?.dispose();peer.cache?.close();
}

export function downloadNetworkCheckpoint(peer){
 const checkpoint=peer.session.core.checkpointJson();
 const url=URL.createObjectURL(new Blob([checkpoint],{type:"application/json"})),link=document.createElement("a");
 link.href=url;
 link.download=`breditor-network-${peer.principal}.json`;
 link.click();
 setTimeout(()=>URL.revokeObjectURL(url),0);
 return checkpoint;
}

if(!document.body.hasAttribute("data-breditor-pilot")){
 try{
  const response=await fetch("/relay-bootstrap.json");
  if(!response.ok)throw Error("Start scripts/demo-shared-relay.mjs to enable the local network demo");
  const bootstrap=await response.json();
  if(bootstrap.format!=="breditor/network-demo"||bootstrap.formatVersion!==1)throw Error("Unknown network demo bootstrap");
  await openNetworkDemo(bootstrap,new URL(location.href).searchParams.get("peer"));
 }catch(error){report(error);}
}
