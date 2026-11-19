import type {RichListNumberingPatch} from "./core.js";
/** Snapshot only primitive intent; JSON must never turn NaN or a toJSON object into a change. */
export function encodeListNumberingPatch(input:RichListNumberingPatch):RichListNumberingPatch{
 if(!input||typeof input!=="object"||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new TypeError("Expected plain list numbering intent");
 const output:Record<string,unknown>={};
 for(const key of Reflect.ownKeys(input)){
  if(typeof key!=="string"||!["list","style","reversed","start"].includes(key))throw new TypeError("Unknown list numbering intent field");
  const value=(input as unknown as Record<string,unknown>)[key];if(value===undefined)continue;
  if(key==="list"&&typeof value!=="string")throw new TypeError("List numbering target must be a block identity string");
  if(key==="style"&&value!==null&&typeof value!=="string")throw new TypeError("List numbering style must be a primitive string or null");
  if(key==="reversed"&&typeof value!=="boolean")throw new TypeError("List reversal must be Boolean");
  if(key==="start"&&(typeof value!=="number"||!Number.isSafeInteger(value)))throw new TypeError("List start must be a safe integer");
  output[key]=value;
 }
 return output as unknown as RichListNumberingPatch;
}
