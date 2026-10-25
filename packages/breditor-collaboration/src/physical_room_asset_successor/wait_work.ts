/** Cancel a reader's wait, not an already-running write/upload. Both settlement
 * branches remain observed if the read stops before the actual work finishes. */
export function waitSelectedAssetWork(work:Promise<unknown>,check:()=>void,watch:(cancel:()=>void)=>()=>void):Promise<void>{
 return new Promise((resolve,reject)=>{let done=false,unwatch=()=>{};const finish=(failed:boolean,error?:unknown)=>{if(done)return;done=true;unwatch();failed?reject(error):resolve();};
  try{check();unwatch=watch(()=>{try{check();}catch(error){finish(true,error);}});if(done)unwatch();}catch(error){finish(true,error);}
  void work.then(()=>{try{check();finish(false);}catch(error){finish(true,error);}},error=>finish(true,error));
 });
}
