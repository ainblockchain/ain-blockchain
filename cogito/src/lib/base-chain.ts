/**
 * Base chain integration for the Cogito container.
 * ERC-8021 builder codes attribute content creators on Base transactions.
 *
 * Only active when BASE_RPC_URL and BASE_PRIVATE_KEY are set.
 */

import { ethers } from 'ethers';
import { config, AGENT_ID, ERC_8004_REGISTRY, ERC_8004_REGISTRY_ADDRESS } from './config';

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

// ERC-8004 Identity Registry ABI (read + write)
const ERC_8004_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)',
  'function setAgentURI(uint256 agentId, string newURI)',
  'function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)',
];

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
  ): Promise<string | null> {
    try {
      const codes = [COGITO_BUILDER_CODE, `topic_${topicPath.replace(/\//g, '_')}`];

      const topicHex = Buffer.from(`cogito:publication:${topicPath}`).toString('hex');
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

  /**
   * Ensure on-chain ERC-8004 registration is up to date.
   * Sets tokenURI (data: URI with registration JSON) and metadata (name, description).
   */
  async ensureRegistration(): Promise<void> {
    const registry = new ethers.Contract(ERC_8004_REGISTRY_ADDRESS, ERC_8004_ABI, this.signer);

    const registrationJson = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: 'Cogito Node',
      description: 'Autonomous knowledge agent that reads research papers, builds a global knowledge graph on AIN blockchain, and earns USDC via x402 micropayments on Base',
      services: [
        {
          name: 'A2A',
          endpoint: `${config.agentBaseUrl}/.well-known/agent.json`,
          version: '0.3',
        },
        {
          name: 'x402',
          endpoint: `${config.agentBaseUrl}/content`,
          version: '1.0.0',
        },
        {
          name: 'MCP',
          endpoint: `${config.mcpServerUrl}/api/mcp`,
          version: '2025-03-26',
        },
      ],
      x402Support: true,
      active: true,
      registrations: [
        {
          agentId: AGENT_ID,
          agentRegistry: ERC_8004_REGISTRY,
        },
      ],
      supportedTrust: ['reputation'],
    };

    const dataUri = `data:application/json;base64,${Buffer.from(JSON.stringify(registrationJson)).toString('base64')}`;

    // Set tokenURI if different
    try {
      const currentUri = await registry.tokenURI(AGENT_ID);
      if (currentUri !== dataUri) {
        const tx = await registry.setAgentURI(AGENT_ID, dataUri);
        await tx.wait();
        console.log(`[Base] setAgentURI(${AGENT_ID}) tx: ${tx.hash}`);
      } else {
        console.log('[Base] tokenURI already up to date');
      }
    } catch (err: any) {
      console.error(`[Base] setAgentURI failed: ${err.message}`);
    }

    // Set metadata: name
    try {
      const currentName = await registry.getMetadata(AGENT_ID, 'name');
      if (!currentName || currentName === '0x') {
        const tx = await registry.setMetadata(AGENT_ID, 'name', ethers.toUtf8Bytes('Cogito Node'));
        await tx.wait();
        console.log(`[Base] setMetadata(name) tx: ${tx.hash}`);
      } else {
        console.log('[Base] metadata "name" already set');
      }
    } catch (err: any) {
      console.error(`[Base] setMetadata(name) failed: ${err.message}`);
    }

    // Set metadata: description
    try {
      const currentDesc = await registry.getMetadata(AGENT_ID, 'description');
      if (!currentDesc || currentDesc === '0x') {
        const tx = await registry.setMetadata(
          AGENT_ID,
          'description',
          ethers.toUtf8Bytes('Autonomous knowledge agent that reads research papers, builds a global knowledge graph on AIN blockchain, and earns USDC via x402 micropayments on Base'),
        );
        await tx.wait();
        console.log(`[Base] setMetadata(description) tx: ${tx.hash}`);
      } else {
        console.log('[Base] metadata "description" already set');
      }
    } catch (err: any) {
      console.error(`[Base] setMetadata(description) failed: ${err.message}`);
    }
  }

  getAddress(): string {
    return this.signer.address;
  }
}
