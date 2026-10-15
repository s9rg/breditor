/** Optional entry: importing the local package root never imports this module or its Wasm. */
import {compileStandardSharedProfileV1,type SharedProfileConfiguration,type SharedRustProfile,type SharedProfileModule} from "@breditor/collaboration";
import {runtimeLoader,type RuntimeInput} from "./runtime_loader.js";
export * from "@breditor/collaboration";
const load=runtimeLoader(()=>import("@breditor/collaboration/wasm"));
export function initializeSharedRuntime(input?:RuntimeInput):Promise<SharedProfileModule>{return load(input);}
export const standardSharedProfileConfiguration:SharedProfileConfiguration=Object.freeze({format:"breditor/shared-rich-profile",formatVersion:1,schema:Object.freeze({name:"breditor-editor/standard",version:1}),extensions:Object.freeze([])});
/** Returns the original compiled native factory. Acquire a writer lease before create/join/restore. */
export async function createSharedProfile(configuration:SharedProfileConfiguration=standardSharedProfileConfiguration,input?:RuntimeInput):Promise<SharedRustProfile>{
 const snapshot=JSON.parse(JSON.stringify(configuration)) as SharedProfileConfiguration;
 return compileStandardSharedProfileV1(await initializeSharedRuntime(input),snapshot);
}
