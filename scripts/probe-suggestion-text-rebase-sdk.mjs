import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {probeSuggestionRevisionsSdk} from "./probe-suggestion-revisions-sdk.mjs";
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4)throw Error("Expected packaged Wasm directory and isolated native revision host");
 console.log(JSON.stringify(await probeSuggestionRevisionsSdk(process.argv[2],process.argv[3],{textRebase:true}),null,2));
}
