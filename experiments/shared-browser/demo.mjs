import init,* as wasm from "/probe.js";
import {SharedPersistentSession,mountSharedEditor,insertSharedImageFiles,compileSharedProfile} from "/shared.js";
import {RichAssetStore} from "/rich.js";
await init();let connected=true;const state=document.querySelector("#state"),report=error=>{state.textContent=String(error);};
try{
const vector=await(await fetch("/native-vector.json")).json(),configuration=vector.shared_profile.configuration,profile=compileSharedProfile(wasm,configuration),database="breditor-shared-demo-application-v12",base={database,room:"room",restore:j=>profile.restore("room",j),onError:report};
let sessionA,sessionB;try{sessionA=await SharedPersistentSession.open({...base,writer:"101",create:()=>profile.create(vector.shared_profile.input,"101")});sessionB=await SharedPersistentSession.open({...base,writer:"202",create:()=>profile.join_frame("room","202",sessionA.core.updateFrame())});}catch(error){await sessionA?.close();throw error;}finally{profile.free();}
const a=sessionA.core;
const b=sessionB.core,store=await RichAssetStore.open("breditor-shared-demo-assets");
const initialA=a.updateFrame(),initialB=b.updateFrame();await Promise.all([a.receiveFrame(initialB),b.receiveFrame(initialA)]);await Promise.all([sessionA.flush(),sessionB.flush()]);
const sessions=new Map([[a,sessionA],[b,sessionB]]),showState=()=>{state.textContent=`${connected?"Connected":"Disconnected"} · A ${sessionA.state().status} · B ${sessionB.state().status}`;};
const asset="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" rx="10" fill="#d9eee2"/><text x="22" y="70" font-size="25" fill="#175c48">breditor image</text></svg>');
for(const[core,other,name]of[[a,b,"a"],[b,a,"b"]]){
 mountSharedEditor(document.querySelector(`#${name}`),{core,label:`Shared writer ${name.toUpperCase()}`,image:{asset:"asset",alt:"Shared diagram"},resolveAsset:binding=>binding.asset==="asset"||binding.asset==="alternate-asset"?asset:store.resolve(binding.asset),onError:report,onChange:async event=>{showState();await sessions.get(core).flush();if(connected&&event.source==="local"){await other.receiveFrame(core.updateFrame());await sessions.get(other).flush();}showState();},onFiles:(files,position,revision)=>insertSharedImageFiles(core,store,files,position,revision)});
 document.querySelector(`#save-${name}`).addEventListener("click",()=>{const url=URL.createObjectURL(new Blob([core.checkpointJson()],{type:"application/json"})),link=document.createElement("a");link.href=url;link.download=`breditor-shared-${name}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);});
 document.querySelector(`#files-${name}`).addEventListener("change",event=>{const input=event.currentTarget;if(input.files?.length)void insertSharedImageFiles(core,store,[...input.files],{parent:null,before:null}).catch(report);input.value="";});
}
document.querySelector("#connection").addEventListener("click",async event=>{connected=!connected;event.currentTarget.textContent=connected?"Disconnect editors":"Reconnect editors";if(connected){const x=a.updateFrame(),y=b.updateFrame();try{await Promise.all([a.receiveFrame(y),b.receiveFrame(x)]);await Promise.all([sessionA.flush(),sessionB.flush()]);}catch(error){report(error);return;}}showState();});showState();
window.addEventListener("pagehide",()=>{sessionA.discardAndClose();sessionB.discardAndClose();store.close();},{once:true});
}catch(error){report(error);}
