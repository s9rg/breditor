// Copied beside the candidate bindings by the experimental build harness.
// Never part of a package or executed at runtime.
import { BreditorCompiledProfile, type BreditorProjection } from "./breditor_wasm.js";
import { BreditorCompiledProfile as ShippingProfile, type BreditorProjection as ShippingProjection } from "../../packages/breditor-wasm/index.js";

declare const profile: BreditorCompiledProfile;
declare const projection: BreditorProjection;
declare const shippingProjection: ShippingProjection;
const rank: number | undefined = projection.headingLevel(0);
void rank;
BreditorCompiledProfile.fromBootstrapJsonV3("{}");
profile.createEngineFromDocumentJsonV5("lineage", "{}", 20);
profile.createEngineFromSessionCheckpointJsonV5("{}");
// @ts-expect-error Absence is explicit, not a numeric sentinel.
const requiredRank: number = projection.headingLevel(0);
void requiredRank;
// @ts-expect-error Experimental bootstrap is not part of the shipping API.
ShippingProfile.fromBootstrapJsonV3("{}");
// @ts-expect-error Experimental projection is not part of the shipping API.
shippingProjection.headingLevel(0);
// @ts-expect-error Text is not a valid numeric history capacity.
profile.createEngineFromDocumentJsonV5("lineage", "{}", "20");
