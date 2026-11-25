export async function countRasterWrites(database,operation){
 const prototype=IDBObjectStore.prototype,{put,add}=prototype,writes=[];
 const count=method=>function(...args){
  const request=method.apply(this,args);
  if(this.name==='assets'&&this.transaction.db.name===database)writes.push({asset:args[0].asset,bytes:args[0].payload.byteLength});
  return request;
 };
 prototype.put=count(put);prototype.add=count(add);
 try{
  await operation();
  return {rows:writes.length,payloadBytes:writes.reduce((total,row)=>total+row.bytes,0),assets:writes.map(row=>row.asset).sort()};
 }finally{prototype.put=put;prototype.add=add;}
}
