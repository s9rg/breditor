/** Synthetic wire choices only. No value here is a native owner or serving proof. */
import {transportFixture} from '../server-generation-archive/transport.mjs';
export const token='b'.repeat(64),endpoint='http://127.0.0.1:4187/recovery/native-activation/v1/commit';
export function selection(current){
 const server=transportFixture().expected,identity={format:'breditor/room-deployment-authority',formatVersion:1,authority:'a'.repeat(64),binding:'c'.repeat(64)};
 return{format:'breditor/durable-native-activation-control',formatVersion:1,instance:'d'.repeat(64),checkpointSha256:Array(32).fill(7),current:current??{origin:structuredClone(server),server,participants:{source:structuredClone(server.native),sha256:Array(32).fill(8)}},previous:{identity,generation:'2',owner:'1'.repeat(64)},planned:{identity:structuredClone(identity),generation:'3',owner:'2'.repeat(64)}};
}
export const options=(extra={})=>({endpoint,expected:selection(),principal:'operator',getToken:()=>token,checkAuthority(){},...extra});
export const receipt=selected=>JSON.stringify({format:'breditor/durable-native-activation-control-receipt',formatVersion:1,selection:selected,scope:'actual-held-native-service-only'});
export const json=(text,status=200,headers={})=>new Response(text,{status,headers:{'content-type':'application/json',...headers}});
export const code=value=>error=>error?.code===value&&!String(error).includes('TEST_PRIVATE');
export async function using(fetcher,work){const original=globalThis.fetch;globalThis.fetch=fetcher;try{return await work();}finally{globalThis.fetch=original;}}
