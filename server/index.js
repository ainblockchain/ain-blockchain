const Websocket = require('ws');
const P2P_PORT = process.env.P2P_PORT || 5001;
const ip = require('ip');
const trackerWebSocketAddr = process.env.TRACKER_IP || 'ws://localhost:3001';
const trackerWebSocket = new Websocket(trackerWebSocketAddr);
const PROTOCOL = 'ws';
const HOST = ip.address();
const {MessageTypes, VotingStatus, VotingActionTypes, STAKE, ConsensusDbKeys}
    = require('../constants');
const InvalidPermissionsError = require('../errors');
const {ForgedBlock} = require('../blockchain/block');
const VotingUtil = require('./voting-util');
const {DbOperations} = require('../constants');
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

  connectTracker() {
    trackerWebSocket.on('message', (message) => {
      const peers = JSON.parse(message);
      this.connectToPeers(peers);
      if (peers.length === 0) {
        this.blockchain.syncedAfterStartup = true;
        this.initiateChain();
      }
    });
    trackerWebSocket.send(JSON.stringify({PROTOCOL, HOST, P2P_PORT, PUBLIC_KEY: this.db.publicKey}));
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
      console.log(`Connecting to peer ${peer}`);
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
            this.executeVotingAction(data.votingAction);
            break;
          case MessageTypes.TRANSACTION:
            this.executeAndBroadcastTransaction(data.transaction);
            break;
          case MessageTypes.CHAIN_SUBSECTION:
            // Check if chain subsection is valid and can be
            // merged ontop of your local blockchain
            if (this.blockchain.merge(data.chainSubsection)) {
              if (data.height === this.blockchain.height()) {
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

  sendChainSubsection(socket, chainSubsection, height) {
    socket.send(JSON.stringify({type: MessageTypes.CHAIN_SUBSECTION, chainSubsection, height}));
  }

  requestChainSubsection(lastBlock) {
    this.sockets.forEach((socket) =>
      socket.send(JSON.stringify({type: MessageTypes.CHAIN_SUBSECTION_REQUEST, lastBlock})));
  }

  broadcastChainSubsection(chainSubsection) {
    this.sockets.forEach((socket) => this.sendChainSubsection(socket, chainSubsection));
  }

  broadcastTransaction(transaction) {
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({type: MessageTypes.TRANSACTION, transaction}));
    });
  }

  broadcastBlock(blockHashTransaction) {
    console.log(`Broadcasting new block ${this.votingUtil.block}`);
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({type: MessageTypes.VOTING, votingAction:
        {actionType: VotingActionTypes.PROPOSED_BLOCK, block: this.votingUtil.block, transaction: blockHashTransaction}}));
    });
  }

  broadcastVotingAction(votingAction) {
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({type: MessageTypes.VOTING, votingAction}));
    });
  }

  executeTransaction(transaction) {
    if (this.transactionPool.isAlreadyAdded(transaction)) {
      console.log('Transaction already received');
      return null;
    }

    if (this.blockchain.status === false) {
      this.transactionPool.addTransaction(transaction);
      return [];
    }

    let result;
    try {
      result = this.db.execute(transaction.output, transaction.address, transaction.timestamp);
    } catch (error) {
      if (error instanceof InvalidPermissionsError) {
        return null;
      } else {
        throw error;
      }
    }

    this.transactionPool.addTransaction(transaction);
    return result;
  }

  executeAndBroadcastTransaction(transaction) {
    const response = this.executeTransaction(transaction);
    if (response !== null) {
      this.broadcastTransaction(transaction);
    }
    return response;
  }

  executeAndBroadcastVotingAction(votingAction) {
    const response = this.executeTransaction(votingAction.transaction);
    if (response !== null) {
      if ([VotingActionTypes.PRE_VOTE, VotingActionTypes.PRE_COMMIT].indexOf(votingAction.actionType) > -1) {
        this.votingUtil.registerValidatingTransaction(votingAction.transaction);
      }
      this.broadcastVotingAction(votingAction);
    }
    return response;
  }

  executeVotingAction(votingAction) {
    const response = this.executeAndBroadcastVotingAction(votingAction);
    if (response === null) {
      return;
    }
    switch (votingAction.actionType) {
      case VotingActionTypes.NEW_VOTING:
        if (!this.votingUtil.isSyncedWithNetwork(this.blockchain)) {
          this.requestChainSubsection(this.blockchain.lastBlock());
        }
        if (this.votingUtil.isStaked()) {
          this.executeAndBroadcastTransaction(this.votingUtil.registerForNextRound(this.blockchain.height() + 1));
        }

        this.checkIfForger();
        break;
      case VotingActionTypes.PROPOSED_BLOCK:
        let invalidTransactions = false;
        for (let i = 0; i < votingAction.block.data.length; i++) {
          if (this.executeTransaction(votingAction.block.data[i]) &&
           !this.transactionPool.isAlreadyAdded(votingAction.block.data[i])) {
            invalidTransactions = true;
          }
        }
        if (invalidTransactions ||
            !ForgedBlock.validateBlock(votingAction.block, this.blockchain) ||
            votingAction.block === this.votingUtil.block ||
            [VotingStatus.WAIT_FOR_BLOCK, VotingStatus.SYNCING].indexOf(this.votingUtil.status) < 0) {
          break;
        }
        this.votingUtil.setBlock(votingAction.block);
        if (this.votingUtil.isValidator()) {
          this.executeAndBroadcastVotingAction({transaction: this.votingUtil.preVote(), actionType: VotingActionTypes.PRE_VOTE});
        }
      case VotingActionTypes.PRE_VOTE:
        if (!this.votingUtil.checkPreVotes()) {
          break;
        }
        const preCommitTransaction = this.votingUtil.preCommit();
        if (preCommitTransaction !== null) {
          this.executeAndBroadcastVotingAction({transaction: preCommitTransaction, actionType: VotingActionTypes.PRE_COMMIT});
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

  forgeBlock() {
    const data = this.transactionPool.validTransactions();
    const blockHeight = this.blockchain.height() + 1;
    this.votingUtil.setBlock(
        ForgedBlock.forgeBlock(data, this.db, blockHeight, this.blockchain.lastBlock(), this.db.publicKey,
            Object.keys(this.db.get(ConsensusDbKeys.VOTING_ROUND_VALIDATORS_PATH)), this.db.get(ConsensusDbKeys.VOTING_ROUND_THRESHOLD_PATH)));
    const ref = ConsensusDbKeys.VOTING_ROUND_BLOCK_HASH;
    const value = this.votingUtil.block.hash;
    console.log(`Forged block with hash ${this.votingUtil.block.hash} at height ${blockHeight}`);
    const blockHashTransaction = this.db.createTransaction({type: DbOperations.SET, ref, value});
    this.executeTransaction(blockHashTransaction);
    this.broadcastBlock(blockHashTransaction);
    if (!Object.keys(this.db.get(ConsensusDbKeys.VOTING_ROUND_VALIDATORS_PATH)).length) {
      console.log('No validators registered for this round');
      this.addBlockToChain();
      this.cleanupAfterVotingRound();
    }
  }

  initiateChain() {
    this.votingUtil.status === VotingStatus.WAIT_FOR_BLOCK;
    this.stakeAmount();
    this.executeAndBroadcastTransaction(this.votingUtil.instantiate(this.blockchain));
    this.forgeBlock();
  }

  addBlockToChain() {
    this.blockchain.addNewBlock(this.votingUtil.block);
    this.transactionPool.removeCommitedTransactions(this.votingUtil.block);
    this.votingUtil.reset();
    this.db.reconstruct(this.blockchain, this.transactionPool);
    if (this.waitInBlocks > 0) {
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
    if (this.db.get(ConsensusDbKeys.VOTING_ROUND_FORGER_PATH) === this.db.publicKey) {
      console.log(`Peer ${this.db.publicKey} will start next round at height ${this.blockchain.height() + 1} in ${BLOCK_CREATION_INTERVAL}ms`);
      this.executeAndBroadcastTransaction(this.votingUtil.writeSuccessfulForge());
    }

    if (this.db.get(ConsensusDbKeys.RECENT_FORGERS_PATH).indexOf(this.db.publicKey) >= 0) {
      this.votingInterval = setInterval(()=> {
        const newRoundTrans = this.votingUtil.startNewRound(this.blockchain);
        const response = this.executeAndBroadcastVotingAction({transaction: newRoundTrans, actionType: VotingActionTypes.NEW_VOTING});
        if (response === null) {
          console.log('Not designated forger');
          return;
        }
        console.log(`User ${this.db.publicKey} is starting round ${this.blockchain.height() + 1}`);

        this.executeAndBroadcastTransaction(this.votingUtil.registerForNextRound(this.blockchain.height() + 1));
        this.checkIfForger();
      }, BLOCK_CREATION_INTERVAL);
    }
    console.log(`New blockchain height is ${this.blockchain.height() + 1}`);
  }

  checkIfForger() {
    if (this.votingUtil.isForger()) {
      this.forgeBlock();
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
