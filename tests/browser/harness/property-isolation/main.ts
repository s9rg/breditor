import { probePropertyBoundary } from "../../diagnostics/property_boundary_probe";
import { readStartupRejections } from "../../diagnostics/startup_recorder";

Object.assign(window, {
  breditorPropertyBoundaryProbe: probePropertyBoundary,
  breditorStartupDiagnostics: readStartupRejections,
});
