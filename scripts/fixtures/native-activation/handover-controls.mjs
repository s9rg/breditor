/** Genuine SDK controller objects over controlled wire responses. These tests
 * exercise SDK lifetime/storage laws and provide no real Native admission. */
import {SharedServerLogGenerationRecoveryHost as Native,SharedServerLogGenerationDeliveryRecoveryHost as Delivery,SharedServerLogGenerationDeliveryPathRecoveryHost as Path,SharedDurableNativeActivationHost as Activation} from '../../../packages/breditor-collaboration/dist/index.js';
const base='http://127.0.0.1:4187',token='b'.repeat(64);
const response=(format,selection,scope)=>new Response(JSON.stringify({format,formatVersion:1,selection,scope}),{headers:{'content-type':'application/json'}});
export async function withHandoverActivationControls(capture,activation,run){
 const original=globalThis.fetch,selection=capture.handover,requests=[];let root,current,path,control;
 let nativeResponse=()=>response('breditor/durable-native-activation-control-receipt',activation,'actual-held-native-service-only');
 globalThis.fetch=async(url,options)=>{
  const route=new URL(String(url)).pathname;
  if(route==='/recovery/native-activation/v1/commit'){requests.push({body:JSON.parse(options.body)});return nativeResponse();}
  if(route==='/recovery/generations/v1/check')return response('breditor/server-log-generation-recovery-control-read',selection.current.current.current,'native-server-generation-and-server-provider');
  if(route==='/recovery/generation-delivery/v1/check')return response('breditor/server-log-generation-delivery-recovery-control-read',selection.current.current,'complete-previous-native-server-cut-and-current-provider');
  if(route==='/recovery/generation-handover-delivery-path/v1/check')return response('breditor/server-log-generation-handover-delivery-path-recovery-control-read',selection,'sealed-native-handover-path-and-current-provider');
  throw Error('Unexpected controlled route '+route);
 };
 try{
  const common={principal:'operator',getToken:()=>token,checkAuthority(){}};
  root=await Native.open({...common,endpoint:base+'/recovery/generations/v1/check',expected:selection.current.current.current});
  current=await Delivery.open({...common,endpoint:base+'/recovery/generation-delivery/v1/check',expected:selection.current.current,current:root});
  path=await Path.openHandover({...common,endpoint:base+'/recovery/generation-handover-delivery-path/v1/check',expected:selection,current});
  control=Activation.configure({...common,endpoint:base+'/recovery/native-activation/v1/commit',expected:activation});
  return await run({root,current,path,activation:control,requests,respond(value){nativeResponse=value;},close(layer){({native:root,delivery:current,path,activation:control})[layer].close();}});
 }finally{globalThis.fetch=original;control?.close();path?.close();current?.close();root?.close();}
}
