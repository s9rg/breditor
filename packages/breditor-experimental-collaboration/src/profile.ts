import {SharedEditorError} from "./core.js";
import type {SharedOwnerDescriptor,SharedRustOwner} from "./types.js";
export type SharedFormatPropertyType=
 |{kind:"boolean"}
 |{kind:"integer";minimum:number|null;maximum:number|null}
 |{kind:"string";minimumUtf8Bytes:number;maximumUtf8Bytes:number};
export interface SharedProfileLimits {
 maxJsonBytes?:number;maxNodeDepth?:number;maxNodes?:number;maxChildrenPerElement?:number;
 maxTextBytes?:number;maxTotalTextBytes?:number;maxFormatsPerText?:number;maxPropertiesPerOwner?:number;
 maxPropertyDepth?:number;maxPropertyValues?:number;maxPropertyStringBytes?:number;maxTotalPropertyStringBytes?:number;
}
/** Original shared configuration. Rust compiles proof; this TypeScript shape is not proof. */
export interface SharedProfileConfiguration {
 format:"breditor/shared-rich-profile";formatVersion:1;schema:{name:string;version:number};
 limits?:Readonly<SharedProfileLimits>;
 extensions:readonly {id:{name:string;version:number};dependencies:readonly {name:string;version:number}[];
  conflicts:readonly {name:string;version:number}[];formats:readonly {kind:string;revision:number;
   properties:readonly {name:string;presence:"required"|"optional";valueType:SharedFormatPropertyType}[];}[];}[];
}
export interface SharedProfileDescriptor extends Omit<SharedOwnerDescriptor,"format"> {
 format:"breditor/shared-rich-profile-descriptor";formatVersion:1;limits:Required<SharedProfileLimits>;
}
/** Independent compiled factory. Caller frees it after all create/restore callbacks finish. */
export interface SharedRustProfile {
 descriptor_json():string;create(document:string,writer:string):SharedRustOwner;
 join_frame(room:string,writer:string,frame:string):SharedRustOwner;
 restore(room:string,journal:string):SharedRustOwner;free():void;
}
export interface SharedProfileModule {SharedRichProfile:{from_configuration_json(input:string):SharedRustProfile}}
/** Compile application-selected formats/budgets with matching Rust; no fixed probe schema. */
export function compileSharedProfile(wasm:SharedProfileModule,configuration:SharedProfileConfiguration):SharedRustProfile {
 const profile=wasm.SharedRichProfile.from_configuration_json(JSON.stringify(configuration));
 try{const d=JSON.parse(profile.descriptor_json()) as SharedProfileDescriptor;
  if(d.format!=="breditor/shared-rich-profile-descriptor"||d.formatVersion!==1||d.abiVersion!==1||d.modelVersion!==11||d.journalVersion!==12)throw new SharedEditorError("profile_abi","Unsupported shared profile ABI/model/history revision");
  return profile;
 }catch(error){profile.free();throw error;}
}
