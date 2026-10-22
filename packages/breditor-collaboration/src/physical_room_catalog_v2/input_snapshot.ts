/** A fixed file/policy row shape. The larger file-table bound does not widen the
 * separate 1,024-source diagnostic cohort limit or invoke caller iteration. */
import {physicalCatalogFailure,MAX_PHYSICAL_ROOM_CATALOG_FILES} from '../physical_room_catalog/policy.js';
export function physicalCatalogV2Rows<T,R>(input:readonly T[],read:(value:T)=>R):R[]{
 if(!Array.isArray(input))throw physicalCatalogFailure('catalog_policy');
 const length=input.length;
 if(!Number.isSafeInteger(length)||length<0||length>MAX_PHYSICAL_ROOM_CATALOG_FILES-3)throw physicalCatalogFailure('catalog_budget');
 const rows:R[]=[];
 for(let index=0;index<length;index++){const value=input[index];if(value===undefined||value===null)throw physicalCatalogFailure('catalog_policy');rows.push(read(value));}
 return rows;
}
/** Unknown API flags do not become accepted readiness or ownership inputs. */
export function physicalCatalogV2Options(input:object,required:readonly string[],optional:readonly string[]):void{
 if(!input||typeof input!=='object'||Array.isArray(input))throw physicalCatalogFailure('catalog_policy');const keys=Object.keys(input);if(required.some(key=>!Object.hasOwn(input,key))||keys.some(key=>!required.includes(key)&&!optional.includes(key)))throw physicalCatalogFailure('catalog_policy');
}
