import {SharedRichEditor,SharedPersistentSession,mountSharedEditor,compileSharedProfile,SharedPresence,SharedRelaySync,SharedRelayAssets,registerSharedRelayWriter,type SharedRelayIdentity,type SharedRelayState,type SharedRustOwner,type SharedCommand,type SharedSaveState,type SharedProfileConfiguration,type SharedProfileModule,type SharedPresenceResolution} from "@breditor/experimental-collaboration";
import {RichAssetStore} from "@breditor/experimental-rich-content";
import {model,refreshAssets} from "@breditor/experimental-rich-content/rendering";
async function consumer(raw:SharedRustOwner,root:HTMLElement):Promise<void>{
 const core=new SharedRichEditor(raw),assets=await RichAssetStore.open("consumer-assets");
 const command:SharedCommand={kind:"set_image_alt",data:{block:"image",text:"Diagram",decorative:false}};
 core.dispatch({commands:[command]});const editor=mountSharedEditor(root,{core,resolveAsset:value=>assets.resolve(value.asset)});
 // @ts-expect-error Captions cannot contain nested tables or arbitrary flow drafts.
 core.dispatch({commands:[{kind:"set_image_caption",data:{block:"image",caption:{kind:"element",type:"breditor/table",entityId:null,properties:{},children:[]}}}]});
 // @ts-expect-error Each shared command remains a closed typed record in the installed archive.
 core.dispatch({commands:[{kind:"resize_image",data:{block:"image",size:"240"}}]});
 await assets.cacheRemote("sha256:"+"0".repeat(64),new Blob(),"remote-receipt");
 const remote=new SharedRelayAssets({endpoint:"ws://127.0.0.1:1/ws",principal:"consumer",getToken:()=>"a".repeat(64),store:assets});
 await assets.flush(remote.uploader);editor.refreshAssets();refreshAssets(editor.surface,{resolveAsset:binding=>remote.resolve(binding.asset)});remote.dispose();
 void model;void SharedPersistentSession;const state:SharedSaveState={status:"saved",revision:"0",error:null};void state;editor.dispose();assets.close();
}
void consumer;
function configuredConsumer(wasm:SharedProfileModule,config:SharedProfileConfiguration,input:string):void{
 const p=compileSharedProfile(wasm,config),a=new SharedRichEditor(p.create(input,"101"));
 const peer=new SharedRichEditor(p.join_frame("room","202",a.updateFrame()));
 p.free();const presence=new SharedPresence(a,{autoExpire:false});presence.announce({writer:"202",session:"typed-peer",label:"Peer"});presence.receive("202","typed-peer","1",peer.presenceFrame());const resolved:SharedPresenceResolution=a.resolvePresence(peer.presenceFrame());void resolved;presence.dispose();const groups=a.writerGroups("0");const through:string=groups.through;void through;void a.writerClock("101");a.undo();a.redo();a.dispose();peer.dispose();
 // @ts-expect-error Integer bounds must be explicit, including null for an unbounded side.
 const bad:SharedProfileConfiguration={format:"breditor/shared-rich-profile",formatVersion:1,schema:{name:"example/schema",version:1},extensions:[{id:{name:"example/format",version:1},dependencies:[],conflicts:[],formats:[{kind:"example/rank",revision:1,properties:[{name:"example/value",presence:"required",valueType:{kind:"integer",minimum:0}}]}]}]};
 void bad;
}
void configuredConsumer;
async function relayConsumer(core:SharedRichEditor,identity:SharedRelayIdentity):Promise<void>{
 const sync=new SharedRelaySync(core,{identity,getToken:()=>"a".repeat(64),autoConnect:false});const state:SharedRelayState=sync.state();const counter:string|null=state.serverThrough;void counter;
 const pending=core.receiveFrame(core.updateFrame(),{signal:AbortSignal.abort()});await pending.catch(()=>{});sync.dispose();
 await registerSharedRelayWriter({endpoint:identity.endpoint,principal:identity.principal,room:identity.room,getToken:()=>"a".repeat(64),saveIdentity:record=>{const credential:string=record.credential;void credential;}});
 // @ts-expect-error A token provider is a callback, not a bearer token embedded as an option value.
 new SharedRelaySync(core,{identity,getToken:"a".repeat(64)});
 // @ts-expect-error Credentials are separate from portable document/journal records.
 const bad:SharedRelayIdentity={...identity,documentJson:core.documentJson()};void bad;
}
void relayConsumer;
