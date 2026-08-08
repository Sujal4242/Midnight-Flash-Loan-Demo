/**
 * In-memory {@link PrivateStateProvider} for the browser.
 *
 * The contract instance object already carries the private state (secretKey,
 * currentArb) between calls in a single page session, so this provider is only
 * a persistence shim for the `findDeployedContract`/`createContract` plumbing.
 *
 * NOTE: private witness data (the arbitrage trade) is NOT stored here — it is
 * passed per-call through the `getTrade` witness. Nothing secret ever touches
 * the disk or localStorage.
 */

import type {
  PrivateStateId,
  PrivateStateProvider,
  PrivateStateExport,
  SigningKeyExport,
  ImportPrivateStatesResult,
  ImportSigningKeysResult,
} from '@midnight-ntwrk/midnight-js-types';

export const FLASH_LOAN_PRIVATE_STATE_ID = 'flashLoanPrivateState';

export class InMemoryPrivateStateProvider<TState = unknown>
  implements PrivateStateProvider<PrivateStateId, TState>
{
  private contractAddress = '';
  private readonly state = new Map<PrivateStateId, TState>();
  private readonly signingKeys = new Map<string, string>();

  setContractAddress(address: string): void {
    this.contractAddress = address;
  }

  async set(privateStateId: PrivateStateId, state: TState): Promise<void> {
    this.assertScoped();
    this.state.set(privateStateId, state);
  }

  async get(privateStateId: PrivateStateId): Promise<TState | null> {
    this.assertScoped();
    return this.state.get(privateStateId) ?? null;
  }

  async remove(privateStateId: PrivateStateId): Promise<void> {
    this.assertScoped();
    this.state.delete(privateStateId);
  }

  async clear(): Promise<void> {
    this.state.clear();
  }

  async setSigningKey(address: string, signingKey: string): Promise<void> {
    this.signingKeys.set(address, signingKey);
  }

  async getSigningKey(address: string): Promise<string | null> {
    return this.signingKeys.get(address) ?? null;
  }

  async removeSigningKey(address: string): Promise<void> {
    this.signingKeys.delete(address);
  }

  async clearSigningKeys(): Promise<void> {
    this.signingKeys.clear();
  }

  // The export/import surface is required by the PrivateStateProvider interface
  // but unused by this DApp. Implementations are honest in-memory stubs.
  async exportPrivateStates(): Promise<PrivateStateExport> {
    return { format: 'midnight-private-state-export', encryptedPayload: '', salt: '' };
  }

  async importPrivateStates(): Promise<ImportPrivateStatesResult> {
    return { imported: 0, skipped: 0, overwritten: 0 };
  }

  async exportSigningKeys(): Promise<SigningKeyExport> {
    return { format: 'midnight-signing-key-export', encryptedPayload: '', salt: '' };
  }

  async importSigningKeys(): Promise<ImportSigningKeysResult> {
    return { imported: 0, skipped: 0, overwritten: 0 };
  }

  private assertScoped(): void {
    if (!this.contractAddress) {
      throw new Error('setContractAddress must be called before using private state operations');
    }
  }
}
