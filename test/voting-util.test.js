const DB = require('../db')
const TransactionPool = require("../db/transaction-pool")
const Blockchain = require('../blockchain')
const VotingUtil = require("../voting-util")
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const rimraf = require("rimraf");
const {VOTING_ACTION_TYPES} = require('../config')

describe("Consensus and Triggering", () => {
    let db1, db2, db3, bc1, bc2, bc3, tp1, tp2, tp3, vu

    beforeEach(() => {
        tp1 = new TransactionPool()
        tp2 = new TransactionPool()
        tp3 = new TransactionPool()
        bc1 = new Blockchain("db-test-1")
        bc2 = new Blockchain("db-test-2")
        bc3 = new Blockchain("db-test-3")

        db1 = DB.getDatabase(bc1, tp1)
        db2 = DB.getDatabase(bc2, tp2)
        db3 = DB.getDatabase(bc3, tp3)
        
        vu = new VotingUtil(db1, bc1)
    })

    afterEach(() => {
        rimraf.sync(bc1._blockchainDir());
        rimraf.sync(bc2._blockchainDir());
        rimraf.sync(bc3._blockchainDir());
    });
    
    it("test transaction to '_voting' results in VOTING_ACTION_TYPE.transaction for next_round_validator " , () => {
        // Must set Stake first !!!
        const stake = 200
        const stakeTransaction = db1.createTransaction({type: "SET", ref: `stakes/${db1.publicKey}`, value:stake})
        db1.execute(stakeTransaction.output, stakeTransaction.address, stakeTransaction.timestamp)
        var firstVotingData = {validators: {}, next_round_validators: {}, threshold: 0, forger: db1.publicKey, preVotes: 1, 
                                 preCommits: 1, time: Date.now(), blockHash: "", height: bc1.lastBlock().height + 1,  lastHash: bc1.lastBlock().hash}
        const initVotingTransaction = db1.createTransaction({type: "SET", ref: `_voting`, value: firstVotingData})
        db1.execute(initVotingTransaction.output, initVotingTransaction.address, initVotingTransaction.timestamp)
        const votingActionForNextRoundValidatorTransaction = vu.execute(initVotingTransaction)
        // Check that a new block has been forged and that the forger has been written to the database
        expect(votingActionForNextRoundValidatorTransaction.type).to.equal(VOTING_ACTION_TYPES.transaction)
        expect(votingActionForNextRoundValidatorTransaction.transaction.output.value).to.equal(stake)
    })

    it("test transaction to '_voting' results in null if no stake has beem set" , () => {
        var firstVotingData = {validators: {}, next_round_validators: {}, threshold: 0, forger: db1.publicKey, preVotes: 1, 
                                 preCommits: 1, time: Date.now(), blockHash: "", height: bc1.lastBlock().height + 1,  lastHash: bc1.lastBlock().hash}
        const initVotingTransaction = db1.createTransaction({type: "SET", ref: `_voting`, value: firstVotingData})
        db1.execute(initVotingTransaction.output, initVotingTransaction.address, initVotingTransaction.timestamp)

        const votingAction = vu.execute(initVotingTransaction)
        // Check that a new block has been forged and that the forger has been written to the database
        expect(votingAction).to.equal(null)
    })

    it("test transaction to 'next_round_validators' results in ADD_BLOCK voting  " , () => {
        var firstVotingData = {validators: {}, next_round_validators: {}, threshold: 0, forger: db1.publicKey, preVotes: 1, 
                                 preCommits: 1, time: Date.now(), blockHash: "", height: bc1.lastBlock().height + 1,  lastHash: bc1.lastBlock().hash}
        const initVotingTransaction = db1.createTransaction({type: "SET", ref: `_voting`, value: firstVotingData})
        db1.execute(initVotingTransaction.output, initVotingTransaction.address, initVotingTransaction.timestamp)

        const votingAction = vu.execute(initVotingTransaction)
        // Check that a new block has been forged and that the forger has been written to the database
        expect(votingAction).to.equal(null)
    })


})

   