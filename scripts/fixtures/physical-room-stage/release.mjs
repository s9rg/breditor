/** Genuine private catalog state retained by a closed public owner; not an RSS benchmark. */
import assert from 'node:assert/strict';
export async function checkPhysicalCatalogCacheRelease({api,wasm,archive,transferPhysicalRoomCatalog,counts,tag}){
 const options={wasm,database:tag+'-cache-release',expected:archive.selection(),checkAuthority(){}};let catalog,cold,state;
 try{
  catalog=await api.SharedPhysicalRoomRecoveryCatalog.begin({...options,archive});const metadata=catalog.metadata(),file=catalog.currentServerFile(),stop=Error('Only inspect genuine private cache custody');
  await assert.rejects(transferPhysicalRoomCatalog(catalog,held=>{state=held.state;return async()=>{throw stop;};}),error=>error===stop);
  assert.equal(state.files.size,6);assert.equal(state.clients.size,3);const clients=[...state.clients.values()];
  await catalog.close();assert.deepEqual({files:state.files.size,clients:state.clients.size},{files:0,clients:0},'A closed physical catalog must release its private retained file/client maps');
  assert.deepEqual(catalog.metadata(),metadata);assert.throws(()=>catalog.currentServerFile(),error=>error.code==='catalog_closed');for(const client of clients)assert.throws(()=>client.backup.file());
  cold=await api.SharedPhysicalRoomRecoveryCatalog.resume(options);assert.deepEqual(cold.metadata(),metadata);assert.deepEqual(new Uint8Array(await cold.currentServerFile().arrayBuffer()),new Uint8Array(await file.arrayBuffer()));counts.closedCacheReleases++;
 }finally{await cold?.close();await catalog?.close();}
}
