/** Public immutable metadata and diagnostic coverage; no inferred factory, credential or grant. */
import {SharedRoomParticipantInventory,readSharedRoomParticipantInventory,type SharedRoomParticipantInventoryIdentity,type SharedRoomParticipantSource,type SharedRoomParticipantCoverage} from "@breditor/collaboration";
declare const file:Blob,expected:SharedRoomParticipantInventoryIdentity,sources:readonly SharedRoomParticipantSource[];
async function contract(){
 const inventory=await readSharedRoomParticipantInventory(file,expected),result:SharedRoomParticipantCoverage=inventory.checkSources(sources);
 inventory.identity().room.profile.kind;inventory.metadata().richLanguage;
 // @ts-expect-error No expected cut is inferred from incoming metadata.
 readSharedRoomParticipantInventory(file);
 // @ts-expect-error An admitted handle requires SDK byte admission and a private runtime key.
 new SharedRoomParticipantInventory();
 // @ts-expect-error A copied inventory checksum cannot substitute for the private live handle.
 const invented:SharedRoomParticipantInventory={identity:()=>expected,metadata:()=>inventory.metadata(),file:()=>file,checkSources:()=>result,dispose(){}};
 // @ts-expect-error Native metadata cannot mutate an immutable account union.
 inventory.metadata().accounts.push({});
 // @ts-expect-error The selected native digest is immutable.
 inventory.identity().sha256[0]=1;
 // @ts-expect-error A diagnostic report cannot mutate itself into global readiness.
 result.registeredStreamsCovered=true;
 // @ts-expect-error Native read checks neither issue nor return protected resume credentials.
 result.credentials;
 // @ts-expect-error Detached selected metadata cannot substitute for an admitted participant file.
 inventory.checkSources([{backup:expected,source:sources[0]!.source}]);
 // @ts-expect-error Matching registered streams does not activate a deployment.
 inventory.activate();
 // @ts-expect-error Credential continuity is a separate authenticated native host operation.
 inventory.verifyCredentials();
 inventory.dispose();void invented;
}
void contract;
