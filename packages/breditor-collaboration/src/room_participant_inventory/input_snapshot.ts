/** Snapshot one bounded source-array shape before native admission. Caller
 * iterators, map overrides, species constructors and later lengths are ignored. */
export function snapshotInventoryInputs<T,R>(input:readonly T[],refuse:()=>Error,read:(row:T)=>R):R[]{
 if(!Array.isArray(input))throw refuse();
 const length=input.length;
 if(!Number.isSafeInteger(length)||length<0||length>1024)throw refuse();
 const rows:R[]=[];
 for(let index=0;index<length;index++){
  const row=input[index];
  if(row===undefined||row===null)throw refuse();
  rows.push(read(row));
 }
 return rows;
}
