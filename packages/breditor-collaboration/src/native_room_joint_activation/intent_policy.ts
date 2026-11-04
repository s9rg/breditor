/** Bounded original descriptor policy. Bounds refuse complete work; they never
 * truncate archives, drop participants or reset history. */
export const MAX_JOINT_ACTIVATION_PLAN_BYTES=32*1024*1024;
export const jointIntentFailure=(code='joint_activation_intent_policy')=>Object.assign(new Error('Retain one complete exact joint plan before committing or exposing a replacement'),{code});
export const jointEqual=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Detach inert data before passing it to older independent format parsers.
 * No getters, toJSON, sparse arrays or class instances execute while cloning. */
export function snapshotJointActivationData(value:unknown):unknown{
 let nodes=0,strings=0;const active=new WeakSet<object>();
 const visit=(item:unknown,depth:number):unknown=>{
  if(++nodes>1000000||depth>128)throw jointIntentFailure();
  if(item===null||typeof item==='boolean')return item;
  if(typeof item==='number'){if(!Number.isFinite(item)||Object.is(item,-0))throw jointIntentFailure();return item;}
  if(typeof item==='string'){strings+=new TextEncoder().encode(item).length;if(strings>MAX_JOINT_ACTIVATION_PLAN_BYTES)throw jointIntentFailure();return item;}
  if(!item||typeof item!=='object'||active.has(item))throw jointIntentFailure();
  const array=Array.isArray(item),prototype=Object.getPrototypeOf(item);if(!array&&prototype!==Object.prototype&&prototype!==null)throw jointIntentFailure();
  active.add(item);try{
   const keys=Reflect.ownKeys(item);
   if(array){if(keys.length!==item.length+1||item.length>1000000)throw jointIntentFailure();const out=[];for(let i=0;i<item.length;i++){const d=Object.getOwnPropertyDescriptor(item,String(i));if(!d?.enumerable||!('value'in d))throw jointIntentFailure();out.push(visit(d.value,depth+1));}return out;}
   const out:Record<string,unknown>=Object.create(null);for(const name of keys){if(typeof name!=='string')throw jointIntentFailure();strings+=new TextEncoder().encode(name).length;if(strings>MAX_JOINT_ACTIVATION_PLAN_BYTES)throw jointIntentFailure();const d=Object.getOwnPropertyDescriptor(item,name);if(!d?.enumerable||!('value'in d))throw jointIntentFailure();Object.defineProperty(out,name,{enumerable:true,configurable:true,writable:true,value:visit(d.value,depth+1)});}return out;
  }finally{active.delete(item);}
 };
 return visit(value,0);
}
