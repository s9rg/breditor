import { probeNumberTransport } from "../../diagnostics/number_transport_probe";
import { readStartupRejections } from "../../diagnostics/startup_recorder";

Object.assign(window, {
  breditorNumberTransportProbe: probeNumberTransport,
  breditorStartupDiagnostics: readStartupRejections,
});
