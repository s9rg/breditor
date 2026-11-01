/** Omit only an original receipt from a valid HTTP/data frame. Do not turn the
 * semantic missing-receipt scenario into an unrelated byte-length failure. */
import assert from 'node:assert/strict';
export async function omitFirstOriginalVersion(response){
 const body=await response.json(),lane=body.metadata.versions;
 assert.equal(lane.kind,'page');assert.ok(lane.catalog.entries.length>1);
 const removed=lane.catalog.entries.shift(),id=removed.version.id;
 lane.packets=lane.packets.filter(row=>row.id!==id);
 const text=JSON.stringify(body),headers=new Headers(response.headers);
 headers.set('Content-Length',String(Buffer.byteLength(text)));
 return{id,response:new Response(text,{status:response.status,headers})};
}
