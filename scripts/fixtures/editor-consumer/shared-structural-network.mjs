import {openSharedEditor,registerSharedRelayWriter,SharedRelaySync,SharedRelayAssets,SharedPresence,insertSharedImageFiles} from "@breditor/editor/collaboration";
import {RichAssetStore} from "@breditor/editor";
import {range} from "./structural-seed.mjs";
const bootstrap=await fetch("/relay-bootstrap.json").then(r=>r.json()),peers={},errors=[];
const parameters=new URL(location.href).searchParams,richLanguage=parameters.has("layout")?3:2,natural=parameters.get("history")==="typing",history=natural?{history:"typing-v1"}:{},selected=parameters.get("peer"),principals=selected?[selected]:["alice","bob"];
if(principals.some(p=>p!=="alice"&&p!=="bob"))throw Error("Unknown qualification account");
for(const principal of principals){
 const key=principal==="alice"?"a":"b",identityKey=`shared-v${richLanguage}-network-identity-${principal}${natural?"-typing":""}`;
 let identity=JSON.parse(sessionStorage.getItem(identityKey)??"null"),registration;
 if(!identity){registration=await registerSharedRelayWriter({endpoint:bootstrap.url,principal,room:"room",getToken:()=>bootstrap.tokens[principal],saveIdentity:value=>sessionStorage.setItem(identityKey,JSON.stringify(value))});identity=registration.identity;}
 const host=document.createElement("main");host.id=key;document.querySelector("#peers").append(host);
 const cache=await RichAssetStore.open(`shared-v${richLanguage}-network-assets-${principal}`),assets=new SharedRelayAssets({endpoint:bootstrap.url,principal,getToken:()=>bootstrap.tokens[principal],store:cache});
 let sync,presence,session;
 session=await openSharedEditor({...history,host,richLanguage,database:`shared-v${richLanguage}-network-journal-${principal}${natural?"-typing":""}`,room:"room",writer:identity.writer,initial:registration?{kind:"frame",frame:registration.frame}:{kind:"resume"},resolveAsset:b=>assets.resolve(b.asset),onFiles:(files,position,revision)=>insertSharedImageFiles(session.core,cache,files,position,revision),onError:error=>errors.push(String(error)),onClosing:()=>{sync?.dispose();presence?.dispose();assets.dispose();cache.close();}});
 presence=new SharedPresence(session.core,{onError:error=>errors.push(error.code??String(error))});
 sync=new SharedRelaySync(session.core,{identity,getToken:()=>bootstrap.tokens[principal],autoConnect:false,persistLocal:()=>session.flush(),reconnectMinimumMs:50,reconnectMaximumMs:200,onError:error=>errors.push(error.code),onAssetsChanged:()=>session.refreshAssets(),presence});
 peers[key]={session,sync,assets,cache,identity,presence};
 await sync.connect();await sync.flush();
}
window.sharedV2Network={peers,errors,range,
 async close(){for(const p of Object.values(peers)){await p.sync.flush();await p.session.flush();await p.session.close();}},
 async files(key,files){const p=peers[key];await insertSharedImageFiles(p.session.core,p.cache,files,{parent:"task-a",before:null});},
 async uploaded(key){await peers[key].assets.flush();}
};
document.querySelector("#ready").textContent="Ready";
