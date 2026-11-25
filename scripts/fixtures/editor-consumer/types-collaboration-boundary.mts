import * as native from "@breditor/collaboration/wasm";
import {
  compileStandardSharedProfileV1, compileStandardStructuralSharedProfileV2,
  compileStandardLayoutSharedProfileV3, compileStandardRichSharedProfileV4,
  type SharedProfileDescriptor, type SharedProfileModule,
} from "@breditor/collaboration";
import {
  standardSharedProfileConfiguration, structuralSharedProfileConfigurationV2,
  layoutSharedProfileConfigurationV3, richSharedProfileConfigurationV4,
} from "@breditor/editor/collaboration";

const runtime: SharedProfileModule = native;
void compileStandardSharedProfileV1(runtime, standardSharedProfileConfiguration);
void compileStandardStructuralSharedProfileV2(runtime, structuralSharedProfileConfigurationV2);
void compileStandardLayoutSharedProfileV3(runtime, layoutSharedProfileConfigurationV3);
void compileStandardRichSharedProfileV4(runtime, richSharedProfileConfigurationV4);

// @ts-expect-error A configuration selected for V1 cannot use the V2 factory.
void compileStandardStructuralSharedProfileV2(runtime, standardSharedProfileConfiguration);
// @ts-expect-error A configuration selected for V3 cannot use the V4 factory.
void compileStandardRichSharedProfileV4(runtime, layoutSharedProfileConfigurationV3);
// @ts-expect-error This is a closed set of configuration versions.
void compileStandardRichSharedProfileV4(runtime, { ...richSharedProfileConfigurationV4, formatVersion: 5 });

function originalJournal(descriptor: SharedProfileDescriptor): 12 | 13 | 14 | 15 {
  if (descriptor.modelVersion === 12) {
    const journal: 13 = descriptor.journalVersion;
    const language: 2 = descriptor.richLanguageVersion;
    void language;
    return journal;
  }
  return descriptor.journalVersion;
}
void originalJournal;
