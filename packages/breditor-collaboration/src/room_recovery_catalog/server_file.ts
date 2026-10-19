import {inventoryIdentity} from "../room_participant_inventory/parse.js";
import {digest,failure,object} from "./policy.js";
import type {SharedRoomParticipantInventoryIdentity} from "../room_participant_inventory/types.js";
/** Couple the opaque native bundle to this room cut. This is NOT native log/raster admission. */
export async function checkServerFile(file:Blob,expected:SharedRoomParticipantInventoryIdentity,guard:()=>void):Promise<void>{
 const magic=new TextEncoder().encode("BREDITOR-SERVER1\n"),prefix=magic.length+4+32;
 guard();const start=new Uint8Array(await file.slice(0,prefix).arrayBuffer());guard();
 if(start.length!==prefix||magic.some((byte,index)=>start[index]!==byte))throw failure("catalog_integrity");
 const size=new DataView(start.buffer).getUint32(magic.length);if(size<1||size>64*1024||prefix+size>=file.size)throw failure("catalog_integrity");
 const headerFile=file.slice(prefix,prefix+size),hash=await digest(headerFile,guard),saved=[...start.slice(magic.length+4)].map(b=>b.toString(16).padStart(2,"0")).join("");if(hash!==saved)throw failure("catalog_integrity");
 const encoded=new Uint8Array(await headerFile.arrayBuffer());guard();
 try{
  const text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(encoded),h=object(JSON.parse(text),"assets,format,formatVersion,log,rasters,room"),room=inventoryIdentity({room:h["room"],sha256:expected.sha256}).room;
  if(h["format"]!=="breditor/server-room-backup"||h["formatVersion"]!==1||JSON.stringify(room)!==JSON.stringify(expected.room)||JSON.stringify(h)!==text)throw failure("catalog_integrity");
  const assets=h["assets"];if(!assets||typeof assets!=="object"||Array.isArray(assets)||(assets as Record<string,unknown>)["binding"]!==room.assetBinding)throw failure("catalog_integrity");
 }catch{throw failure("catalog_integrity");}
}
