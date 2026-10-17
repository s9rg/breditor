/** Clean local archives, installed public editor API, packaged Wasm and separate binary host. */
import {checkOwnedReviewInstalled} from "./check-owned-review-installed.mjs";
if(process.argv.length!==3)throw Error("Expected the review_assets_functional executable; build candidates first");
console.log(JSON.stringify(await checkOwnedReviewInstalled(process.argv[2],{includeControls:true,assetWorkflow:true}),null,2));
