import type {RichBlockLayoutPatch} from "./core.js";
/** Snapshot only primitive intent; JSON must never turn NaN, Infinity or a toJSON object into Clear. */
export function encodeBlockLayoutPatch(input:RichBlockLayoutPatch):string{
 if(!input||typeof input!=="object"||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new TypeError("Expected plain layout intent");
 const output:Record<string,string|number|null>=Object.create(null) as Record<string,string|number|null>;
 const keys=Reflect.ownKeys(input);if(keys.length>4)throw new TypeError("Unknown layout intent field");
 for(const key of keys){
  if(typeof key!=="string"||!["alignment","direction","indent","lineHeightPercent"].includes(key))throw new TypeError("Unknown layout intent field");
  const value=(input as Record<string,unknown>)[key];if(value===undefined)continue;
  if(value!==null){
   if(key==="alignment"||key==="direction"){if(typeof value!=="string")throw new TypeError("Layout text intent must be a primitive string or null");}
   else if(typeof value!=="number"||!Number.isFinite(value))throw new TypeError("Layout numeric intent must be a finite primitive number or null");
  }
  output[key]=value as string|number|null;
 }
 return JSON.stringify(output);
}
