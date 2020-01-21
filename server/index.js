const url = require('url');
const Websocket = require('ws');
const sleep = require('sleep');
const P2P_PORT = process.env.P2P_PORT || 5001;
const ip = require('ip');
const publicIp = require('public-ip');
const TRACKER_WS_ADDR = process.env.TRACKER_IP || 'ws://localhost:3001';
const axios = require('axios');
const semver = require('semver');
const disk = require('diskusage');
const os = require('os');
const ainUtil = require('@ainblockchain/ain-util');
const {MessageTypes, VotingStatus, VotingActionTypes, STAKE, PredefinedDbPaths}
    = require('../constants');
const {Block} = require('../blockchain/block');
const Transaction = require('../tx-pool/transaction');
const VotingUtil = require('./voting-util');
const { WriteDbOperations, DEBUG } = require('../constants');
// HOSTING_ENV is a variable used in extracting the ip address of the host machine,
// of which value could be either 'local', 'default', or 'gcp'.
const HOSTING_ENV = process.env.HOSTING_ENV || 'default';
const GCP_EXTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip';
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;
const BLOCK_CREATION_INTERVAL_MS = 6000;
const RECONNECT_INTERVAL_MS = 10000;
const UPDATE_TO_TRACKER_INTERVAL_MS = 10000;
const DISK_USAGE_PATH = os.platform() === 'win32' ? 'c:' : '/';

// A util function for testing/debugging.
function setTimer(ws, timeSec) {
  setTimeout(() => {
    ws.close();
  }, timeSec * 1000);
}

// A peer-to-peer network server that broadcasts changes in the database.
// TODO(seo): Sign messages to tracker or peer.
class P2pServer {
  constructor(node, minProtocolVersion, maxProtocolVersion) {
    this.isStarting = true;
    this.ipAddress = null;
    this.trackerWebSocket = null;
    this.interval = null;
    this.node = node;
    this.managedPeersInfo = {}
    this.sockets = [];
    this.votingUtil = new VotingUtil(node);
    this.votingInterval = null;
    this.waitInBlocks = 4;
    this.minProtocolVersion = minProtocolVersion;
    this.maxProtocolVersion = maxProtocolVersion;
  }

  listen() {
    const server = new Websocket.Server({port: P2P_PORT});
    server.on('connection', (socket) => this.setSocket(socket, null));
    console.log(`Listening for peer-to-peer connections on: ${P2P_PORT}\n`);
    this.setIntervalForTrackerConnection();
  }

  setIntervalForTrackerConnection() {
    this.connectToTracker();
    this.intervalConnection = setInterval(() => {
      this.connectToTracker();
    }, RECONNECT_INTERVAL_MS)
  }

  clearIntervalForTrackerConnection() {
    clearInterval(this.intervalConnection)
    this.intervalConnection = null;
  }

  setIntervalForTrackerUpdate() {
    this.updateStatusToTracker();
    this.intervalUpdate = setInterval(() => {
      this.updateStatusToTracker();
    }, UPDATE_TO_TRACKER_INTERVAL_MS)
  }

  clearIntervalForTrackerUpdate() {
    clearInterval(this.intervalUpdate)
    this.intervalUpdate = null;
  }

  connectToTracker() {
    console.log(`[TRACKER] Reconnecting to tracker (${TRACKER_WS_ADDR})`);
    this.getIpAddress()
    .then(() => {
      this.trackerWebSocket = new Websocket(TRACKER_WS_ADDR);
      this.trackerWebSocket.on('open', () => {
        console.log(`[TRACKER] Connected to tracker (${TRACKER_WS_ADDR})`);
        this.clearIntervalForTrackerConnection();
        this.setTrackerEventHandlers();
        this.setIntervalForTrackerUpdate();
      });
      this.trackerWebSocket.on('error', (error) => {
        console.log(`[TRACKER] Error in communication with tracker (${TRACKER_WS_ADDR}): ` +
            `${JSON.stringify(error, null, 2)}`)
      });
    });
  }

  getIpAddress() {
    return Promise.resolve()
    .then(() => {
      if (HOSTING_ENV === 'gcp') {
        return axios.get(GCP_EXTERNAL_IP_URL, {
          headers: {'Metadata-Flavor': 'Google'},
          timeout: 3000
        })
        .then((res) => {
          return res.data;
        })
        .catch((err) => {
          console.log(`Failed to get ip address: ${JSON.stringify(err, null, 2)}`);
          process.exit(0);
        });
      } else if (HOSTING_ENV === 'local') {
        return ip.address();
      } else {
        return publicIp.v4();
      }
    })
    .then((ipAddr) => {
      this.ipAddress = ipAddr;
      return ipAddr;
    });
  }

  async setTrackerEventHandlers() {
    this.trackerWebSocket.on('message', (message) => {
      try {
        const parsedMsg = JSON.parse(message);
        console.log(`\n[TRACKER] << Message from tracker: ` +
            `${JSON.stringify(parsedMsg, null, 2)}`)
        if (this.connectToPeers(parsedMsg.newManagedPeerInfoList)) {
          console.log(`[TRACKER] Updated managed peers info: ` +
              `${JSON.stringify(this.managedPeersInfo, null, 2)}`);
        }
        if (this.isStarting) {
          this.isStarting = false;
          if (parsedMsg.numLivePeers === 0) {
            this.node.init(true);
            this.node.bc.syncedAfterStartup = true;
            this.initiateChain();
          } else {
            this.node.init(false);
          }
        }
      } catch (error) {
        console.log(error.stack);
      }
    });

    this.trackerWebSocket.on('close', (code) => {
      console.log(`\n[TRACKER] Disconnected from tracker ${TRACKER_WS_ADDR} with code: ${code}`);
      this.clearIntervalForTrackerUpdate();
      this.setIntervalForTrackerConnection();
    });
  }

  updateStatusToTracker() {
    const updateToTracker = {
      url: url.format({
        protocol: 'ws',
        hostname: this.ipAddress,
        port: P2P_PORT
      }),
      ip: this.ipAddress,
      address: this.node.account.address,
      timestamp: Date.now(),
      lastBlockNumber: this.node.bc.lastBlockNumber(),
      managedPeersInfo: this.managedPeersInfo,
    };
    const diskUsage = this.getDiskuage();
    if (diskUsage !== null) {
      updateToTracker.diskUsage = diskUsage;
    }
    console.log(`\n[TRACKER] >> Update to tracker ${TRACKER_WS_ADDR}: ` +
        `${JSON.stringify(updateToTracker, null, 2)}`)
    this.trackerWebSocket.send(JSON.stringify(updateToTracker));
  }

  getDiskuage() {
    try {
      return disk.checkSync(DISK_USAGE_PATH);
    }
    catch (err) {
      console.log(err);
      return null;
    }
  }

  connectToPeers(newManagedPeerInfoList) {
    let updated = false;
    newManagedPeerInfoList.forEach((peerInfo) => {
      if (this.managedPeersInfo[peerInfo.address]) {
        console.log(`[PEER] Node ${peerInfo.address} is already a managed peer. ` +
            `Something is wrong.`)
      } else {
        console.log(`[PEER] Connecting to peer ${JSON.stringify(peerInfo, null, 2)}`);
        this.managedPeersInfo[peerInfo.address] = peerInfo;
        updated = true;
        const socket = new Websocket(peerInfo.url);
        socket.on('open', () => {
          console.log(`[PEER] Connected to peer ${peerInfo.address} (${peerInfo.url}).`)
          this.setSocket(socket, peerInfo.address);
        });
      }
    });
    return updated;
  }

  setSocket(socket, address) {
    this.sockets.push(socket);
    this.setPeerEventHandlers(socket, address);
    this.requestChainSubsection(this.node.bc.lastBlock());
  }

  setPeerEventHandlers(socket, address) {
    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        const version = data.protoVer;
        if (!version || !semver.valid(version)) {
          return;
        }
        if (semver.gt(this.minProtocolVersion, version) ||
            (this.maxProtocolVersion && semver.lt(this.maxProtocolVersion, version))) {
          return;
        }

        switch (data.type) {
          case MessageTypes.VOTING:
            if (DEBUG) {
              console.log(`RECEIVING: ${JSON.stringify(data.votingAction.transaction)}`);
            }
            this.executeVotingAction(data.votingAction);
            break;
          case MessageTypes.TRANSACTION:
            if (DEBUG) {
              console.log(`RECEIVING: ${JSON.stringify(data.transaction)}`);
            }
            this.executeAndBroadcastTransaction(data.transaction);
            break;
          case MessageTypes.CHAIN_SUBSECTION:
            // Check if chain subsection is valid and can be
            // merged ontop of your local blockchain
            if (this.node.bc.merge(data.chainSubsection)) {
              if (data.number === this.node.bc.lastBlockNumber()) {
                // If peer is new to network and has successfully reached the consensus blockchain
                // height, wait the duration of one more voting round before processing
                // transactions.
                if (!this.node.bc.syncedAfterStartup) {
                  setTimeout(() => {
                    try {
                      this.node.reconstruct();
                      this.node.bc.syncedAfterStartup = true;
                    } catch (error) {
                      console.log(`Error in starting:${error.stack}`);
                    }
                  }, BLOCK_CREATION_INTERVAL_MS);
                }
              }
              for (let i=0; i<data.chainSubsection.length; i++) {
                this.node.tp.removeCommitedTransactions(data.chainSubsection[i]);
              }
              this.node.reconstruct();
              // Continuously request the blockchain in subsections until
              // your local blockchain matches the height of the consensus blockchain.
              this.requestChainSubsection(this.node.bc.lastBlock());
            }
            break;
          case MessageTypes.CHAIN_SUBSECTION_REQUEST:
            if (this.node.bc.chain.length === 0) {
              return;
            }
            // Send a chunk of 20 blocks from  your blockchain to the requester.
            // Requester will continue to request blockchain chunks
            // until their blockchain height matches the consensus blockchain height
            const chainSubsection = this.node.bc.requestBlockchainSection(
                data.lastBlock ? Block.parse(data.lastBlock) : null);
            if (chainSubsection) {
              this.sendChainSubsection(
                  socket, chainSubsection, this.node.bc.lastBlockNumber());
            }
            break;
        }
      } catch (error) {
        console.log(error.stack);
      }
    });

    socket.on('close', () => {
      console.log(`\n[PEER] Disconnected from a peer: ${address || 'unknown'}`);
      this.removeFromListIfExists(socket);
      if (address && this.managedPeersInfo[address]) {
        delete this.managedPeersInfo[address];
        console.log(`[PEER] => Updated managed peers info: ` +
            `${JSON.stringify(this.managedPeersInfo, null, 2)}`);
      }
    });

    socket.on('error', (error) => {
      console.log(`[PEER] Error in communication with peer ${address}: ` +
          `${JSON.stringify(error, null, 2)}`);
    });
  }

  removeFromListIfExists(entry) {
    const index = this.sockets.indexOf(entry);
    if (index >= 0) {
      this.sockets.splice(index, 1);
      return true;
    }
    return false;
  }

  sendChainSubsection(socket, chainSubsection, number) {
    socket.send(JSON.stringify({
        type: MessageTypes.CHAIN_SUBSECTION,
        chainSubsection,
        number,
        protoVer: CURRENT_PROTOCOL_VERSION
      }));
  }

  requestChainSubsection(lastBlock) {
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({
          type: MessageTypes.CHAIN_SUBSECTION_REQUEST,
          lastBlock,
          protoVer: CURRENT_PROTOCOL_VERSION
        }));
    });
  }

  broadcastChainSubsection(chainSubsection) {
    this.sockets.forEach((socket) => this.sendChainSubsection(socket, chainSubsection));
  }

  broadcastTransaction(transaction) {
    if (DEBUG) {
      console.log(`SENDING: ${JSON.stringify(transaction)}`);
    }
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({
          type: MessageTypes.TRANSACTION,
          transaction,
          protoVer: CURRENT_PROTOCOL_VERSION
        }));
    });
  }

  broadcastBlock(blockHashTransaction) {
    if (DEBUG) {
      console.log(`SENDING: ${JSON.stringify(blockHashTransaction)}`);
    }
    console.log(`Broadcasting new block ${this.votingUtil.block}`);
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({
        type: MessageTypes.VOTING,
        votingAction: {
          actionType: VotingActionTypes.PROPOSED_BLOCK,
          block: this.votingUtil.block,
          transaction: blockHashTransaction
        },
        protoVer: CURRENT_PROTOCOL_VERSION
      }));
    });
  }

  broadcastVotingAction(votingAction) {
    if (DEBUG) {
      console.log(`SENDING: ${JSON.stringify(votingAction.transaction)}`);
    }
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({
          type: MessageTypes.VOTING,
          votingAction,
          protoVer: CURRENT_PROTOCOL_VERSION
        }));
    });
  }

  /**
   * Adds transaction to the transactionPool and executes the operations specified
   * in the transaction.
   * @param {Object} transactionWithSig An object with a signature and a transaction.
   */
  // TODO(seo): Remove new Transaction() use cases.
  executeTransaction(transactionWithSig) {
    if (!transactionWithSig) return null;
    const transaction = transactionWithSig instanceof Transaction ?
        transactionWithSig : new Transaction(transactionWithSig);
    if (DEBUG) {
      console.log(`EXECUTING: ${JSON.stringify(transaction)}`);
    }
    if (this.node.tp.isNotEligibleTransaction(transaction)) {
      if (DEBUG) {
        console.log(`ALREADY RECEIVED: ${JSON.stringify(transaction)}`);
      }
      console.log('Transaction already received');
      return null;
    }
    if (this.node.bc.syncedAfterStartup === false) {
      if (DEBUG) {
        console.log(`NOT SYNCED YET. WILL ADD TX TO THE POOL: ${JSON.stringify(transaction)}`)
      }
      this.node.tp.addTransaction(transaction);
      return null;
    }
    const result = this.node.db.executeTransaction(transaction);
    if (!this.checkForTransactionResultErrorCode(result)) {
      // Add transaction to pool
      this.node.tp.addTransaction(transaction);
    } else if (DEBUG) {
      console.log(
          `FAILED TRANSACTION: ${JSON.stringify(transaction)}\t RESULT:${JSON.stringify(result)}`);
    }
    return result;
  }

  checkForTransactionResultErrorCode(response) {
    return response === null || (response.code !== undefined && response.code !== 0);
  }

  executeAndBroadcastTransaction(transactionWithSig) {
    if (!transactionWithSig) return null;
    if (Transaction.isBatchTransaction(transactionWithSig)) {
      const resultList = [];
      const txListSucceeded = [];
      transactionWithSig.tx_list.forEach((tx) => {
        const transaction = tx instanceof Transaction ? tx : new Transaction(tx);
        const response = this.executeTransaction(transaction);
        resultList.push(response);
        if (!this.checkForTransactionResultErrorCode(response)) {
          txListSucceeded.push(tx);
        }
      })
      if (txListSucceeded.length > 0) {
        this.broadcastTransaction({ tx_list: txListSucceeded });
      }
      return resultList;
    } else {
      const transaction = transactionWithSig instanceof Transaction ?
          transactionWithSig : new Transaction(transactionWithSig);
      const response = this.executeTransaction(transaction);
      if (!this.checkForTransactionResultErrorCode(response)) {
        this.broadcastTransaction(transaction);
      }
      return response;
    }
  }

  executeAndBroadcastVotingAction(votingAction) {
    if (DEBUG) {
      console.log(
          `RECEIVED VOTING ACTION ${votingAction.actionType} ` +
          `FROM USER ${votingAction.transaction.address}`)
    }
    const response = this.executeTransaction(votingAction.transaction);
    if (!this.checkForTransactionResultErrorCode(response)) {
      if ([VotingActionTypes.PRE_VOTE, VotingActionTypes.PRE_COMMIT].indexOf(
          votingAction.actionType) > -1) {
        this.votingUtil.registerVote(votingAction.transaction);
      }
      this.broadcastVotingAction(votingAction);
    }
    if (DEBUG) {
      if(this.checkForTransactionResultErrorCode(response)) {
          console.log(`PREVIOUSLY EXECUTED VOTING ACTION ${votingAction.actionType} ` +
              `FROM USER ${votingAction.transaction.address}`)
      } else {
          console.log(`NEW VOTING ACTION ${votingAction.actionType} ` +
              `FROM USER ${votingAction.transaction.address} ` +
              `WITH TRANSACTION INFO ${JSON.stringify(votingAction.transaction)}`)
      }
    }
    return response;
  }

  executeVotingAction(votingAction) {
    const response = this.executeAndBroadcastVotingAction(votingAction);
    if (this.checkForTransactionResultErrorCode(response)) {
      return;
    }
    switch (votingAction.actionType) {
      case VotingActionTypes.NEW_VOTING:
        if (!this.votingUtil.isSyncedWithNetwork(this.node.bc)) {
          this.requestChainSubsection(this.node.bc.lastBlock());
        }
        if (this.votingUtil.getStakes(this.node.account.address) &&
            this.node.bc.syncedAfterStartup) {
          this.executeAndBroadcastTransaction(
              this.votingUtil.registerForNextRound(this.node.bc.lastBlockNumber() + 1));
        }
        if (this.votingUtil.isProposer()) {
          this.createAndProposeBlock();
        }
        break;
      case VotingActionTypes.PROPOSED_BLOCK:
        let invalidTransactions = false;
        const proposedBlock = Block.parse(votingAction.block);
        for (let i = 0; i < proposedBlock.transactions.length; i++) {
          // First check if the transation has already been received.
          // Next check that the received transaction is valid.
          if (!this.node.tp.isNotEligibleTransaction(proposedBlock.transactions[i])
            && this.checkForTransactionResultErrorCode(
                this.executeTransaction(proposedBlock.transactions[i]))) {
            if (DEBUG) {
              console.log(
                `BLOCK ${proposedBlock.hash} ` +
                `has invalid transaction ${proposedBlock.transactions[i]}`)
            }
            invalidTransactions = true;
            break
          }
        }
        if (invalidTransactions ||
            !Block.validateProposedBlock(proposedBlock, this.node.bc) ||
            proposedBlock.hash === this.votingUtil.block ||
            [VotingStatus.WAIT_FOR_BLOCK, VotingStatus.SYNCING].indexOf(
                this.votingUtil.status) < 0) {
              if(DEBUG) {
                console.log(`REJECTING BLOCK ${proposedBlock}`)
              }
          break;
        }
        this.votingUtil.setBlock(proposedBlock, votingAction.transaction);
        if(DEBUG) {
          console.log(`ACCEPTING BLOCK ${proposedBlock}`)
        }
        if (this.votingUtil.isValidator()) {
          // TODO (lia): check for results?
          const preVote = this.votingUtil.preVote();
          if (preVote) {
            this.executeAndBroadcastVotingAction({
              transaction: preVote,
              actionType: VotingActionTypes.PRE_VOTE
            });
          } else if (this.votingUtil.needRestaking()) {
            this.executeAndBroadcastTransaction(
                this.renewStakes());
          }
        }
      case VotingActionTypes.PRE_VOTE:
        // TODO (lia): also verify the pre-vote transaction
        if (!this.votingUtil.checkPreVotes()) {
          break;
        }
        const preCommitTransaction = this.votingUtil.preCommit();
        if (preCommitTransaction !== null) {
          // TODO (lia): check for results?
          this.executeAndBroadcastVotingAction({
            transaction: preCommitTransaction,
            actionType: VotingActionTypes.PRE_COMMIT
          });
        } else if (this.votingUtil.needRestaking()) {
          this.executeAndBroadcastTransaction(
              this.renewStakes());
        }
      case VotingActionTypes.PRE_COMMIT:
        if (this.votingUtil.isCommit()) {
          this.addBlockToChain();
          this.cleanupAfterVotingRound();
        }
        break;
    }
  }

  createAndProposeBlock() {
    const transactions = this.node.tp.getValidTransactions();
    const blockNumber = this.node.bc.lastBlockNumber() + 1;
    const validators = this.node.db.getValue(PredefinedDbPaths.VOTING_ROUND_VALIDATORS);
    const newBlock = Block.createBlock(this.node.bc.lastBlock().hash,
        this.votingUtil.lastVotes, transactions, blockNumber, this.node.account.address,
        validators);
    const ref = PredefinedDbPaths.VOTING_ROUND_BLOCK_HASH;
    const value = newBlock.hash;
    console.log(`Proposing block with hash ${newBlock.hash} and number ${blockNumber}`);
    const blockHashTransaction = this.node.createTransaction({
        operation: {
          type: WriteDbOperations.SET_VALUE,
          ref, value
        }
      });
    this.votingUtil.setBlock(newBlock, blockHashTransaction);
    this.executeTransaction(blockHashTransaction);
    this.broadcastBlock(blockHashTransaction);
    if (!validators || !Object.keys(validators).length ||
    (Object.keys(validators).length === 1 && validators[this.node.account.address])) {
      console.log('No other validators registered for this round');
      this.addBlockToChain();
      this.cleanupAfterVotingRound();
    }
  }

  initiateChain() {
    this.votingUtil.status = VotingStatus.WAIT_FOR_BLOCK;
    const prevDeposit = this.votingUtil.getStakes();
    console.log("previous Deposit = " + prevDeposit)
    if (!prevDeposit) {
      this.depositStakes();
    }
    let initChainTx = this.votingUtil.instantiate(this.node.bc);
    if (!initChainTx) {
      throw Error(`Deposit by the initiating node was unsuccessful`);
    }
    // This code doesn't work if the first node with existing
    // blockchain data was not a validator (is not in the recent_proposers).
    let initResult = this.executeAndBroadcastTransaction(initChainTx);
    while (this.checkForTransactionResultErrorCode(initResult)) {
      sleep.sleep(1);
      initChainTx = this.votingUtil.instantiate(this.node.bc);
      initResult = this.executeAndBroadcastTransaction(initChainTx);
    }
    this.executeAndBroadcastTransaction(
      this.votingUtil.registerForNextRound(this.node.bc.lastBlockNumber() + 1));
    this.createAndProposeBlock();
  }

  addBlockToChain() {
    if (this.node.bc.addNewBlock(this.votingUtil.block)) {
      this.node.tp.removeCommitedTransactions(this.votingUtil.block);
      this.votingUtil.reset();
      this.node.reconstruct();
      if (this.waitInBlocks > 0 && !this.votingUtil.getStakes(this.node.account.address)) {
        this.waitInBlocks = this.waitInBlocks - 1;
        if (this.waitInBlocks === 0) {
          this.depositStakes();
        }
      }
    }
  }

  cleanupAfterVotingRound() {
    if (this.votingInterval) {
      console.log('Clearing interval after successful voting round');
      clearInterval(this.votingInterval);
      this.votingInterval = null;
    }
    this.votingUtil.status = VotingStatus.WAIT_FOR_BLOCK;
    if (ainUtil.areSameAddresses(this.node.account.address,
        this.node.db.getValue(PredefinedDbPaths.VOTING_ROUND_PROPOSER))) {
      console.log(`Peer ${this.node.account.address} will start next round at ` +
          `block number ${this.node.bc.lastBlockNumber() + 1} in ` +
          `${BLOCK_CREATION_INTERVAL_MS}ms`);
      this.executeAndBroadcastTransaction(this.votingUtil.updateRecentProposers());
    }
    const recentProposers = this.node.db.getValue(PredefinedDbPaths.RECENT_PROPOSERS);
    if (recentProposers && recentProposers[this.node.account.address]) {
      this.votingInterval = setInterval(() => {
        const newRoundTrans = this.votingUtil.startNewRound(this.node.bc);
        const response = this.executeAndBroadcastVotingAction({
          transaction: newRoundTrans,
          actionType: VotingActionTypes.NEW_VOTING
        });
        if (this.checkForTransactionResultErrorCode(response)) {
          console.log('Not designated proposer');
          return;
        }
        console.log(`User ${this.node.account.address} is starting round of block number ` +
            `${this.node.bc.lastBlockNumber() + 1}`);
        if (this.votingUtil.needRestaking()) {
          console.log('[cleanupAfterVotingRound] stake has expired');
          this.renewStakes();
        }
        this.executeAndBroadcastTransaction(this.votingUtil.registerForNextRound(
            this.node.bc.lastBlockNumber() + 1));
        if (this.votingUtil.isProposer()) {
          this.createAndProposeBlock();
        }
      }, BLOCK_CREATION_INTERVAL_MS);
    }
  }

  depositStakes() {
    console.log(`Staking amount ${STAKE}`);
    if (!STAKE) return;
    const stakeTx = this.votingUtil.createStakeTransaction(STAKE);
    this.executeAndBroadcastTransaction(stakeTx);
  }

  renewStakes() {
    // withdraw expired stakes and re-deposit
    // TODO (lia): use a command line flag to specify whether the node should
    // automatically re-stake?
    console.log(`Re-staking`);
    const restakeTx = this.votingUtil.createStakeTransaction(0);
    this.executeAndBroadcastTransaction(restakeTx);
  }
}

module.exports = P2pServer;
