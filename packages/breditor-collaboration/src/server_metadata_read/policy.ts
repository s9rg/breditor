/** Transport metadata validation only; native packet/source admission stays in Rust. */
import {archiveFields} from '../archive_integrity/policy.js';
import {decimal} from '../relay/validation.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {OriginalMetadataCursor,OriginalMetadataLaneQuery,OriginalMetadataQuery} from './contract.js';
export class ServerMetadataReadError extends Error {constructor(readonly code:'metadata_read_policy'|'metadata_read_protocol'|'metadata_read_budget'|'metadata_read_busy'){super(code);this.name='ServerMetadataReadError';}}
export const fail=(code:'metadata_read_policy'|'metadata_read_protocol'|'metadata_read_budget'|'metadata_read_busy'='metadata_read_protocol')=>new ServerMetadataReadError(code);
/** Read own DATA descriptors only, before any authority callback, hashing or I/O. */
function data(input:unknown,fields:string):Record<string,unknown>{const object=archiveFields(input,fields),result:Record<string,unknown>={};for(const key of fields.split(',')){const descriptor=Object.getOwnPropertyDescriptor(object,key);if(!descriptor||!('value'in descriptor))throw fail('metadata_read_policy');result[key]=descriptor.value;}return result;}
export function metadataBinding(input:unknown):string{if(typeof input!=='string'||!/^[a-f0-9]{64}$/.test(input))throw fail();return input;}
export function metadataCursor(input:unknown):OriginalMetadataCursor{const r=data(input,'binding,after,through'),binding=metadataBinding(r['binding']),after=decimal(r['after']),through=decimal(r['through']);if(BigInt(after)>BigInt(through))throw fail();return{binding,after,through};}
function lane(input:unknown):OriginalMetadataLaneQuery{const descriptor=Object.getOwnPropertyDescriptor(input??{},'kind');if(!descriptor||!('value'in descriptor))throw fail();const kind=descriptor.value;if(kind==='disabled'||kind==='start'){data(input,'kind');return{kind};}if(kind!=='after')throw fail();const r=data(input,'kind,cursor');return{kind,cursor:metadataCursor(r['cursor'])};}
export function metadataQuery(input:unknown):OriginalMetadataQuery{try{const r=data(input,'versions,suggestions,revisions');return frozen({versions:lane(r['versions']),suggestions:lane(r['suggestions']),revisions:lane(r['revisions'])});}catch{throw fail('metadata_read_policy');}}
