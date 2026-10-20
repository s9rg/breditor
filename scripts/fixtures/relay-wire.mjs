/** Original requested-response wire fixture; no SDK imports or implicit document mutation. */
import assert from "node:assert/strict";
import {WebSocket} from "undici";
const origin="http://127.0.0.1:49785";
export class ReviewWireFixture {
 constructor(endpoint){this.socket=new WebSocket(endpoint,{headers:{Origin:origin}});this.pending=new Map();this.events=[];this.serial=0;this.opened=new Promise((resolve,reject)=>{this.socket.addEventListener("open",resolve,{once:true});this.socket.addEventListener("error",()=>reject(Error("Socket failed")),{once:true});});this.socket.addEventListener("message",event=>{const envelope=JSON.parse(event.data);assert.equal(envelope.format,"breditor/relay");assert.equal(envelope.formatVersion,1);if(envelope.id===null){this.events.push(envelope.result);assert.ok(this.events.length<512);return;}const pending=this.pending.get(envelope.id);assert.ok(pending,"Only requested responses are accepted");this.pending.delete(envelope.id);clearTimeout(pending.timer);pending.resolve(envelope.result);});this.socket.addEventListener("close",()=>{for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(Error("Socket closed"));}this.pending.clear();});}
 async request(request){await this.opened;const id=String(++this.serial);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("Request timed out")),15000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({format:"breditor/relay",formatVersion:1,id,request}));});}
 close(){this.socket.close();}
}
