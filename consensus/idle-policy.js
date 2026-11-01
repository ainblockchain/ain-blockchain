/**
 * Proposer-side idle block policy.
 *
 * This module only decides whether *this node*, when it is the selected proposer of an epoch,
 * spends that epoch's proposal slot. It never changes how a block is built, validated, voted on
 * or finalized, so validators running older code accept every block a node using this policy
 * produces. An epoch without a proposal is already a normal event (an offline or slow proposer)
 * for which the protocol has no penalty or epoch-gap rule.
 *
 * Finality (see BlockPool.getFinalizableChain) requires a notarized chain ending with three
 * blocks of consecutive epochs; every block but the last one of such a chain is finalized.
 * The policy therefore keeps proposing until the chain is "settled":
 *   - every block except the notarized tip is finalized,
 *   - the tip carries no transactions and no evidence, and
 *   - the tip directly follows the last finalized block in epochs, i.e. it is the block that
 *     completed the three-consecutive-epoch run (so a lone heartbeat block is not "settled"
 *     and the heartbeat always advances the finalized height).
 * A block with transactions is therefore never left unfinalized, and its finality latency is
 * the same as before (two more consecutive epochs). Any doubt (missing chain information, an
 * unhealthy or forked view) makes the chain look unsettled, which falls back to proposing every
 * epoch exactly like the original behavior.
 */

const DEFAULT_IDLE_HEARTBEAT_INTERVAL_MS = 600000;

const IdleProposalReasons = {
  DISABLED: 'disabled',
  UNSETTLED: 'unsettled',
  HEARTBEAT: 'heartbeat',
  PENDING_TXS: 'pending_txs',
  IDLE: 'idle',
};

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  return false;
}

/**
 * Reads the idle policy configuration from node configs (node_params.json / env vars).
 * The heartbeat is clamped to at least one epoch; a non-positive or invalid value falls back to
 * the default so that a typo can never disable the heartbeat.
 */
function getIdleProposalConfig(nodeConfigs, epochMs) {
  const enabled = toBool(nodeConfigs.IDLE_BLOCK_PROPOSAL_SKIP);
  let heartbeatMs = Number(nodeConfigs.IDLE_HEARTBEAT_INTERVAL_MS);
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
    heartbeatMs = DEFAULT_IDLE_HEARTBEAT_INTERVAL_MS;
  }
  if (Number.isFinite(epochMs) && epochMs > 0) {
    heartbeatMs = Math.max(heartbeatMs, epochMs);
  }
  return { enabled, heartbeatMs };
}

function blockHasPayload(block) {
  if (!block) return false;
  const hasTxs = Array.isArray(block.transactions) && block.transactions.length > 0;
  const evidence = block.evidence;
  const hasEvidence = !!evidence && typeof evidence === 'object' && Object.keys(evidence).length > 0;
  return hasTxs || hasEvidence;
}

/**
 * @param {Array|object} unfinalizedChain Notarized blocks after the last finalized block, up to
 *     and including the notarized tip (BlockPool.getExtendingChain(...).chain).
 * @param {object} lastFinalizedBlock The last finalized block.
 * @returns {boolean} whether nothing on the chain still needs more blocks to become final.
 */
function isChainSettled(unfinalizedChain, lastFinalizedBlock) {
  if (!Array.isArray(unfinalizedChain) || !lastFinalizedBlock) return false;
  if (unfinalizedChain.length === 0) return true;  // The tip itself is finalized.
  if (unfinalizedChain.length > 1) return false;  // Something below the tip isn't final yet.
  const tip = unfinalizedChain[0];
  return !blockHasPayload(tip) && tip.last_hash === lastFinalizedBlock.hash &&
      tip.epoch === lastFinalizedBlock.epoch + 1;
}

/**
 * Pre-check before building a proposal.
 * @returns {{ propose: boolean, reason: string }}
 */
function decideIdleProposal({ enabled, heartbeatMs, now, tipTimestamp, settled, hasPendingTxs }) {
  if (!enabled) return { propose: true, reason: IdleProposalReasons.DISABLED };
  if (!settled) return { propose: true, reason: IdleProposalReasons.UNSETTLED };
  if (!Number.isFinite(tipTimestamp) || now - tipTimestamp >= heartbeatMs) {
    return { propose: true, reason: IdleProposalReasons.HEARTBEAT };
  }
  if (hasPendingTxs) return { propose: true, reason: IdleProposalReasons.PENDING_TXS };
  return { propose: false, reason: IdleProposalReasons.IDLE };
}

/**
 * Post-check after building a proposal for the PENDING_TXS reason: the pool may only hold
 * transactions that cannot be included yet (e.g. a future nonce). Such a proposal would be an
 * empty block, so it is dropped while the chain is settled and no heartbeat is due.
 */
function shouldBroadcastProposal(decision, proposalBlock) {
  if (decision.reason !== IdleProposalReasons.PENDING_TXS) return true;
  return blockHasPayload(proposalBlock);
}

/**
 * Consensus health with idle blocks (local status only: net_consensusStatus, /health_check,
 * the epoch-timer watchdog). Without the policy, the last finalized block must be less than
 * health_threshold_epoch epochs old. With the policy that rule would flag every idle period, so:
 *   - a settled chain is healthy while its heartbeat is not overdue (tip younger than
 *     heartbeat + threshold epochs), and
 *   - an unsettled chain is healthy while the oldest block still waiting for finality is younger
 *     than threshold epochs, which is the original rule applied to the blocks that matter.
 * In addition, while the finalized block is older than the threshold, any sign of work that is
 * not progressing makes the node unhealthy once it is older than the threshold (stallAgesMs):
 *   - an includable non-consensus transaction waiting in the pool (e.g. a tx block that never
 *     gets notarized),
 *   - a block seen at or above the notarized tip height that isn't the tip (a vote split or a
 *     block whose votes never arrive),
 *   - zero connected peers (an isolated or solo-restarted node).
 * A stalled chain with a pending transaction is therefore reported as fast as before.
 */
function isConsensusHealthyWithIdle({ currentEpoch, lastFinalizedBlock, unfinalizedChain,
    thresholdEpochs, epochMs, idleConfig, stallAgesMs = {} }) {
  if (!lastFinalizedBlock) return false;
  if (currentEpoch - lastFinalizedBlock.epoch < thresholdEpochs) return true;
  if (!idleConfig || !idleConfig.enabled || !(epochMs > 0) || !Array.isArray(unfinalizedChain)) {
    return false;
  }
  const thresholdMs = thresholdEpochs * epochMs;
  for (const age of Object.values(stallAgesMs)) {
    if (Number.isFinite(age) && age > thresholdMs) return false;
  }
  if (isChainSettled(unfinalizedChain, lastFinalizedBlock)) {
    const tip = unfinalizedChain.length ? unfinalizedChain[0] : lastFinalizedBlock;
    return currentEpoch - tip.epoch < thresholdEpochs + Math.ceil(idleConfig.heartbeatMs / epochMs);
  }
  // The settled tip (if any) does not need finality; the next block is the oldest pending one.
  const first = unfinalizedChain[0];
  const firstIsSettledTip = isChainSettled([first], lastFinalizedBlock);
  const pending = firstIsSettledTip ? unfinalizedChain[1] : first;
  return !!pending && currentEpoch - pending.epoch < thresholdEpochs;
}

module.exports = {
  DEFAULT_IDLE_HEARTBEAT_INTERVAL_MS,
  IdleProposalReasons,
  getIdleProposalConfig,
  blockHasPayload,
  isChainSettled,
  decideIdleProposal,
  shouldBroadcastProposal,
  isConsensusHealthyWithIdle,
};
