/** Discover the revision lane attached to an independently selected suggestion room. */
import {RelayChannel} from '../relay/channel.js';
import {accountToken} from '../relay/registration.js';
import {object, SharedRelayError, string, timeout} from '../relay/validation.js';
import {suggestionDescriptor} from '../suggestions/transport.js';
import type {SharedSuggestionQueueIdentity} from '../suggestions/types.js';
import {queueIdentity} from '../suggestions/validation.js';
import {revisionsBinding, revisionsDescriptor} from './transport.js';
import type {SharedSuggestionRevisionsBinding} from './types.js';

export interface SharedSuggestionRevisionsDiscoveryOptions {
  /** Nonsecret binding obtained from the ordinary writer or observer registration. */
  identity: SharedSuggestionQueueIdentity;
  getToken: (signal: AbortSignal) => string | Promise<string>;
  requestTimeoutMs?: number;
}

/** Read the authenticated lane descriptor without allocating or resuming an actor. */
export async function discoverSharedSuggestionRevisions(
  options: SharedSuggestionRevisionsDiscoveryOptions,
): Promise<SharedSuggestionRevisionsBinding> {
  const identity = queueIdentity(options.identity);
  const milliseconds = timeout(options.requestTimeoutMs);
  const abort = new AbortController();
  let channel: RelayChannel | undefined;
  try {
    const token = await accountToken(options.getToken, abort.signal, milliseconds);
    channel = await RelayChannel.openSuggestions(identity.endpoint, milliseconds, () => {}, () => {}, 'original', abort.signal);
    const capabilities = ['writerTransportV2', 'documentSuggestionsV1', 'documentSuggestionRevisionsV1'];
    const auth = await channel.request({kind: 'authenticate', principal: identity.principal, token, capabilities});
    if (auth['kind'] !== 'authenticated' || JSON.stringify(auth['capabilities']) !== JSON.stringify(capabilities)) {
      throw new SharedRelayError('suggestion_protocol_unavailable');
    }
    suggestionDescriptor(auth['documentSuggestionsDescriptor'], identity);
    const descriptor = object(auth['documentSuggestionRevisionsDescriptor']);
    const binding = revisionsBinding({binding: string(descriptor['binding'], 64)});
    revisionsDescriptor(descriptor, binding.binding, identity);
    return binding;
  } finally {
    abort.abort();
    channel?.close();
  }
}
