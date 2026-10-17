/** Transport/storage metadata checks only. Rust remains the sole version/AST/source validator. */
import {SharedRelayError,object,string,decimal,digest,endpoint,writer,transportVersion} from "../relay/validation.js";
import type {SharedDocumentVersionInfo} from "../version_types.js";
import type {SharedDocumentVersionsIdentity,SharedDocumentVersionsDescriptor,SharedDocumentVersionEntry,SharedDocumentVersionsCursor,VersionCatalogSnapshot} from "./types.js";
export const utf8=(value:string):number=>new TextEncoder().encode(value).length;
export function keys(value:Record<string,unknown>,expected:string):void{if(Object.keys(value).sort().join(",")!==expected)throw new SharedRelayError("version_protocol_error");}
export function binding(value:unknown):string{const result=string(value,64);if(!/^[a-f0-9]{64}$/.test(result))throw new SharedRelayError("version_binding_invalid");return result;}
export function versionIdentity(input:SharedDocumentVersionsIdentity):SharedDocumentVersionsIdentity{
 const principal=string(input.principal,128),room=string(input.room,200),version=transportVersion(input.writerTransport);
 if(!principal.trim()||utf8(principal)>128||/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(principal)||!room||utf8(room)>200||/[\ud800-\udfff]/u.test(room))throw new SharedRelayError("version_identity_invalid");
 return {endpoint:endpoint(input.endpoint),principal,room,binding:binding(input.binding),documentWriter:writer(input.documentWriter),...(version===2?{writerTransport:"atomic-v2"}:{})};
}
export function versionInfo(input:unknown):SharedDocumentVersionInfo {
 const value=object(input);keys(value,"author,createdAtMs,id,name");const name=string(value["name"],256),author=string(value["author"],128);
 if(!name.trim()||utf8(name)>256||!author.trim()||utf8(author)>128||/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(name+author))throw new SharedRelayError("version_metadata_invalid");
 return {id:digest(value["id"]),name,author,createdAtMs:decimal(value["createdAtMs"])};
}
export function sameInfo(a:SharedDocumentVersionInfo,b:SharedDocumentVersionInfo):boolean{return a.id===b.id&&a.name===b.name&&a.author===b.author&&a.createdAtMs===b.createdAtMs;}
export function versionEntry(input:unknown):SharedDocumentVersionEntry{const value=object(input);keys(value,"sequence,version");const sequence=decimal(value["sequence"]);if(sequence==="0")throw new SharedRelayError("version_sequence_invalid");return {sequence,version:versionInfo(value["version"])};}
export function sameEntry(a:SharedDocumentVersionEntry,b:SharedDocumentVersionEntry):boolean{return a.sequence===b.sequence&&sameInfo(a.version,b.version);}
export function versionDescriptor(input:unknown,identity:Pick<SharedDocumentVersionsIdentity,"room"|"binding">):SharedDocumentVersionsDescriptor{
 const value=object(input);keys(value,"binding,document,format,formatVersion");if(value["format"]!=="breditor/relay-document-versions"||value["formatVersion"]!==1||value["document"]!==identity.room||binding(value["binding"])!==identity.binding)throw new SharedRelayError("version_binding_mismatch");
 return {format:"breditor/relay-document-versions",formatVersion:1,document:identity.room,binding:identity.binding};
}
export function versionCursor(input:unknown,identity:Pick<SharedDocumentVersionsIdentity,"room"|"binding">):SharedDocumentVersionsCursor{const value=object(input);keys(value,"after,binding,through");if(binding(value["binding"])!==identity.binding)throw new SharedRelayError("version_binding_mismatch");const after=decimal(value["after"]),through=decimal(value["through"]);if(BigInt(after)>BigInt(through))throw new SharedRelayError("version_cursor_invalid");return {binding:identity.binding,after,through};}
export function catalogSnapshot(input:unknown):VersionCatalogSnapshot {
 const value=object(input);keys(value,"entries,through");const through=decimal(value["through"]),entries=value["entries"];if(through==="0")throw new SharedRelayError("version_catalog_terminal");if(!Array.isArray(entries)||entries.length>1024)throw new SharedRelayError("version_catalog_budget");
 let before=0n;const ids=new Set<string>(),result:SharedDocumentVersionEntry[]=[];
 for(const raw of entries){const entry=versionEntry(raw);if(BigInt(entry.sequence)<=before||BigInt(entry.sequence)>BigInt(through)||ids.has(entry.version.id))throw new SharedRelayError("version_catalog_order");before=BigInt(entry.sequence);ids.add(entry.version.id);result.push(entry);}
 if(result.length&&result.at(-1)!.sequence!==through)throw new SharedRelayError("version_catalog_terminal");return {through,entries:result};
}
export function packetText(input:unknown):string{const packet=string(input,4*1024*1024);if(utf8(packet)>4*1024*1024)throw new SharedRelayError("version_packet_budget");return packet;}
