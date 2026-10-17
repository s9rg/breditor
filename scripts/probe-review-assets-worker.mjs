/** One complete, isolated fixture origin. Only the matrix driver may select one policy. */
import {probeSuggestionSyncSdk} from "./probe-suggestion-sync-sdk.mjs";
if(process.argv.length!==3)throw Error("Expected one private asset matrix worker request");
const {directory,executable,options,policy}=JSON.parse(process.argv[2]);
console.log(JSON.stringify(await probeSuggestionSyncSdk(directory,executable,{...options,ownedHistory:true,controls:true,assetWorkflow:true,selectedAssetPolicy:policy,onProgress:value=>console.error(JSON.stringify(value))})));
