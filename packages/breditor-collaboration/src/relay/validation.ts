import {SharedEditorError,SharedRichEditor} from "../core.js";
import type {SharedWriterClock} from "../types.js";
import type {SharedProfileDescriptor} from "../profile.js";
import type {SharedRelayIdentity} from "./types.js";

export class SharedRelayError extends SharedEditorError {
 constructor(code:string){super(code,`Shared relay: ${code}`);this.name="SharedRelayError";}
}
export function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new SharedRelayError("protocol_error");return value as Record<string,unknown>;}
export function string(value:unknown,max:number):string{if(typeof value!=="string"||value.length>max)throw new SharedRelayError("protocol_error");return value;}
export function counter(value:unknown):string{const n=string(value,10);if(!/^(0|[1-9][0-9]*)$/.test(n)||BigInt(n)>2147483647n)throw new SharedRelayError("protocol_error");return n;}
export function decimal(value:unknown):string{const n=string(value,20);if(!/^(0|[1-9][0-9]*)$/.test(n)||BigInt(n)>18446744073709551615n)throw new SharedRelayError("protocol_error");return n;}
export function writer(value:unknown):string{const n=decimal(value);if(n==="0"||n==="18446744073709551615")throw new SharedRelayError("protocol_error");return n;}
export function digest(value:unknown):string{const d=string(value,71);if(!/^sha256:[0-9a-f]{64}$/.test(d))throw new SharedRelayError("protocol_error");return d;}
export function secret(value:unknown):string{const s=string(value,64);if(!/^[0-9a-f]{64}$/.test(s))throw new SharedRelayError("credential_invalid");return s;}
export function endpoint(value:string):string{let url:URL;try{url=new URL(value);}catch{throw new SharedRelayError("endpoint_invalid");}if(!["ws:","wss:"].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new SharedRelayError("endpoint_invalid");return url.href;}
export function identity(value:SharedRelayIdentity):SharedRelayIdentity{
 const principal=string(value.principal,128),room=string(value.room,200);
 if(!principal||!room||/[\x00-\x1f\x7f]/.test(principal)||new TextEncoder().encode(principal).length>128||new TextEncoder().encode(room).length>200)throw new SharedRelayError("identity_invalid");
 return Object.freeze({endpoint:endpoint(value.endpoint),principal,room,writer:writer(value.writer),credential:secret(value.credential)});
}
export function timeout(value:number|undefined):number{const n=value??10_000;if(!Number.isInteger(n)||n<100||n>30_000)throw new SharedRelayError("timeout_invalid");return n;}
export function clock(value:unknown,expectedWriter:string):SharedWriterClock{const c=object(value);if(writer(c["writer"])!==expectedWriter)throw new SharedRelayError("writer_mismatch");return{writer:expectedWriter,through:counter(c["through"]),prefixDigest:digest(c["prefixDigest"])};}
export function frame(value:unknown):string{const s=string(value,5*1024*1024);if(new TextEncoder().encode(s).length>5*1024*1024)throw new SharedRelayError("protocol_error");return s;}
export function descriptor(value:unknown):SharedProfileDescriptor{
 const d=object(JSON.parse(string(value,16*1024)));
 if(d["format"]!=="breditor/shared-rich-profile-descriptor"||d["formatVersion"]!==1||d["abiVersion"]!==1||d["modelVersion"]!==11||d["journalVersion"]!==12)throw new SharedRelayError("profile_mismatch");
 digest(d["schemaFingerprint"]);return d as unknown as SharedProfileDescriptor;
}
export function checkDescriptor(core:SharedRichEditor,d:SharedProfileDescriptor):void{const local=core.descriptor();if(d.schemaFingerprint!==local.schemaFingerprint||d.schema?.name!==local.schema.name||d.schema?.version!==local.schema.version)throw new SharedRelayError("profile_mismatch");}
export interface GroupMetadata {writer:string;from:string;through:string;previousDigest:string;groupDigest:string}
export function groupMetadata(raw:string):GroupMetadata{const g=object(JSON.parse(raw));if(g["format"]!=="breditor/shared-writer-group"||g["formatVersion"]!==1||g["kind"]!=="action")throw new SharedRelayError("writer_origin_invalid");return{writer:writer(g["writer"]),from:counter(g["from"]),through:counter(g["through"]),previousDigest:digest(g["previousDigest"]),groupDigest:digest(g["groupDigest"])};}
/** Read native canonical prefix proof; never rebuild or merge a JS replicated document. */
export function prefixAt(core:SharedRichEditor,id:string,through:string):string{
 const local=core.writerClock(id);if(BigInt(through)>BigInt(local.through))throw new SharedRelayError("server_ahead");
 if(through===local.through)return local.prefixDigest;
 const first=core.writerGroups(through).groups[0];if(first===undefined)throw new SharedRelayError("history_fork");
 return groupMetadata(first).previousDigest;
}
export function checkClock(core:SharedRichEditor,c:SharedWriterClock):void{if(prefixAt(core,c.writer,c.through)!==c.prefixDigest)throw new SharedRelayError("history_fork");}
