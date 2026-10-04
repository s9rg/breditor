// Copied beside candidate bindings for type-checking, never shipped.
import { BreditorCompiledProfile, type BreditorProjection } from "./breditor_wasm.js";
import { BreditorCompiledProfile as ShippingProfile, type BreditorProjection as ShippingProjection } from "../../packages/breditor-wasm/index.js";
declare const profile: BreditorCompiledProfile;
declare const projection: BreditorProjection;
declare const shipping: ShippingProjection;
const marker: "bullet" | "ordered" | undefined = projection.listKind(0);
const start: number | undefined = projection.orderedListStart(0);
void marker; void start;
BreditorCompiledProfile.fromBootstrapJsonV4("{}");
profile.createEngineFromDocumentJsonV6("lineage", "{}", 20);
profile.createEngineFromSessionCheckpointJsonV6("{}");
// @ts-expect-error Optional ordinal is not a sentinel number.
const required: number = projection.orderedListStart(0);
void required;
// @ts-expect-error List bootstrap is experimental, not shipping.
ShippingProfile.fromBootstrapJsonV4("{}");
// @ts-expect-error List projection is experimental, not shipping.
shipping.listKind(0);
// @ts-expect-error History capacity must be numeric.
profile.createEngineFromDocumentJsonV6("lineage", "{}", "20");
