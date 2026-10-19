/** Copy a native crate without duplicating its root Cargo build cache. */
import {cpSync} from "node:fs";
import {resolve} from "node:path";
export function copyNativeSourceCrate(source,destination){
 const cache=resolve(source,"target");
 // Only the crate-root cache is excluded; vendor/source entries named target remain.
 cpSync(source,destination,{recursive:true,filter:path=>resolve(path)!==cache});
}
