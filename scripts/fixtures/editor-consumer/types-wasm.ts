import {SharedEditorOwner,SharedObservation,SharedRichProfile} from "@breditor/collaboration/wasm";
// @ts-expect-error native writers are created only by the admitted profile factory
new SharedEditorOwner();
// @ts-expect-error native observations come only from the live owner
new SharedObservation();
// @ts-expect-error schema compilation is required before a profile exists
new SharedRichProfile();
void SharedRichProfile.from_configuration_json_v2;
void SharedRichProfile.from_standard_configuration_json_v2;
