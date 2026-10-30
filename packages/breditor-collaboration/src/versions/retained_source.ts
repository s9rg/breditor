/** Constructor-owned liveness for a catalog retained by a whole-room source.
 * Ordinary editing, capture and native-loan exclusion remain separate checks. */
import {managedSourceUnavailable} from '../managed_custody.js';
const catalogs=new WeakMap<object,{readonly core:object;readonly check:()=>void}>();
export function registerRetainedVersionCatalog(owner:object,core:object,check:()=>void):void{
 if(catalogs.has(owner))throw managedSourceUnavailable();catalogs.set(owner,{core,check});
}
export function checkRetainedVersionCatalog(owner:object,core:object):void{
 const actual=catalogs.get(owner);if(!actual||actual.core!==core)throw managedSourceUnavailable();actual.check();
}
