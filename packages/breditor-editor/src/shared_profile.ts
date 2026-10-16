import {compileStandardSharedProfileV1,compileStandardStructuralSharedProfileV2,type SharedProfileConfiguration,type SharedProfileConfigurationV2,type SharedRustProfile,type SharedProfileModule} from "@breditor/collaboration";
import {runtimeLoader,type RuntimeInput} from "./runtime_loader.js";

const load=runtimeLoader(()=>import("@breditor/collaboration/wasm"));
export function initializeSharedRuntime(input?:RuntimeInput):Promise<SharedProfileModule>{return load(input);}
export const standardSharedProfileConfiguration:SharedProfileConfiguration=Object.freeze({format:"breditor/shared-rich-profile",formatVersion:1,schema:Object.freeze({name:"breditor-editor/standard",version:1}),extensions:Object.freeze([])});
export const structuralSharedProfileConfigurationV2:SharedProfileConfigurationV2=Object.freeze({format:"breditor/shared-rich-profile",formatVersion:2,schema:Object.freeze({name:"breditor-editor/standard",version:2}),extensions:Object.freeze([])});
/** Returns the original compiled native factory. Acquire a writer lease before create/join/restore. */
export async function createSharedProfile(configuration:SharedProfileConfiguration=standardSharedProfileConfiguration,input?:RuntimeInput):Promise<SharedRustProfile>{
 const snapshot=JSON.parse(JSON.stringify(configuration)) as SharedProfileConfiguration;
 return compileStandardSharedProfileV1(await initializeSharedRuntime(input),snapshot);
}
/** Explicit shared structural V2; never selects the language by inspecting a saved document. */
export async function createStructuralSharedProfileV2(configuration:SharedProfileConfigurationV2=structuralSharedProfileConfigurationV2,input?:RuntimeInput):Promise<SharedRustProfile>{
 const snapshot=JSON.parse(JSON.stringify(configuration)) as SharedProfileConfigurationV2;
 return compileStandardStructuralSharedProfileV2(await initializeSharedRuntime(input),snapshot);
}
