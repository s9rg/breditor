
import {captureSelectedServerNativeDependencies,SharedServerLogGenerationRecoveryHost,SharedPhysicalRoomRecoveryHost,SharedServerLogGenerationDeliveryRecoveryHost} from '@breditor/collaboration';
import type {ServerNativeDependencyInventory,SelectedServerNativeDependencies,SharedServerLogGenerationRecoveryControlSelection,SharedPhysicalRecoveryControlSelection} from '@breditor/collaboration';
declare const generation:SharedServerLogGenerationRecoveryHost,physical:SharedPhysicalRoomRecoveryHost,continuation:SharedServerLogGenerationDeliveryRecoveryHost;
const a:Promise<SelectedServerNativeDependencies<SharedServerLogGenerationRecoveryControlSelection>>=captureSelectedServerNativeDependencies(generation);
const b:Promise<SelectedServerNativeDependencies<SharedPhysicalRecoveryControlSelection>>=captureSelectedServerNativeDependencies(physical);
const c:Promise<SelectedServerNativeDependencies<SharedServerLogGenerationRecoveryControlSelection>>=captureSelectedServerNativeDependencies(continuation);void a;void b;void c;
void generation.readNativeDependencies();void physical.readNativeDependencies();void continuation.readNativeDependencies();
void a.then(read=>{
 const native:ServerNativeDependencyInventory=read.native;const scope:'native-causal-and-complete-physical-generation-packets'=native.scope;void scope;
 if(native.outcome.kind==='ready'){for(const pair of native.outcome.references){const asset:string=pair.asset;void asset;}}
 else for(const row of native.outcome.packets){const counter:string=row.missing[0]!.counter;void counter;}
 for(const row of native.sources)if(row.packet.kind==='suggestion_revision'){const child:string=row.packet.suggestionId;void child;}
 // @ts-expect-error Server knowledge is not a serving or activation capability.
 read.activate();
 // @ts-expect-error A readonly Native source record cannot be rewritten into an ACK.
 native.sources.push({});
 // @ts-expect-error This does not assign a client role.
 const role:'writer'=read.clientRole;void role;
 // @ts-expect-error Portable selection data cannot manufacture a genuine host.
 void captureSelectedServerNativeDependencies(read.selection);
});
