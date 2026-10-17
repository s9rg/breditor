/** Bounded raw HTTP packets; no serialized credential, redirects, cookies or JavaScript AST validation. */
import {accountToken} from "../relay/registration.js";
import {SharedRelayError,object,endpoint,timeout,counter,writer} from "../relay/validation.js";
import {binding,keys,versionDescriptor,versionEntry,versionCursor,packetText} from "./validation.js";
import type {SharedDocumentVersionsDescriptor,SharedDocumentVersionEntry,SharedDocumentVersionsCursor,SharedDocumentVersionsPage} from "./types.js";
interface Options {endpoint:string;principal:string;room:string;binding?:string;getToken:(signal:AbortSignal)=>string|Promise<string>;requestTimeoutMs?:number}
export type VersionAdmission={kind:"durable";entry:SharedDocumentVersionEntry;duplicate:boolean}|{kind:"pending"};
async function text(response:Response,maximum:number):Promise<string>{
 const length=response.headers.get("content-length");if(length!==null&&(!/^\d+$/.test(length)||length.length>20||BigInt(length)>BigInt(maximum)))throw new SharedRelayError("version_response_budget");
 if(!response.body)throw new SharedRelayError("version_empty_response");const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0,complete=false;
 try{while(true){const next=await reader.read();if(next.done){complete=true;break;}size+=next.value.byteLength;if(size>maximum)throw new SharedRelayError("version_response_budget");chunks.push(next.value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
 finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export class VersionCatalogHttp {
 readonly #base:URL;readonly #options:Options;readonly #milliseconds:number;#closed=false;#active=new Set<AbortController>();
 constructor(options:Options){this.#options={...options};this.#milliseconds=timeout(options.requestTimeoutMs);const url=new URL(endpoint(options.endpoint));url.protocol=url.protocol==="wss:"?"https:":"http:";url.pathname=url.pathname.replace(/\/[^/]*\/?$/,"/")+"document-versions/v1/";this.#base=url;}
 async #request(path:string,signal:AbortSignal,maximum:number,body?:string,bound=true):Promise<{response:Response;text:string}>{
  if(this.#closed)throw new SharedRelayError("closed");if(this.#active.size>=4)throw new SharedRelayError("version_request_budget");
  const controller=new AbortController(),abort=()=>controller.abort();this.#active.add(controller);signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();const timer=setTimeout(abort,this.#milliseconds);
  try{const token=await accountToken(this.#options.getToken,controller.signal,this.#milliseconds);if(controller.signal.aborted)throw new SharedRelayError("disconnected");
   const principal=this.#options.principal,headers=new Headers({Authorization:`Bearer ${token}`,...(/^[\x20-\x7e]+$/.test(principal)?{"X-Breditor-Principal":principal}:{"X-Breditor-Principal-Utf8":encodeURIComponent(principal)})});
   if(bound){if(!this.#options.binding)throw new SharedRelayError("version_binding_invalid");headers.set("X-Breditor-Catalog",this.#options.binding);}if(body!==undefined)headers.set("Content-Type","application/json");
   const response=await fetch(new URL(path,this.#base),{method:body===undefined?"GET":"POST",headers,signal:controller.signal,...(body===undefined?{}:{body}),credentials:"omit",redirect:"error",cache:"no-store"});
   if(response.status===403)throw new SharedRelayError("permission_denied");if(response.status===503||response.status===429)throw new SharedRelayError("storage_unavailable");if(response.status===408)throw new SharedRelayError("request_timeout");
   if(response.status===404)throw new SharedRelayError("version_packet_missing");const value=await text(response,response.ok?maximum:4096);
   if(!response.ok){const error=object(JSON.parse(value));throw new SharedRelayError(error["code"]==="group_rejected"?"version_source_rejected":"version_request_rejected");}
   if(response.headers.get("content-type")?.split(";",1)[0]!=="application/json")throw new SharedRelayError("version_content_type");
   if(this.#closed||controller.signal.aborted)throw new SharedRelayError("disconnected");return {response,text:value};
  }catch(error){if(error instanceof SharedRelayError)throw error;throw new SharedRelayError(controller.signal.aborted?"request_timeout":"version_transfer_failed");}
  finally{clearTimeout(timer);signal.removeEventListener("abort",abort);controller.abort();this.#active.delete(controller);}
 }
 async describe(signal:AbortSignal):Promise<{descriptor:SharedDocumentVersionsDescriptor;canPublish:boolean}>{
  const result=object(JSON.parse((await this.#request("descriptor",signal,4096,undefined,false)).text));keys(result,"canPublish,descriptor,format,formatVersion");if(result["format"]!=="breditor/relay-document-versions-info"||result["formatVersion"]!==1||typeof result["canPublish"]!=="boolean")throw new SharedRelayError("version_protocol_error");
  const known=this.#options.binding??binding(object(result["descriptor"])["binding"]);return {descriptor:versionDescriptor(result["descriptor"],{room:this.#options.room,binding:known}),canPublish:result["canPublish"]};
 }
 async page(cursor:SharedDocumentVersionsCursor|null,signal:AbortSignal):Promise<SharedDocumentVersionsPage>{
  const result=object(JSON.parse((await this.#request("catalog",signal,256*1024,JSON.stringify({cursor}))).text));keys(result,"cursor,descriptor,entries,more");const identity={room:this.#options.room,binding:this.#options.binding!},descriptor=versionDescriptor(result["descriptor"],identity),next=versionCursor(result["cursor"],identity),raw=result["entries"],more=result["more"];
  if(!Array.isArray(raw)||raw.length>64||typeof more!=="boolean"||cursor&&next.through!==cursor.through)throw new SharedRelayError("version_page_invalid");let previous=cursor?BigInt(cursor.after):0n;
  const entries=raw.map(value=>{const entry=versionEntry(value);if(BigInt(entry.sequence)<=previous||BigInt(entry.sequence)>BigInt(next.through))throw new SharedRelayError("version_page_order");previous=BigInt(entry.sequence);return entry;});
  if(entries.length?next.after!==entries.at(-1)!.sequence:more||next.after!==next.through||cursor&&next.after!==cursor.after)throw new SharedRelayError("version_page_invalid");if(more?next.after===next.through:next.after!==next.through)throw new SharedRelayError("version_page_truncated");return {descriptor,entries,cursor:next,more};
 }
 async publish(packet:string,signal:AbortSignal):Promise<VersionAdmission>{
  const result=object(JSON.parse((await this.#request("publish",signal,128*1024,packetText(packet))).text));keys(result,"admission,descriptor,format,formatVersion");if(result["format"]!=="breditor/relay-document-version-admission"||result["formatVersion"]!==1)throw new SharedRelayError("version_protocol_error");const identity={room:this.#options.room,binding:this.#options.binding!};versionDescriptor(result["descriptor"],identity);const admission=object(result["admission"]);
  if(admission["kind"]==="durable"){keys(admission,"descriptor,duplicate,entry,kind");versionDescriptor(admission["descriptor"],identity);if(typeof admission["duplicate"]!=="boolean")throw new SharedRelayError("version_receipt_mismatch");return {kind:"durable",entry:versionEntry(admission["entry"]),duplicate:admission["duplicate"]};}
  keys(admission,"kind,missing");const missing=admission["missing"];if(admission["kind"]!=="pending"||!Array.isArray(missing)||!missing.length||missing.length>1024)throw new SharedRelayError("version_pending_invalid");let previous=0n;for(const input of missing){const dependency=object(input);keys(dependency,"counter,writer");const id=writer(dependency["writer"]);if(BigInt(id)<=previous||counter(dependency["counter"])==="0")throw new SharedRelayError("version_pending_invalid");previous=BigInt(id);}return {kind:"pending"};
 }
 async packet(entry:SharedDocumentVersionEntry,signal:AbortSignal):Promise<string>{const result=await this.#request(`packets/${encodeURIComponent(entry.version.id)}`,signal,4*1024*1024);if(result.response.headers.get("x-breditor-catalog")!==this.#options.binding)throw new SharedRelayError("version_binding_mismatch");return packetText(result.text);}
 dispose():void{if(this.#closed)return;this.#closed=true;for(const controller of this.#active)controller.abort();}
}
