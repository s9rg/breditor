import {defaultAssetLimits,type AssetLimits} from "./types.js";
/** One immutable host policy; archive recovery never widens the store's existing bounds. */
export function checkedAssetLimits(input:Partial<AssetLimits>={}):Readonly<AssetLimits>{
 const limits={...defaultAssetLimits,...input};
 for(const [key,value]of Object.entries(limits))if(!(key in defaultAssetLimits)||!Number.isSafeInteger(value)||value<1||value>defaultAssetLimits[key as keyof AssetLimits])throw Error("Asset limits can only tighten defaults");
 return Object.freeze(limits);
}
