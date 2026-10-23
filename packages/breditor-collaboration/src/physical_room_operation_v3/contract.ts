/** Full seven-family functional ownership. Stored pins choose no factory or live
 * authority; every cold open supplies fresh explicit policies. No activation. */
import type {SharedPhysicalRoomOperationParticipant} from '../physical_room_operation/contract.js';
import type {LocalOperationParticipantOptions} from '../independent_local_operation/participant_contract.js';
import type {IndependentOperationParticipantOptions} from '../independent_operation/participant_contract.js';
import type {SharedIndependentDeliveryRecoveryFactory} from '../independent_delivery_recovery/contract.js';
import type {RestoredParticipantOptions} from '../restored_participant/policy.js';
import type {RestoredLocalParticipantOptions} from '../restored_local_operation/participant_contract.js';
import type {FlatLocalParticipantOptions} from '../flat_local_operation/participant_contract.js';
import type {PhysicalRoomCatalogV3,PhysicalCatalogV3Custody} from '../physical_room_catalog_v3/catalog.js';
import type {PhysicalRoomCatalogV3ReadOptions,PhysicalRoomCatalogV3Selection,PhysicalRoomCatalogV3Entry} from '../physical_room_catalog_v3/contract.js';
import type {CompleteOperationParts} from '../complete_operation_cohort/cohort.js';
export type PhysicalOperationV3Family=PhysicalRoomCatalogV3Entry['family'];
/** Per-client authority and signal govern the returned client, independently
 * of the finite coordinator job. Retiring that job must not revoke its clients. */
export type PhysicalOperationV3Participant=(SharedPhysicalRoomOperationParticipant&Readonly<{checkAuthority:()=>void;signal?:AbortSignal}>)
 |Readonly<{id:string;family:'independent-local';options:LocalOperationParticipantOptions}>
 |Readonly<{id:string;family:'independent-delivery';options:IndependentOperationParticipantOptions;stagingSession:SharedIndependentDeliveryRecoveryFactory&Readonly<{readOnly:true;review:SharedIndependentDeliveryRecoveryFactory['review']&Readonly<{access:'read_only'}>}>}>
 |Readonly<{id:string;family:'restored-graph';options:RestoredParticipantOptions&Readonly<{kind:'lineage-v2'}>}>
 |Readonly<{id:string;family:'local-operation-snapshot';options:RestoredLocalParticipantOptions}>
 |Readonly<{id:string;family:'local-operation-flat';options:FlatLocalParticipantOptions}>;
/** Root authority/signal govern catalog recovery and the final whole-cohort
 * handoff, not a substitute for any participant's selected lifetime policy. */
export interface PhysicalOperationV3OpenOptions extends PhysicalRoomCatalogV3ReadOptions{readonly database:string;readonly expected:PhysicalRoomCatalogV3Selection;readonly participants:readonly PhysicalOperationV3Participant[]}
export interface PhysicalOperationV3BeginOptions extends PhysicalOperationV3OpenOptions{readonly catalog:PhysicalRoomCatalogV3}
export interface PhysicalOperationV3ResumeOptions extends PhysicalOperationV3OpenOptions{readonly catalogDatabase:string}
export type PhysicalOperationV3Parts=CompleteOperationParts;
export type PhysicalOperationV3CatalogCustody=PhysicalCatalogV3Custody;
export type PhysicalOperationV3Role='operation'|'recovery'|'document'|'source'|'uploads'|'versions'|'suggestions'|'revisions'|'journal'|'recovery-source';
export interface PhysicalOperationV3Namespace{readonly role:PhysicalOperationV3Role;readonly database:string}
/** Exact names only. Factories, account grants and executable hooks never persist. */
export interface PhysicalOperationV3Target{readonly id:string;readonly family:PhysicalOperationV3Family;readonly namespaces:readonly PhysicalOperationV3Namespace[]}
export interface PhysicalOperationV3Progress{readonly phase:'prepared'|'operational';readonly participants:readonly Readonly<PhysicalOperationV3Target&{state:'reserved'|'started'|'complete'}>[];readonly unreconciledParticipants:readonly string[]}
