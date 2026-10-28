/** Original physical-family selection and report. Common borrowing retains
 * its established timing, cleanup and source/queue verification semantics. */
import {physicalRecoveryHostPort,type SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import type {PhysicalOperationV3Custody} from './operation.js';
import type {PhysicalOperationV3HistoryReadOptions} from './history_read_contract.js';
import type {PhysicalOperationV3HistoryAssetsRead} from './history_assets_contract.js';
import {projectHistoryProviderAssets} from './history_provider_projection.js';
import {physicalOperationV3Failure as fail} from './policy.js';
export function readPhysicalOperationV3HistoryAssets<P extends SharedSelectionPolicy>(s:PhysicalOperationV3Custody,held:()=>void,cleanup:RecoveryCleanupScope,host:SharedPhysicalRoomRecoveryHost,input:PhysicalOperationV3HistoryReadOptions<P>):Promise<PhysicalOperationV3HistoryAssetsRead>{
 const port=physicalRecoveryHostPort(host),selected=port.selection.source,expected=s.held.state.metadata;
 if(JSON.stringify(selected.ancestor)!==JSON.stringify(expected.origin.identity)||JSON.stringify(selected.server)!==JSON.stringify(expected.current.server.identity)||JSON.stringify(selected.participants)!==JSON.stringify(expected.current.participants.identity))throw fail('physical_operation_v3_diverged');
 return projectHistoryProviderAssets(s,held,cleanup,port,input,(history,pins,provider)=>frozen(structuredClone({format:'breditor/physical-operation-v3-assets-read' as const,formatVersion:1 as const,scope:'held-protected-history-and-whole-upload-provider-bytes' as const,kind:history.history.kind==='ready'&&!history.unreconciledParticipants.length&&provider!==null&&!provider.missing.length?'checked' as const:'pending' as const,control:port.selection,history,uploads:pins,provider})));
}
