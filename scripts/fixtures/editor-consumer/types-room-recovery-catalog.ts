/** Catalog selection, explicit replay factories and staging diagnostics are not activation grants. */
import {SharedRoomRecoveryCatalog,SharedRoomRecoveryCatalogArchive,captureSharedRoomRecoveryCatalog,type SharedRoomRecoveryCatalogSelection,type SharedRoomRecoveryCatalogCaptureOptions,type SharedRoomRecoveryCatalogParticipant,type SharedRoomRecoveryCatalogCheck} from "@breditor/collaboration";
declare const input:SharedRoomRecoveryCatalogCaptureOptions,participants:readonly SharedRoomRecoveryCatalogParticipant[],expected:SharedRoomRecoveryCatalogSelection;
async function contract(){
 const archive=await captureSharedRoomRecoveryCatalog(input),catalog=await SharedRoomRecoveryCatalog.begin({database:"new-catalog",archive,expected,checkAuthority(){}}),checked:SharedRoomRecoveryCatalogCheck=await catalog.stage(participants);
 checked.kind;checked.coverage.kind;checked.unreconciledParticipants;catalog.serverFile();catalog.inventoryFile();catalog.participantFile("explicit-id");catalog.manifestJson();
 // @ts-expect-error Incoming files/progress flags do not select the trusted catalog.
 SharedRoomRecoveryCatalog.resume({database:"unknown",checkAuthority(){}});
 // @ts-expect-error Staging never accepts a serialized report as a native replay factory.
 catalog.stage([checked]);
 // @ts-expect-error Metadata cannot mutate an independently selected server identity.
 archive.metadata().server.sha256="invented";
 // @ts-expect-error Unselected histories cannot be silently dropped from a frozen report.
 checked.unreconciledParticipants.length=0;
 // @ts-expect-error No direct runtime constructor or detached fake archive is admitted.
 new SharedRoomRecoveryCatalogArchive();
 // @ts-expect-error Durable native ownership cannot be constructed from DTOs.
 new SharedRoomRecoveryCatalog();
 // @ts-expect-error No public mutable participant owners are exposed before activation/handoff.
 catalog.owners;
 // @ts-expect-error Stored status and source-prefix coverage cannot activate a deployment.
 catalog.activate();
 // @ts-expect-error Protected resume credentials have a separate host-owned lifecycle.
 checked.credentials;
 await catalog.close();archive.dispose();
}
void contract;
