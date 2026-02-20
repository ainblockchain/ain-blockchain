/**
 * Base chain integration for the Cogito container.
 * ERC-8021 builder codes attribute content creators on Base transactions.
 *
 * Only active when BASE_RPC_URL and BASE_PRIVATE_KEY are set.
 */

import { ethers } from 'ethers';
import { MatchedEntry } from './types.js';

const ERC_MARKER = '80218021802180218021802180218021';
const SCHEMA_ID = '00';
const COGITO_BUILDER_CODE = 'cogito_node';

function encodeBuilderCodes(codes: string[]): string {
  if (codes.length === 0) throw new Error('At least one builder code is required');

  const codesString = codes.join(',');
  const codesBytes = Buffer.from(codesString, 'ascii');

  if (codesBytes.length > 255) {
    throw new Error(`Builder codes total length ${codesBytes.length} exceeds 255 bytes`);
  }

  const codesLengthHex = codesBytes.length.toString(16).padStart(2, '0');
  const codesHex = codesBytes.toString('hex');

  return codesLengthHex + codesHex + SCHEMA_ID + ERC_MARKER;
}

export class BaseChain {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;

  constructor(rpcUrl: string, privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
  }

  /**
   * Record a Base chain transaction with ERC-8021 builder codes
   * attributing the original content creator.
   */
  async recordAttribution(
    topicPath: string,
    entry: MatchedEntry,
  ): Promise<string | null> {
    try {
      const codes = [COGITO_BUILDER_CODE, `topic_${topicPath.replace(/\//g, '_')}`];

      const topicHex = Buffer.from(`cogito:enrich:${topicPath}`).toString('hex');
      const suffix = encodeBuilderCodes(codes);
      const data = `0x${topicHex}${suffix}`;

      const tx = await this.signer.sendTransaction({
        to: this.signer.address,
        value: 0,
        data,
      });

      console.log(`[Base] Tx recorded: ${tx.hash} (topic: ${topicPath})`);
      return tx.hash;
    } catch (err: any) {
      console.error(`[Base] Failed to record attribution: ${err.message}`);
      return null;
    }
  }

  getAddress(): string {
    return this.signer.address;
  }
}
