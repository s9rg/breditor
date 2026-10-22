/** Shared/exclusive origin-lock fixture with real callback lifetimes; not OS/browser certification. */
export function assetLockHost(){
 const held=new Map(),queues=new Map();
 const grantable=(active,mode)=>!active?.size||mode==='shared'&&[...active].every(row=>row.mode==='shared');
 function drain(name){const queue=queues.get(name);if(!queue?.length){queues.delete(name);if(!held.get(name)?.size)held.delete(name);return;}const next=queue[0],active=held.get(name);if(!grantable(active,next.mode))return;queue.shift();const set=active??new Set(),row={mode:next.mode};set.add(row);held.set(name,set);
  const release=()=>{set.delete(row);drain(name);};Promise.resolve().then(()=>next.run({name,mode:next.mode})).then(value=>{release();next.resolve(value);},error=>{release();next.reject(error);});if(next.mode==='shared')drain(name);
 }
 const locks={request(name,options,run){if(typeof options==='function'){run=options;options={};}const mode=options.mode??'exclusive';if(!['exclusive','shared'].includes(mode))return Promise.reject(new TypeError('Unknown mode'));if(options.ifAvailable&&(queues.get(name)?.length||!grantable(held.get(name),mode)))return Promise.resolve().then(()=>run(null));return new Promise((resolve,reject)=>{const queue=queues.get(name)??[];queue.push({mode,run,resolve,reject});queues.set(name,queue);drain(name);});}};
 return{locks,held,queues};
}
