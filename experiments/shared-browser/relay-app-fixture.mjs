// Application harness using the actual packaged sync/session APIs. Only admin role provisioning
// uses the separate protocol fixture; no edit replication or acknowledgement is implemented here.
import {SharedRelaySync,SharedRelayAssets,registerSharedRelayWriter,SharedPersistentSession,mountSharedEditor} from "/shared.js";
import {connect} from "/socket-fixture.mjs";

async function store(key,value,write=false){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("relay-app-separate-identities",1);r.onupgradeneeded=()=>r.result.createObjectStore("identities");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction("identities",write?"readwrite":"readonly"),s=tx.objectStore("identities");let result;const r=write?s.put(value,key):s.get(key);r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
const app={peers:{},errors:[],states:[],tokens:undefined,endpoint:undefined,owner:undefined,store};
app.configure=async({url,tokens,provision=true})=>{
 app.tokens=tokens;app.endpoint=url;
 if(provision){app.owner=await connect(url,"owner",tokens.owner);for(const [principal,role]of[["alice","editor"],["bob","editor"],["reader","reader"]]){const r=await app.owner.request({kind:"grant",principal,role});if(r.kind!=="granted")throw Error("Owner grant failed");}}
};
app.open=async(key,{principal,create=true,mount,persist,connectNow=true,onState,assets=false}={})=>{
 const t=window.sharedTools;let registration,identity;
 if(create){registration=await registerSharedRelayWriter({endpoint:app.endpoint,principal,room:"room",getToken:()=>app.tokens[principal],saveIdentity:value=>store(key,value,true)});identity=registration.identity;}else{identity=await store(key);principal=identity.principal;}
 const p=t.wasm.SharedRichProfile.from_configuration_json(t.vector.shared_writer.configuration);let session;
 try{session=await SharedPersistentSession.open({database:"relay-app-causal-journals",room:identity.room,writer:identity.writer,create:()=>{if(!registration)throw Error("Missing exact journal; refusing a fresh history");return p.join_frame(identity.room,identity.writer,registration.frame);},restore:j=>p.restore(identity.room,j)});}finally{p.free();}
 const peer={session,core:session.core,identity,states:[],sync:undefined,mounted:undefined,assets:undefined,cache:undefined,assetHints:0};
 if(assets){peer.cache=await t.RichAssetStore.open(`relay-assets-${key}`);peer.assets=new SharedRelayAssets({endpoint:app.endpoint,principal:identity.principal,getToken:()=>app.tokens[identity.principal],store:peer.cache,requestTimeoutMs:5000});}
 peer.sync=new SharedRelaySync(peer.core,{identity,getToken:()=>app.tokens[identity.principal],autoConnect:false,requestTimeoutMs:5000,reconnectMinimumMs:50,reconnectMaximumMs:200,persistLocal:()=>persist?persist(peer):session.flush(),onError:e=>app.errors.push(e.code),onState:s=>{peer.states.push(s);app.states.push(s);onState?.(peer,s);},...(assets?{onAssetsChanged:()=>{peer.assetHints++;peer.mounted?.refreshAssets();}}:{})});
 if(mount)peer.mounted=mountSharedEditor(document.querySelector(mount),{core:peer.core,onError:e=>app.errors.push(String(e)),...(assets?{resolveAsset:binding=>peer.assets.resolve(binding.asset)}:{})});
 app.peers[key]=peer;if(connectNow){await peer.sync.connect();await peer.sync.flush();}return peer;
};
app.close=async key=>{const peer=app.peers[key];if(!peer)return;peer.sync.dispose();peer.assets?.dispose();await peer.session.close();peer.mounted?.dispose();peer.cache?.close();delete app.peers[key];};
window.relayAppFixture=app;
