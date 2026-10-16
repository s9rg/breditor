import {SharedEditorError} from "./core.js";
import type {SharedOwnerDescriptor,SharedRustOwner} from "./types.js";
import {sharedProtocolLanguage,type SharedProtocolBinding} from "./protocol.js";
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
/** Explicit format 2 configuration; never inferred from its document or schema name. */
export type SharedProfileConfigurationV2=Omit<SharedProfileConfiguration,"formatVersion">&{formatVersion:2};
/** Explicit native layout configuration; old selectors never infer it from content. */
export type SharedProfileConfigurationV3=Omit<SharedProfileConfiguration,"formatVersion">&{formatVersion:3};
export type SharedProfileDescriptor=SharedProtocolBinding&Pick<SharedOwnerDescriptor,"schema"|"schemaFingerprint">&{
 format:"breditor/shared-rich-profile-descriptor";formatVersion:1;limits:Required<SharedProfileLimits>;
};
/** Independent compiled factory. Caller frees it after all create/restore callbacks finish. */
export interface SharedRustProfile {
 descriptor_json():string;inline_catalog_json():string;create(document:string,writer:string):SharedRustOwner;
 join_frame(room:string,writer:string,frame:string):SharedRustOwner;
 restore(room:string,journal:string):SharedRustOwner;free():void;
 typing_history_version?():string;restore_typing?(room:string,journal:string):SharedRustOwner;
}
/** No shape sniffing or fallback to the original factory on an older paired runtime. */
export function supportsSharedTypingHistory(profile:SharedRustProfile):boolean{return typeof profile.typing_history_version==="function"&&profile.typing_history_version()==="1"&&typeof profile.restore_typing==="function";}
export function restoreSharedTypingEditor(profile:SharedRustProfile,room:string,journal:string):SharedRustOwner{
 if(!supportsSharedTypingHistory(profile))throw new SharedEditorError("typing_history_unavailable","Use matching native shared typing-history recovery");
 return profile.restore_typing!(room,journal);
}
export interface SharedProfileModule {SharedRichProfile:{from_configuration_json(input:string):SharedRustProfile;from_standard_configuration_json_v1?(input:string):SharedRustProfile;from_configuration_json_v2?(input:string):SharedRustProfile;from_standard_configuration_json_v2?(input:string):SharedRustProfile;from_configuration_json_v3?(input:string):SharedRustProfile;from_standard_configuration_json_v3?(input:string):SharedRustProfile}}
/** Compile application-selected formats/budgets with matching Rust; no fixed probe schema. */
export function compileSharedProfile(wasm:SharedProfileModule,configuration:SharedProfileConfiguration):SharedRustProfile {
 const profile=wasm.SharedRichProfile.from_configuration_json(JSON.stringify(configuration));
 return admitProfile(profile);
}
/** Standard V1 is added in Rust before dependency resolution, never by editing a descriptor. */
export function compileStandardSharedProfileV1(wasm:SharedProfileModule,configuration:SharedProfileConfiguration):SharedRustProfile {
 if(typeof wasm.SharedRichProfile.from_standard_configuration_json_v1!=="function")throw new SharedEditorError("standard_profile_unavailable","Use a matching Rust module with standard inline V1 support");
 return admitProfile(wasm.SharedRichProfile.from_standard_configuration_json_v1(JSON.stringify(configuration)));
}
/** Compile structural V2 only through the matching native format 2 factory. */
export function compileStructuralSharedProfileV2(wasm:SharedProfileModule,configuration:SharedProfileConfigurationV2):SharedRustProfile {
 const factory=wasm.SharedRichProfile.from_configuration_json_v2;
 if(typeof factory!=="function")throw new SharedEditorError("structural_profile_unavailable","Use a matching Rust module with shared structural V2 support");
 return admitProfile(factory.call(wasm.SharedRichProfile,JSON.stringify(configuration)),2);
}
/** Standard inline V1 declarations compose with V2 structure; neither original factory changes. */
export function compileStandardStructuralSharedProfileV2(wasm:SharedProfileModule,configuration:SharedProfileConfigurationV2):SharedRustProfile {
 const factory=wasm.SharedRichProfile.from_standard_configuration_json_v2;
 if(typeof factory!=="function")throw new SharedEditorError("structural_profile_unavailable","Use a matching Rust module with standard shared structural V2 support");
 return admitProfile(factory.call(wasm.SharedRichProfile,JSON.stringify(configuration)),2);
}
/** Compile layout V3 only through its matching factory and exact model13/journal14 descriptor. */
export function compileLayoutSharedProfileV3(wasm:SharedProfileModule,configuration:SharedProfileConfigurationV3):SharedRustProfile {
 const factory=wasm.SharedRichProfile.from_configuration_json_v3;
 if(typeof factory!=="function")throw new SharedEditorError("layout_profile_unavailable","Use a matching Rust module with shared layout V3 support");
 return admitProfile(factory.call(wasm.SharedRichProfile,JSON.stringify(configuration)),3);
}
export function compileStandardLayoutSharedProfileV3(wasm:SharedProfileModule,configuration:SharedProfileConfigurationV3):SharedRustProfile {
 const factory=wasm.SharedRichProfile.from_standard_configuration_json_v3;
 if(typeof factory!=="function")throw new SharedEditorError("layout_profile_unavailable","Use a matching Rust module with standard shared layout V3 support");
 return admitProfile(factory.call(wasm.SharedRichProfile,JSON.stringify(configuration)),3);
}
function admitProfile(profile:SharedRustProfile,language:1|2|3=1):SharedRustProfile {
 try{const d=JSON.parse(profile.descriptor_json()) as SharedProfileDescriptor;
  if(d.format!=="breditor/shared-rich-profile-descriptor"||d.formatVersion!==1||sharedProtocolLanguage(d)!==language)throw new SharedEditorError("profile_abi","Unsupported shared profile ABI/model/history revision");
  return profile;
 }catch(error){profile.free();throw error;}
}
