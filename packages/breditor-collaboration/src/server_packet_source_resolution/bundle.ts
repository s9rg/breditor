/** The separate scope retains the literal old envelope, including Pending,
 * and adds hash-selected source knowledge and its independently checked assets. */
import {fields} from '../physical_room_record_cut/policy.js';
import {detachServerPacketRecoveryBundle,detachServerPacketAssetOutcome} from '../server_packet_recovery/inspection_bundle.js';
import {sourceResolutionFile} from './file.js';
import type {ResolvedServerPacketRecoveryBundle} from './contract.js';
import {fail} from '../metadata_packet_retention/policy.js';
export function detachResolvedServerPacketRecoveryBundle(input:unknown):ResolvedServerPacketRecoveryBundle{
 const r=fields(input,['format','formatVersion','scope','original','resolution','assets']);if(r['format']!=='breditor/selected-local-resolved-server-packet-recovery-bundle'||r['formatVersion']!==1||r['scope']!=='literal-original-recovery-plus-verified-native-source-and-raster-resolution')throw fail();return Object.freeze({format:r['format'],formatVersion:1,scope:r['scope'],original:detachServerPacketRecoveryBundle(r['original']),resolution:sourceResolutionFile(r['resolution']),assets:detachServerPacketAssetOutcome(r['assets'])});
}
