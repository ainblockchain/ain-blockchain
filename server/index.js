const Websocket = require('ws');
const P2P_PORT = process.env.P2P_PORT || 5001;
const ip = require('ip');
const publicIp = require('public-ip');
const trackerWebSocketAddr = process.env.TRACKER_IP || 'ws://localhost:3001';
// Set LOCAL to true if your are running all blockchains in a local environment where all blcokchain nodes
// are being run in the same network (e.g. on your laptop) and will not communicate with external servers.
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

class P2pServer {
  constructor(db, blockchain, transactionPool) {
    this.db = db;
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.sockets = [];
    this.votingUtil = new VotingUtil(db);
    this.votingInterval = null;
    this.waitInBlocks = 4;
  }

  async connectTracker() {
    trackerWebSocket.on('message', (message) => {
      const peers = JSON.parse(message);
      this.connectToPeers(peers);
      if (peers.length === 0) {
        this.blockchain.syncedAfterStartup = true;
        this.initiateChain();
      }
    });
    trackerWebSocket.send(JSON.stringify({PROTOCOL, HOST: LOCAL ? ip.address() : (await publicIp.v4()), P2P_PORT, PUBLIC_KEY: this.db.account.address}));
  }

  listen() {
    const server = new Websocket.Server({port: P2P_PORT});
    server.on('connection', (socket) => this.connectSocket(socket));
    trackerWebSocket.on('open', () => this.connectTracker());
    console.log(`Listening for peer-to-peer connections on: ${P2P_PORT}`);
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
              if (data.number === this.blockchain.height()) {
                // If peeer is new to network and has successfully reached the consensus blockchain height
                // wait the duration of one more voting round before processing transactions.
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
            const chainSubsection = this.blockchain.requestBlockchainSection(data.lastBlock);
            if (chainSubsection) {
              this.sendChainSubsection(socket, chainSubsection, this.blockchain.height());
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
    socket.send(JSON.stringify({type: MessageTypes.CHAIN_SUBSECTION, chainSubsection, number}));
  }

  requestChainSubsection(lastBlock) {
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({type: MessageTypes.CHAIN_SUBSECTION_REQUEST, lastBlock}));
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
      socket.send(JSON.stringify({type: MessageTypes.TRANSACTION, transaction}));
    });
  }

  broadcastBlock(blockHashTransaction) {
    if (DEBUG) {
      console.log(`SENDING: ${JSON.stringify(blockHashTransaction)}`);
    }
    console.log(`Broadcasting new block ${this.votingUtil.block}`);
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({type: MessageTypes.VOTING, votingAction:
        {actionType: VotingActionTypes.PROPOSED_BLOCK, block: this.votingUtil.block, transaction: blockHashTransaction}}));
    });
  }

  broadcastVotingAction(votingAction) {
    if (DEBUG) {
      console.log(`SENDING: ${JSON.stringify(votingAction.transaction)}`);
    }
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({type: MessageTypes.VOTING, votingAction}));
    });
  }

  /**
   * Adds transaction to the transactionPool and executes the operations specified
   * in the transaction.
   * @param {Object} transactionWithSig An object with a signature and a transaction.
   */
  // TODO(seo): Remove new Transaction() use cases.
  executeTransaction(transactionWithSig) {
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
      return [];
    }
    const result = this.db.executeTransaction(transaction);
    if (!this.checkForTransactionResultErrorCode(result)) {
      // Add transaction to pool
      this.transactionPool.addTransaction(transaction);
    } else if (DEBUG) {
      console.log(`FAILED TRANSACTION: ${JSON.stringify(transaction)}\t RESULT:${JSON.stringify(result)}`);
    }
    return result;
  }

  checkForTransactionResultErrorCode(response) {
    return response === null || (response.code !== undefined && response.code !== 0);
  }

  executeAndBroadcastTransaction(transactionWithSig) {
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
      console.log(`RECEIVED VOTING ACTION ${votingAction.actionType} FROM USER ${votingAction.transaction.address}`)
    }
    const response = this.executeTransaction(votingAction.transaction);
    if (!this.checkForTransactionResultErrorCode(response)) {
      if ([VotingActionTypes.PRE_VOTE, VotingActionTypes.PRE_COMMIT].indexOf(votingAction.actionType) > -1) {
        this.votingUtil.registerValidatingTransaction(votingAction.transaction);
      }
      this.broadcastVotingAction(votingAction);
    }
    if (DEBUG) {
      if(this.checkForTransactionResultErrorCode(response)) {
          console.log(`PREVIOUSLY EXECUTED VOTING ACTION ${votingAction.actionType} FROM USER ${votingAction.transaction.address}`)
      } else {
          console.log(`NEW VOTING ACTION ${votingAction.actionType} FROM USER ${votingAction.transaction.address} WITH TRANSACTION INFO ${JSON.stringify(votingAction.transaction)}`)
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
        if (this.votingUtil.isStaked() && this.blockchain.syncedAfterStartup) {
          this.executeAndBroadcastTransaction(this.votingUtil.registerForNextRound(this.blockchain.height() + 1));
        }

        this.checkIfProposer();
        break;
      case VotingActionTypes.PROPOSED_BLOCK:
        let invalidTransactions = false;
        for (let i = 0; i < votingAction.block.data.length; i++) {
          // First check if the transation has already been received.
          // Next check that the received transaction is valid.
          if (!this.transactionPool.isNotEligibleTransaction(votingAction.block.data[i])
            && this.checkForTransactionResultErrorCode(this.executeTransaction(votingAction.block.data[i]))) {
            if (DEBUG) {
              console.log(`BLOCK ${votingAction.block} has invalid transaction ${votingAction.block.data[i]}`)
            }
            invalidTransactions = true;
            break
          }
        }
        if (invalidTransactions ||
            !Block.validateBlock(votingAction.block, this.blockchain) ||
            votingAction.block === this.votingUtil.block ||
            [VotingStatus.WAIT_FOR_BLOCK, VotingStatus.SYNCING].indexOf(this.votingUtil.status) < 0) {
              if(DEBUG) {
                console.log(`REJECTING BLOCK ${JSON.stringify(votingAction.block)}`)
              }
          break;
        }
        this.votingUtil.setBlock(votingAction.block);
        if(DEBUG) {
          console.log(`ACCEPTING BLOCK ${JSON.stringify(votingAction.block)}`)
        }
        if (this.votingUtil.isValidator()) {
          this.executeAndBroadcastVotingAction({
            transaction: this.votingUtil.preVote(),
            actionType: VotingActionTypes.PRE_VOTE
          });
        }
      case VotingActionTypes.PRE_VOTE:
        if (!this.votingUtil.checkPreVotes()) {
          break;
        }
        const preCommitTransaction = this.votingUtil.preCommit();
        if (preCommitTransaction !== null) {
          this.executeAndBroadcastVotingAction({
            transaction: preCommitTransaction,
            actionType: VotingActionTypes.PRE_COMMIT
          });
        }
      case VotingActionTypes.PRE_COMMIT:
        if (this.votingUtil.isCommit()) {
          this.votingUtil.addValidatorTransactionsToBlock();
          this.addBlockToChain();
          this.cleanupAfterVotingRound();
        }
        break;
    }
  }

  createBlock() {
    const data = this.transactionPool.validTransactions();
    const blockNumber = this.blockchain.height() + 1;
    this.votingUtil.setBlock(
        Block.createBlock(data, this.db, blockNumber, this.blockchain.lastBlock(),
            this.db.account.address,
            Object.keys(this.db.getValue(PredefinedDbPaths.VOTING_ROUND_VALIDATORS)),
            this.db.getValue(PredefinedDbPaths.VOTING_ROUND_THRESHOLD)));
    const ref = PredefinedDbPaths.VOTING_ROUND_BLOCK_HASH;
    const value = this.votingUtil.block.hash;
    console.log(`Created a block with hash ${this.votingUtil.block.hash} and number ${blockNumber}`);
    const blockHashTransaction = this.db.createTransaction({
      operation: {
        type: WriteDbOperations.SET_VALUE,
        ref, value
      }
    });
    this.executeTransaction(blockHashTransaction);
    this.broadcastBlock(blockHashTransaction);
    if (!Object.keys(this.db.getValue(PredefinedDbPaths.VOTING_ROUND_VALIDATORS)).length) {
      console.log('No validators registered for this round');
      this.addBlockToChain();
      this.cleanupAfterVotingRound();
    }
  }

  // Increase node's balance for testing purposes. (To be removed)
  increaseBalanceForDev() {
    const transaction = this.db.createTransaction({
        operation: {
          type: WriteDbOperations.SET_VALUE,
          ref: this.votingUtil.resolveDbPath([PredefinedDbPaths.ACCOUNTS, this.db.account.address, PredefinedDbPaths.BALANCE]),
          value: 1000

        }
      });
    this.executeAndBroadcastTransaction(transaction);
  }

  initiateChain() {
    this.votingUtil.status === VotingStatus.WAIT_FOR_BLOCK;
    this.increaseBalanceForDev();
    this.stakeAmount();
    this.executeAndBroadcastTransaction(this.votingUtil.instantiate(this.blockchain));
    this.createBlock();
  }

  addBlockToChain() {
    this.blockchain.addNewBlock(this.votingUtil.block);
    this.transactionPool.removeCommitedTransactions(this.votingUtil.block);
    this.votingUtil.reset();
    this.db.reconstruct(this.blockchain, this.transactionPool);
    if (this.waitInBlocks > 0 && /*!this.votingUtil.isStaked()) {*/
        !this.db.getValue(this.votingUtil.resolveDbPath([PredefinedDbPaths.STAKEHOLDER, this.db.account.address]))) {
      this.waitInBlocks = this.waitInBlocks - 1;
      if (this.waitInBlocks === 0) {
        this.stakeAmount();
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
      console.log(`Peer ${this.db.account.address} will start next round at height ${this.blockchain.height() + 1} in ${BLOCK_CREATION_INTERVAL}ms`);
      this.executeAndBroadcastTransaction(this.votingUtil.writeSuccessfulBlockCreation());
    }

    if (this.db.getValue(PredefinedDbPaths.RECENT_PROPOSERS).indexOf(this.db.account.address) >= 0) {
      this.votingInterval = setInterval(()=> {
        const newRoundTrans = this.votingUtil.startNewRound(this.blockchain);
        const response = this.executeAndBroadcastVotingAction({transaction: newRoundTrans, actionType: VotingActionTypes.NEW_VOTING});
        if (this.checkForTransactionResultErrorCode(response)) {
          console.log('Not designated proposer');
          return;
        }
        console.log(`User ${this.db.account.address} is starting round ${this.blockchain.height() + 1}`);

        this.executeAndBroadcastTransaction(this.votingUtil.registerForNextRound(this.blockchain.height() + 1));
        this.checkIfProposer();
      }, BLOCK_CREATION_INTERVAL);
    }
    console.log(`New blockchain height is ${this.blockchain.height() + 1}`);
  }

  checkIfProposer() {
    if (this.votingUtil.isProposer()) {
      this.createBlock();
    }
  }

  stakeAmount() {
    if (this.stake !== null) {
      console.log(`Staking amount ${STAKE}`);
      const transaction = this.votingUtil.stake(STAKE);
      this.executeAndBroadcastTransaction(transaction);
    }
  }
}

module.exports = P2pServer;
