// Actual native relay integration. Editor state, selective history, presence and assets use the
// packaged contracts; this module owns only demo UI and separate local account credentials.
import init,* as wasm from "/probe.js";
import {compileSharedProfile,SharedPersistentSession,SharedRelaySync,SharedRelayAssets,SharedPresence,SharedPresenceOverlay,registerSharedRelayWriter,mountSharedEditor,insertSharedImageFiles} from "/shared.js";
import {RichAssetStore} from "/rich.js";
await init();
const app={peers:{},errors:[],ready:false,closed:false};window.breditorNetworkDemo=app;
const status=document.querySelector("#network-state"),report=error=>{const message=error?.code??String(error);app.errors.push(message);status.textContent=message;};
window.addEventListener("pagehide",()=>{app.closed=true;for(const peer of Object.values(app.peers)){peer.overlay?.dispose();peer.sync?.dispose();peer.presence?.dispose();peer.assets?.dispose();peer.session?.discardAndClose();peer.cache?.close();}},{once:true});
async function credentials(key,value){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("breditor-network-demo-identities-v1",1);r.onupgradeneeded=()=>r.result.createObjectStore("identities");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction("identities",value?"readwrite":"readonly"),s=tx.objectStore("identities"),r=value?s.put(value,key):s.get(key);let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
const placeholder="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" rx="10" fill="#d9eee2"/><text x="22" y="70" font-size="25" fill="#175c48">breditor image</text></svg>');
async function show(peer){
 if(!peer.session||!peer.cache||!peer.sync||app.closed||peer.closing)return;const generation=++peer.paint,assets=await peer.cache.list();if(generation!==peer.paint||app.closed||peer.closing)return;
 const state=peer.sync.state(),saved=state.serverThrough===null?"unknown":state.pending?"pending":"saved";
 if(app.ready&&Object.values(app.peers).every(p=>p.sync?.state().status==="ready"))status.textContent="Editors ready";
 document.querySelector(`#state-${peer.key}`).textContent=`Local ${peer.session.state().status} · server ${saved} · ${state.status} · images ${assets.filter(a=>a.status==="uploaded").length}/${assets.length}`;
 document.querySelector(`#connect-${peer.key}`).textContent=peer.offline?"Reconnect":"Go offline";
 document.querySelector(`#presence-${peer.key}`).textContent=peer.presence.view().map(p=>{const r=p.resolution;if(r?.kind!=="resolved"||!r.selection)return`${p.label}: ${r?.kind??"waiting"}`;const s=r.selection;return s.kind==="text"?`${p.label}: caret ${s.focus.block}@${s.focus.offset}`:s.kind==="node"?`${p.label}: node ${s.block}`:`${p.label}: cells ${s.anchor.table}`;}).join(" · ")||"No peer selection";
}
const update=peer=>{void show(peer).catch(report);};
try{
 const response=await fetch("/relay-bootstrap.json");if(!response.ok)throw Error("Start scripts/demo-shared-relay.mjs to enable the local network demo");
 const bootstrap=await response.json();if(bootstrap.format!=="breditor/network-demo"||bootstrap.formatVersion!==1)throw Error("Unknown network demo bootstrap");
 const chosen=new URL(location.href).searchParams.get("peer");if(chosen&&!['alice','bob'].includes(chosen))throw Error("Choose peer=alice or peer=bob");
 if(chosen)document.querySelector(".editors").style.gridTemplateColumns="1fr";
 const profile=compileSharedProfile(wasm,bootstrap.configuration);
 try{for(const[key,principal]of[["a","alice"],["b","bob"]]){
  if(chosen&&chosen!==principal){document.querySelector(`#pane-${key}`).remove();continue;}
  const peer={key,principal,paint:0,offline:false,session:undefined,cache:undefined,sync:undefined,presence:undefined,assets:undefined,mounted:undefined,overlay:undefined};app.peers[key]=peer;
  const getToken=()=>bootstrap.tokens[principal],identityKey=[bootstrap.endpoint,principal];let identity=await credentials(identityKey),registration;
  if(!identity){registration=await registerSharedRelayWriter({endpoint:bootstrap.endpoint,principal,room:"room",getToken,saveIdentity:record=>credentials(identityKey,record)});identity=registration.identity;}
  peer.identity=identity;
  peer.session=await SharedPersistentSession.open({database:"breditor-network-demo-journals-v12",room:identity.room,writer:identity.writer,create:()=>{if(!registration)throw Error("Exact saved writer journal is missing; refusing a new history");return profile.join_frame(identity.room,identity.writer,registration.frame);},restore:journal=>profile.restore(identity.room,journal),onState:()=>update(peer),onError:report});
  peer.cache=await RichAssetStore.open(`breditor-network-demo-assets-${principal}`,{onChange:()=>update(peer)});
  peer.assets=new SharedRelayAssets({endpoint:bootstrap.endpoint,principal,getToken,store:peer.cache});
  peer.presence=new SharedPresence(peer.session.core,{onError:report});peer.presence.subscribe(()=>update(peer));
  const insert=async(files,position,revision)=>{await insertSharedImageFiles(peer.session.core,peer.cache,files,position,revision);update(peer);if(!peer.offline)await peer.assets.flush();update(peer);};
  peer.mounted=mountSharedEditor(document.querySelector(`#${key}`),{core:peer.session.core,label:`Network ${principal}`,image:{asset:"asset",alt:"Shared diagram"},resolveAsset:binding=>binding.asset==="asset"||binding.asset==="alternate-asset"?placeholder:peer.assets.resolve(binding.asset),onFiles:insert,onError:report,onChange:()=>update(peer)});
  peer.overlay=new SharedPresenceOverlay({editor:peer.mounted,presence:peer.presence});
  peer.sync=new SharedRelaySync(peer.session.core,{identity,getToken,persistLocal:()=>peer.session.flush(),presence:peer.presence,autoConnect:false,onAssetsChanged:()=>peer.mounted.refreshAssets(),onState:()=>update(peer),onError:report});
  document.querySelector(`#connect-${key}`).addEventListener("click",async()=>{try{peer.offline=!peer.offline;peer.assets.setOnline(!peer.offline);if(peer.offline)peer.sync.disconnect();else{await peer.sync.connect();await peer.sync.flush();peer.mounted.refreshAssets();}update(peer);}catch(e){report(e);}});
  document.querySelector(`#upload-${key}`).addEventListener("click",async()=>{try{for(const info of await peer.cache.list())if(info.status==="failed")await peer.cache.retry(info.asset);await peer.assets.flush();peer.mounted.refreshAssets();update(peer);}catch(e){report(e);}});
  document.querySelector(`#files-${key}`).addEventListener("change",event=>{const input=event.currentTarget,files=[...input.files??[]];input.value="";if(files.length)void insert(files,{parent:null,before:null},peer.session.core.view().revision).catch(report);});
  document.querySelector(`#save-${key}`).addEventListener("click",()=>{const url=URL.createObjectURL(new Blob([peer.session.core.checkpointJson()],{type:"application/json"})),link=document.createElement("a");link.href=url;link.download=`breditor-network-${principal}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);});
  try{await peer.sync.connect();}catch{/* Offline saved journals remain editable and explicitly unsynced. */}update(peer);
 }}finally{profile.free();}
 app.ready=true;status.textContent="Editors ready";
 app.close=async()=>{if(app.closed)return;for(const peer of Object.values(app.peers)){peer.closing=true;peer.overlay?.dispose();peer.sync?.dispose();peer.presence?.dispose();peer.assets?.dispose();await peer.session?.close();peer.mounted?.dispose();peer.cache?.close();}app.closed=true;};
}catch(error){report(error);}
