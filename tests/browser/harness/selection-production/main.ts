import { probeRestoredSelections } from "../selection_restore_probe";

// A static import puts the real consumer and generated glue through the
// production bundler. The development test's runtime import cannot do that.
Object.assign(window, { breditorSelectionProbe: probeRestoredSelections });
