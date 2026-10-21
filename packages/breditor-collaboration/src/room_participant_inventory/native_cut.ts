/** Closed native cut declaration. The enclosing storage family supplies its own
 * record ceiling; this function does not admit storage or prove native replay. */
import type {SharedRoomBackupCut} from "./types.js";
import {object,name,choice,hex,digestBytes,invalid} from "./policy.js";
export function nativeRoomCut(value:unknown,maximumRecords:number):SharedRoomBackupCut {
 const r=object(value,"assetBinding,document,owner,profile,records,terminalLogDigest,writerTransportVersion"),p=r["profile"];
 if(!p||typeof p!=="object"||Array.isArray(p))throw invalid();const kind=choice((p as Record<string,unknown>)["kind"],["original","structuralV2","layoutV3"] as const);
 const v=object(p,kind==="original"?"kind":"kind,standardInlineV1"),profile=kind==="original"?{kind}:{kind,standardInlineV1:choice(v["standardInlineV1"],[true,false])};
 const records=r["records"];if(typeof records!=="number"||!Number.isSafeInteger(records)||records<1||records>maximumRecords)throw invalid();
 return {document:name(r["document"],200),owner:name(r["owner"],128),assetBinding:hex(r["assetBinding"],true),profile,writerTransportVersion:choice(r["writerTransportVersion"],[1,2]),records,terminalLogDigest:digestBytes(r["terminalLogDigest"])};
}
