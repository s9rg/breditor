/** Build receipt requirements for stages executed by the candidate runner. */
import {activationRuntimeStageIds} from "./activation-shards.mjs";
import {metadataFixtureStageIds} from "./metadata-fixture-evidence.mjs";

export function candidateStageReceipts(check){
 const nativeFixture=activationRuntimeStageIds.includes(check.id)||metadataFixtureStageIds.includes(check.id);
 return {nativeFixture,sharedRuntime:nativeFixture||check.requiresSharedRuntime===true};
}
