/** Internal semantic bindings of genuine managed owners. A readonly field may
 * be frozen, but must not become an application getter during private custody
 * checks. Descriptor inspection never evaluates a replacement accessor. This
 * is not a sandbox against replacement of JavaScript intrinsics/native methods. */
const names=["core","options"] as const;
function same(before:PropertyDescriptor|undefined,after:PropertyDescriptor|undefined):boolean{
 if(!before||!after)return before===after;
 if("value" in before)return "value" in after&&before.value===after.value;
 return !("value" in after)&&before.get===after.get&&before.set===after.set;
}
export function captureManagedSourceBindings(source:object,unavailable:()=>Error):()=>void{
 const prototype=Object.getPrototypeOf(source) as object|null;
 const selected=names.map(name=>({name,own:Object.getOwnPropertyDescriptor(source,name),inherited:prototype?Object.getOwnPropertyDescriptor(prototype,name):undefined}));
 return()=>{
  if(Object.getPrototypeOf(source)!==prototype)throw unavailable();
  for(const row of selected)if(!same(row.own,Object.getOwnPropertyDescriptor(source,row.name))||!same(row.inherited,prototype?Object.getOwnPropertyDescriptor(prototype,row.name):undefined))throw unavailable();
 };
}
