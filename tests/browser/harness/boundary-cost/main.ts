import { measureBoundaryCost } from "../../diagnostics/boundary_cost";

declare global {
  interface Window { breditorBoundaryCost: typeof measureBoundaryCost }
}
window.breditorBoundaryCost = measureBoundaryCost;
