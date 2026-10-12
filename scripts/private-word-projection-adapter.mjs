// Local qualification only. Never installed by the shipped browser runtime.
import {decodeChildCountWords} from "./fixtures/nested-getter-probe/word-count.js";
const fields=[['childCount','childCountWords',1],['childAt','childAtWords',2],['formatCount','formatCountWords',1],['formatPropertyCount','formatPropertyCountWords',2],['headingLevel','headingLevelWords',1],['orderedListStart','orderedListStartWords',1]];

/** Install before creating editor owners; restore after all owners are disposed.
 * Preflight is atomic. No scalar retries, fallback values or input coercion.
 * Known generated class only; not production hostile-module qualification.
 */
export function installPrivateWordProjectionAdapter(api){
  const prototype=api.BreditorProjection.prototype;
  const entries=fields.map(([name,wordName,arity])=>{
    const original=Object.getOwnPropertyDescriptor(prototype,name);
    const word=Object.getOwnPropertyDescriptor(prototype,wordName);
    if(!original?.configurable||typeof original.value!=="function"||typeof word?.value!=="function")throw TypeError("missing private word projection methods");
    const getter=word.value;
    const wrapper=arity===1?function(index){return decodeChildCountWords(Reflect.apply(getter,this,[index]));}:function(index,ordinal){return decodeChildCountWords(Reflect.apply(getter,this,[index,ordinal]));};
    Object.defineProperty(wrapper,"name",{value:name});
    return {name,original,wrapper};
  });
  for(const {name,original,wrapper} of entries)Object.defineProperty(prototype,name,{...original,value:wrapper});
  let restored=false;
  return ()=>{
    if(restored)throw Error("private adapter already restored");
    for(const {name,wrapper} of entries)if(Object.getOwnPropertyDescriptor(prototype,name)?.value!==wrapper)throw Error("private adapter changed externally");
    for(const {name,original} of entries)Object.defineProperty(prototype,name,original);
    restored=true;
  };
}
