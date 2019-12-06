const Websocket = require('ws');
const P2P_PORT = process.env.P2P_PORT || 5001;
const ip = require('ip');
const publicIp = require('public-ip');
const trackerWebSocketAddr = process.env.TRACKER_IP || 'ws://localhost:3001';
// Set LOCAL to true if your are running all blockchains in a local environment where all
// blcokchain nodes are being run in the same network (e.g. on your laptop) and will not
// communicate with external servers.
const LOCAL = process.env.LOCAL || false;
const trackerWebSocket = new Websocket(trackerWebSocketAddr);
const PROTOCOL = 'ws';
const {MessageTypes, VotingStatus, VotingActionTypes, STAKE, PredefinedDbPaths}
    = require('../constants');
const {Block} = require('../blockchain/block');
const Transaction = require('../db/transaction');
const ainUtil = require('@ainblockchain/ain-util');
const VotingUtil = require('./voting-util');
const { WriteDbOperations, DEBUG } = require('../constants');
const BLOCK_CREATION_INTERVAL = 6000;
const semver = require('semver');
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;

class P2pServer {
  constructor(db, blockchain, transactionPool, minProtocolVersion, maxProtocolVersion) {
    this.db = db;
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.sockets = [];
    this.votingUtil = new VotingUtil(db);
    this.votingInterval = null;
    this.waitInBlocks = 4;
    this.minProtocolVersion = minProtocolVersion;
    this.maxProtocolVersion = maxProtocolVersion;
  }

  async connectTracker() {
    trackerWebSocket.on('message', (message) => {
      const peers = JSON.parse(message);
      this.connectToPeers(peers);
      if (peers.length === 0) {
        this.blockchain.init(true);
        this.db.startWithBlockchain(this.blockchain, this.transactionPool);
        this.blockchain.syncedAfterStartup = true;
        this.initiateChain();
      } else {
        this.blockchain.init(false);
        this.db.startWithBlockchain(this.blockchain, this.transactionPool);
      }
    });
    trackerWebSocket.send(JSON.stringify({PROTOCOL, HOST: LOCAL ?
        ip.address() : (await publicIp.v4()), P2P_PORT, PUBLIC_KEY: this.db.account.address}));
  }

  listen() {
    const server = new Websocket.Server({port: P2P_PORT});
    server.on('connection', (socket) => this.connectSocket(socket));
    trackerWebSocket.on('open', () => this.connectTracker());
    console.log(`Listening for peer-to-peer connections on: ${P2P_PORT}`);
    // DO WE NEED THIS?
    this.requestChainSubsection(this.blockchain.lastBlock());
  }

  connectToPeers(peers) {
    peers.forEach((peer) => {
      console.log(`[${P2P_PORT}] Connecting to peer ${peer}`);
      const socket = new Websocket(peer);
      socket.on('open', () => this.connectSocket(socket));
    });
  }

  connectSocket(socket) {
    this.sockets.push(socket);
    this.messageHandler(socket);
    this.requestChainSubsection(this.blockchain.lastBlock());
  }

  messageHandler(socket) {
    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        const version = data.protocolVersion;
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
            if (this.blockchain.merge(data.chainSubsection)) {
              if (data.number === this.blockchain.lastBlockNumber()) {
                // If peer is new to network and has successfully reached the consensus blockchain
                // height, wait the duration of one more voting round before processing
                // transactions.
                if (!this.blockchain.syncedAfterStartup) {
                  setTimeout(() => {
                    try {
                      this.db.reconstruct(this.blockchain, this.transactionPool);
                      this.blockchain.syncedAfterStartup = true;
                    } catch (error) {
                      console.log(`Error in starting:${error.stack}`);
                    }
                  }, BLOCK_CREATION_INTERVAL);
                }
              }
              for (let i=0; i<data.chainSubsection.length; i++) {
                this.transactionPool.removeCommitedTransactions(data.chainSubsection[i]);
              }
              this.db.reconstruct(this.blockchain, this.transactionPool);
              // Continuously request the blockchain in subsections until
              // your local blockchain matches the height of the consensus blockchain.
              this.requestChainSubsection(this.blockchain.lastBlock());
            }
            break;
          case MessageTypes.CHAIN_SUBSECTION_REQUEST:
            if (this.blockchain.chain.length === 0) {
              return;
            }
            // Send a chunk of 20 blocks from  your blockchain to the requester.
            // Requester will continue to request blockchain chunks
            // until their blockchain height matches the consensus blockchain height
            const chainSubsection = this.blockchain.requestBlockchainSection(
                data.lastBlock ? Block.parse(data.lastBlock) : null);
            if (chainSubsection) {
              this.sendChainSubsection(socket, chainSubsection, this.blockchain.lastBlockNumber());
            }
            break;
        }
      } catch (error) {
        console.log(error.stack);
      }
    });

    socket.on('close', () => {
      this.sockets.splice(this.sockets.indexOf(socket), 1);
    });
  }

  sendChainSubsection(socket, chainSubsection, number) {
    socket.send(JSON.stringify({
        type: MessageTypes.CHAIN_SUBSECTION,
        chainSubsection,
        number,
        protocolVersion: CURRENT_PROTOCOL_VERSION
      }));
  }

  requestChainSubsection(lastBlock) {
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({
          type: MessageTypes.CHAIN_SUBSECTION_REQUEST,
          lastBlock,
          protocolVersion: CURRENT_PROTOCOL_VERSION
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
          protocolVersion: CURRENT_PROTOCOL_VERSION
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
        protocolVersion: CURRENT_PROTOCOL_VERSION
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
          protocolVersion: CURRENT_PROTOCOL_VERSION
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
    if (this.transactionPool.isNotEligibleTransaction(transaction)) {
      if (DEBUG) {
        console.log(`ALREADY RECEIVED: ${JSON.stringify(transaction)}`);
      }
      console.log('Transaction already received');
      return null;
    }
    if (this.blockchain.syncedAfterStartup === false) {
      this.transactionPool.addTransaction(transaction);
      return null;
    }
    const result = this.db.executeTransaction(transaction);
    if (!this.checkForTransactionResultErrorCode(result)) {
      // Add transaction to pool
      this.transactionPool.addTransaction(transaction);
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
        if (!this.votingUtil.isSyncedWithNetwork(this.blockchain)) {
          this.requestChainSubsection(this.blockchain.lastBlock());
        }
        if (this.votingUtil.getStakes(this.db.account.address) &&
            this.blockchain.syncedAfterStartup) {
          this.executeAndBroadcastTransaction(
              this.votingUtil.registerForNextRound(this.blockchain.lastBlockNumber() + 1));
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
          if (!this.transactionPool.isNotEligibleTransaction(proposedBlock.transactions[i])
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
            !Block.validateProposedBlock(proposedBlock, this.blockchain) ||
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
    const transactions = this.transactionPool.validTransactions();
    const blockNumber = this.blockchain.lastBlockNumber() + 1;
    const validators = this.db.getValue(PredefinedDbPaths.VOTING_ROUND_VALIDATORS);
    const newBlock = Block.createBlock(this.blockchain.lastBlock().hash,
        this.votingUtil.lastVotes, transactions, blockNumber, this.db.account.address,
        validators);
    const ref = PredefinedDbPaths.VOTING_ROUND_BLOCK_HASH;
    const value = newBlock.hash;
    console.log(`Proposing block with hash ${newBlock.hash} and number ${blockNumber}`);
    const blockHashTransaction = this.db.createTransaction({
        operation: {
          type: WriteDbOperations.SET_VALUE,
          ref, value
        }
      });
    this.votingUtil.setBlock(newBlock, blockHashTransaction);
    this.executeTransaction(blockHashTransaction);
    this.broadcastBlock(blockHashTransaction);
    if (!validators || !Object.keys(validators).length ||
    (Object.keys(validators).length === 1 && validators[this.db.account.address])) {
      console.log('No other validators registered for this round');
      this.addBlockToChain();
      this.cleanupAfterVotingRound();
    }
  }

  initiateChain() {
    this.votingUtil.status = VotingStatus.WAIT_FOR_BLOCK;
    this.depositStakes();
    const initChainTx = this.votingUtil.instantiate(this.blockchain);
    if (!initChainTx) {
      throw Error(`Deposit by the initiating node was unsuccessful`);
    }
    this.executeAndBroadcastTransaction(initChainTx);
    this.executeAndBroadcastTransaction(this.votingUtil.registerForNextRound(1));
    this.createAndProposeBlock();
  }

  addBlockToChain() {
    if (this.blockchain.addNewBlock(this.votingUtil.block)) {
      this.transactionPool.removeCommitedTransactions(this.votingUtil.block);
      this.votingUtil.reset();
      this.db.reconstruct(this.blockchain, this.transactionPool);
      if (this.waitInBlocks > 0 && !this.votingUtil.getStakes(this.db.account.address)) {
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
    if (ainUtil.areSameAddresses(this.db.account.address,
        this.db.getValue(PredefinedDbPaths.VOTING_ROUND_PROPOSER))) {
      console.log(`Peer ${this.db.account.address} will start next round at ` +
          `block number ${this.blockchain.lastBlockNumber() + 1} in ${BLOCK_CREATION_INTERVAL}ms`);
      this.executeAndBroadcastTransaction(this.votingUtil.updateRecentProposers());
    }
    const recentProposers = this.db.getValue(PredefinedDbPaths.RECENT_PROPOSERS);
    if (recentProposers && recentProposers[this.db.account.address]) {
      this.votingInterval = setInterval(()=> {
        const newRoundTrans = this.votingUtil.startNewRound(this.blockchain);
        const response = this.executeAndBroadcastVotingAction({
          transaction: newRoundTrans,
          actionType: VotingActionTypes.NEW_VOTING
        });
        if (this.checkForTransactionResultErrorCode(response)) {
          console.log('Not designated proposer');
          return;
        }
        console.log(`User ${this.db.account.address} is starting round of block number ` +
            `${this.blockchain.lastBlockNumber() + 1}`);
        if (this.votingUtil.needRestaking()) {
          console.log('[cleanupAfterVotingRound] stake has expired');
          this.renewStakes();
        }
        this.executeAndBroadcastTransaction(this.votingUtil.registerForNextRound(
            this.blockchain.lastBlockNumber() + 1));
        if (this.votingUtil.isProposer()) {
          this.createAndProposeBlock();
        }
      }, BLOCK_CREATION_INTERVAL);
    }
    console.log(`New blockchain last block number is ${this.blockchain.lastBlockNumber() + 1}`);
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
