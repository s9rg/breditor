import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {checkOwnedReviewInstalled} from "./check-owned-review-installed.mjs";
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error("Expected isolated native suggestion host; build candidate packages first");
 console.log(JSON.stringify(await checkOwnedReviewInstalled(process.argv[2],{includeObserver:true,includeControls:true}),null,2));
}
