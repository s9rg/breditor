import type {SharedRoomBackupCut,SharedRoomParticipantInventoryIdentity,SharedRoomParticipantInventoryMetadata} from "./types.js";
import {object,name,choice,hex,digestBytes,decimal,writer,actor,list,ordered,invalid,frozen} from "./policy.js";
import {nativeRoomCut} from "./native_cut.js";
const roomCut=(value:unknown):SharedRoomBackupCut=>nativeRoomCut(value,4096);
export function inventoryIdentity(value:unknown):SharedRoomParticipantInventoryIdentity{const r=object(value,"room,sha256");return frozen({room:roomCut(r["room"]),sha256:digestBytes(r["sha256"])});}
function documentClock(value:unknown){const r=object(value,"prefixDigest,through,writer");return{writer:writer(r["writer"]),through:decimal(r["through"],2147483647n),prefixDigest:hex(r["prefixDigest"],true)};}
function reviewClock(value:unknown){const r=object(value,"actor,prefixDigest,through");return{actor:actor(r["actor"]),through:decimal(r["through"]),prefixDigest:hex(r["prefixDigest"],true)};}
export function inventoryMetadata(value:unknown):SharedRoomParticipantInventoryMetadata {
 return nativeInventoryMetadata(value,roomCut);
}
/** @internal Share closed registration declarations, never storage-family admission.
 * Original callers always use the unchanged single-log cut reader above. */
export function nativeInventoryMetadata(value:unknown,cut:(value:unknown)=>SharedRoomBackupCut):SharedRoomParticipantInventoryMetadata {
 const r=object(value,"accounts,format,formatVersion,review,revisionsBinding,richLanguage,room,schemaFingerprint,serverAuthors,suggestionsBinding,versionsBinding,writers");
 // The document writer array is mandatory, distinct from server-owned service authors.
 return body(r,cut);
}
function body(r:Record<string,unknown>,cut:(value:unknown)=>SharedRoomBackupCut):SharedRoomParticipantInventoryMetadata {
 const accounts=list(r["accounts"],5120,v=>{const a=object(v,"documentRole,owner,principal,reviewRole,suggestionRole");return{principal:name(a["principal"],128),owner:choice(a["owner"],[true,false]),documentRole:choice(a["documentRole"],["reader","editor",null] as const),reviewRole:choice(a["reviewRole"],["comment","moderator",null] as const),suggestionRole:choice(a["suggestionRole"],["propose","review",null] as const)};});
 const writers=list(r["writers"],1024,v=>{const w=object(v,"clock,observer,principal");return{principal:name(w["principal"],128),observer:choice(w["observer"],[true,false]),clock:documentClock(w["clock"])};});
 const review=r["review"]===null?null:(()=>{const x=object(r["review"],"binding,writers");return{binding:hex(x["binding"]),writers:list(x["writers"],1023,v=>{const w=object(v,"clock,observer,principal");return{principal:name(w["principal"],128),observer:choice(w["observer"],[true,false]),clock:reviewClock(w["clock"])};})};})();
 ordered(accounts,a=>a.principal);ordered(writers,w=>w.clock.writer);if(review)ordered(review.writers,w=>w.clock.actor);
 return frozen({format:choice(r["format"],["breditor/room-participant-inventory"]),formatVersion:choice(r["formatVersion"],[1]),room:cut(r["room"]),schemaFingerprint:hex(r["schemaFingerprint"],true),richLanguage:choice(r["richLanguage"],[1,2,3]),accounts,writers,review,versionsBinding:r["versionsBinding"]===null?null:hex(r["versionsBinding"]),suggestionsBinding:r["suggestionsBinding"]===null?null:hex(r["suggestionsBinding"]),revisionsBinding:r["revisionsBinding"]===null?null:hex(r["revisionsBinding"]),serverAuthors:list(r["serverAuthors"],2,v=>{const a=object(v,"clock,kind");return{kind:choice(a["kind"],["genesis","suggestionEffect"] as const),clock:documentClock(a["clock"])};})});
}
