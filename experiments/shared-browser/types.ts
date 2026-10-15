// Check the browser contract against the real generated owner, not a mock Wasm stub.
import {RichReplicaProbe,SharedRichProfile} from "../../target/collaboration-feasibility-web/breditor_collab_feasibility.js";
import {SharedRichEditor,SharedPersistentSession,mountSharedEditor,insertSharedImageFiles,compileSharedProfile,SharedPresence,SharedRelaySync,registerSharedRelayWriter,type SharedRelayIdentity,type SharedRelayState,type SharedRustOwner,type SharedCommand,type SharedOwnerDescriptor,type SharedProfileConfiguration} from "../../packages/breditor-experimental-collaboration/index.js";
import {RichAssetStore} from "../../packages/breditor-experimental-rich-content/index.js";
async function contract(root:HTMLElement,input:string,frame:string):Promise<void>{
 const raw:SharedRustOwner=new RichReplicaProbe(input,"9007199254740993");
 const core=new SharedRichEditor(raw),descriptor:SharedOwnerDescriptor=core.descriptor();
 const command:SharedCommand={kind:"insert_text",data:{block:"p",offset:0,text:"hello"}};
 core.dispatch({commands:[command]},core.view().revision);
 // @ts-expect-error Whole captions are ordinary paragraphs, never headings or arbitrary flow.
 core.dispatch({commands:[{kind:"set_image_caption",data:{block:"image",caption:{kind:"element",type:"breditor/heading",entityId:null,properties:{},children:[]}}}]});
 // @ts-expect-error Authored commands must not accept caller-supplied causal clocks.
 core.dispatch({commands:[{kind:"set_header",data:{cells:["c"],header:true,clock:"1:2:3"}}]});
 // @ts-expect-error Selection offsets are exact decimal strings, not browser numbers.
 core.select({kind:"text",anchor:{block:"p",offset:0,affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}});
 const assets=await RichAssetStore.open("typed-shared-assets");
 const mounted=mountSharedEditor(root,{core,onFiles:(files,position,revision)=>insertSharedImageFiles(core,assets,files,position,revision),resolveAsset:binding=>assets.resolve(binding.asset)});
 const release=core.holdRemotes(),receipt=core.receiveFrame(frame);release();await receipt;
 void descriptor;void core.checkpointJson();mounted.dispose();assets.close();
}
void contract;
async function persistentContract(input:string):Promise<void>{
 const session=await SharedPersistentSession.open({database:"typed-sessions",room:"room",writer:"101",create:()=>new RichReplicaProbe(input,"101"),restore:j=>RichReplicaProbe.restore("room",j)});
 session.core.type("saved");await session.flush();void session.state();await session.close();
}
void persistentContract;
async function compiledProfileContract(configuration:SharedProfileConfiguration,input:string,frame:string):Promise<void>{
 const profile=compileSharedProfile({SharedRichProfile},configuration);
 const session=await SharedPersistentSession.open({database:"typed-application-profile",room:"room",writer:"101",create:()=>profile.create(input,"101"),restore:j=>profile.restore("room",j)});
 const peer:SharedRustOwner=profile.join_frame("room","202",frame);peer.free();
 const presence=new SharedPresence(session.core,{autoExpire:false});presence.announce({writer:"202",session:"typed-peer",label:"Peer"});presence.dispose();void session.core.presenceFrame();const batch=session.core.writerGroups("0",session.core.view().revision);const counter:string=batch.through;void session.core.writerClock("101");void counter;await session.close();profile.free();
 // @ts-expect-error Shared configuration is not a production V6 bootstrap or a caller fingerprint.
 compileSharedProfile({SharedRichProfile},{format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/wrong",version:1},extensions:[]});
}
void compiledProfileContract;
async function relayContract(core:SharedRichEditor,session:SharedPersistentSession,identity:SharedRelayIdentity):Promise<void>{
 const sync=new SharedRelaySync(core,{identity,getToken:async signal=>{signal.throwIfAborted();return "0".repeat(64);},autoConnect:false,persistLocal:()=>session.flush()});
 const state:SharedRelayState=sync.state();const end:string|null=state.serverThrough;const dependency:string=state.waitingFor[0]?.writer??"";void end;void dependency;
 const abort=new AbortController(),release=core.holdRemotes(),pending=core.receiveFrame(core.updateFrame(),{signal:abort.signal});abort.abort();release();await pending.catch(()=>{});
 const registration=await registerSharedRelayWriter({endpoint:identity.endpoint,principal:identity.principal,room:identity.room,getToken:()=>"0".repeat(64),saveIdentity:async value=>{const exact:string=value.writer;void exact;}});void registration;
 // @ts-expect-error Causal writer identities never use lossy JavaScript numbers.
 const bad:SharedRelayIdentity={...identity,writer:101};void bad;
 // @ts-expect-error Server counters remain exact decimal strings, not browser numbers.
 const numeric:number=state.serverThrough;void numeric;sync.dispose();
}
void relayContract;
