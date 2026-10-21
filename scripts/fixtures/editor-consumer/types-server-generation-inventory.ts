import {SharedServerLogGenerationParticipantInventory,readSharedServerLogGenerationParticipantInventory,readSharedRoomParticipantInventory,MAX_SHARED_SERVER_LOG_GENERATION_RECORDS,type SharedServerLogGenerationParticipantIdentity,type SharedServerLogGenerationParticipantCoverage,type SharedRoomGenerationParticipantSource} from '@breditor/collaboration';
declare const file:Blob,identity:SharedServerLogGenerationParticipantIdentity,reader:SharedServerLogGenerationParticipantInventory,sources:readonly SharedRoomGenerationParticipantSource[];
const pending:Promise<SharedServerLogGenerationParticipantInventory>=readSharedServerLogGenerationParticipantInventory(file,identity);
const result:SharedServerLogGenerationParticipantCoverage=reader.checkGenerationSources(sources);
reader.checkMixedSources(sources.map(source=>({family:'generation',...source})));
const records:number=reader.metadata().native.room.records;
const manifest:readonly number[]=result.source.manifest;
const ceiling:number=MAX_SHARED_SERVER_LOG_GENERATION_RECORDS;
// @ts-expect-error Physical source pins cannot substitute for an original-only room selection.
readSharedRoomParticipantInventory(file,identity);
// @ts-expect-error Metadata/coverage handles do not activate native hosts.
reader.activate();
// @ts-expect-error Detached digests are immutable, not mutable native witnesses.
identity.source.archiveSha256.push(1);
void [pending,records,manifest,ceiling];
