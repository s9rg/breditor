import {SharedRoomRecoveryCatalogV2,SharedRoomRecoveryCatalogArchiveV2,SharedRoomRecoveryCatalogArchive,OperationalSharedGenerationParticipant,type SharedGenerationRecoveryFactory,type SharedGenerationParticipantSelection,type SharedRoomRecoveryCatalogV2CaptureOptions,type SharedRoomRecoveryCatalogV2Participant,type SharedRoomRecoveryCatalogV2Check,type SharedRoomRecoveryCatalogV2Selection} from "@breditor/collaboration";
/** Explicit family and readonly staging types; no source/permission capabilities are serialized. */
declare const input:SharedRoomRecoveryCatalogV2CaptureOptions,participants:readonly SharedRoomRecoveryCatalogV2Participant[],expected:SharedRoomRecoveryCatalogV2Selection;
declare const original:Extract<SharedRoomRecoveryCatalogV2Participant,{family:"original"}>["recovery"],generation:Extract<SharedRoomRecoveryCatalogV2Participant,{family:"generation"}>["recovery"],oldArchive:SharedRoomRecoveryCatalogArchive;
declare const continued:Extract<SharedGenerationRecoveryFactory,{kind:"continued-local"}>,participantSelection:SharedGenerationParticipantSelection;
async function contract(){
 const archive=await SharedRoomRecoveryCatalogArchiveV2.capture(input),catalog=await SharedRoomRecoveryCatalogV2.begin({database:"new-v2",archive,expected,checkAuthority(){}}),checked:SharedRoomRecoveryCatalogV2Check=await catalog.stage(participants);
 checked.coverage.kind;checked.unreconciledParticipants;catalog.serverFile();catalog.inventoryFile();catalog.participantFile("declared-copy");catalog.manifestJson();await catalog.progress();
 const values:readonly SharedRoomRecoveryCatalogV2Participant[]=[{id:"original",family:"original",recovery:original},{id:"generation",family:"generation",recovery:generation}];void values;
 for(const row of archive.metadata().participants)if(row.family==="generation")row.selection.identity.source.native.writer;else row.selection.identity.source.writer;
 const continuedParticipant:SharedRoomRecoveryCatalogV2Participant={id:"continued",family:"generation",recovery:{...generation,session:continued}};
 void continuedParticipant;
 const operation=await OperationalSharedGenerationParticipant.resume({database:"operational",recoveryDatabase:generation.database,
  expected:participantSelection,destinations:generation.destinations,session:continued,checkAuthority(){}});
 const operationalParts=await operation.intoParts();
 if(operationalParts.source.kind==="continued-local")await operationalParts.source.session.exportContinuedBackup();
 // @ts-expect-error A continued source explicitly requires the continued native profile.
 const missingProfile:SharedGenerationRecoveryFactory={kind:"continued-local",options:{...continued.options,profile:undefined}};
 void missingProfile;
 // @ts-expect-error Original catalog state is a distinct closed family, not a V2 file handle.
 SharedRoomRecoveryCatalogV2.begin({database:"new-v2",archive:oldArchive,expected,checkAuthority(){}});
 // @ts-expect-error A generation factory cannot silently serve the original journal family.
 const wrongOriginal:SharedRoomRecoveryCatalogV2Participant={id:"wrong",family:"original",recovery:generation};void wrongOriginal;
 // @ts-expect-error An original factory cannot reset a generation history into an old journal.
 const wrongGeneration:SharedRoomRecoveryCatalogV2Participant={id:"wrong",family:"generation",recovery:original};void wrongGeneration;
 // @ts-expect-error Staging needs explicit executable native factories, not progress or coverage DTOs.
 catalog.stage([checked]);
 // @ts-expect-error A resume must independently select the exact catalog.
 SharedRoomRecoveryCatalogV2.resume({database:"unknown",checkAuthority(){}});
 // @ts-expect-error Incoming readiness cannot construct a genuine runtime owner.
 new SharedRoomRecoveryCatalogV2();
 // @ts-expect-error Incoming files cannot construct an already admitted archive.
 new SharedRoomRecoveryCatalogArchiveV2();
 // @ts-expect-error Retained unresolved copies cannot be dropped from a frozen report.
 checked.unreconciledParticipants.length=0;
 // @ts-expect-error Metadata is immutable and cannot replace a selected server identity.
 archive.metadata().server.sha256="invented";
 // @ts-expect-error No editable native owners escape inactive staging.
 catalog.owners;
 // @ts-expect-error Source coverage and persisted control markers never activate a room.
 catalog.activate();
 // @ts-expect-error Credentials are a separate protected host lifecycle.
 checked.credentials;
 await catalog.close();archive.dispose();
}
void contract;
