/** Explicit asset-enabled review matrix; leaves the original suggestion fixture unchanged. */
import {probeReviewAssetsMatrix} from "./probe-review-assets-matrix.mjs";
if(process.argv.length!==4)throw Error("Expected packaged application Wasm directory and review_assets_functional host");
console.log(JSON.stringify(await probeReviewAssetsMatrix(...process.argv.slice(2),{onProgress:value=>console.error(JSON.stringify(value))}),null,2));
