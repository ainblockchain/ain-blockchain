
const shuffleSeed = require('shuffle-seed')
const seedrandom = require('seedrandom')
const {VOTING_STATUS, CONSENSUS_DB_KEYS} = require('../constants')
const MAX_RECENT_FORGERS = 20
const InvalidPermissionsError = require("../errors")

class VotingUtil {

    constructor(db){
        this.db = db
        this.status = VOTING_STATUS.start_up
        this.block = null
        this.validatorTransactions = []
    }

    resolveDbPath(pathSubKeys){
        return pathSubKeys.join("/")
    }

    registerValidatingTransaction(transaction){
        // Transactions can be null (when cascading from proposed_block) and duplicate (when cascading from pre_cote)
        if (transaction && !this.validatorTransactions.find(trans => {return trans.id === transaction.id})){
            this.validatorTransactions.push(transaction)
        }
    }

    checkPreVotes(){
        var total  = Object.values(this.db.get(CONSENSUS_DB_KEYS.voting_round_validators_path)).reduce(function(a, b) { return a + b; }, 0)
        console.log(`Total preVotes from validators : ${total}\nReceived preVotes ${this.db.get(CONSENSUS_DB_KEYS.voting_round_pre_votes_path)}`)
        return (this.db.get(CONSENSUS_DB_KEYS.voting_round_pre_votes_path) > (total *.6666)) || total === 0
    }

    addValidatorTransactionsToBlock() {
        for(var i=0; i<this.validatorTransactions.length; i++){
            this.block.validatorTransactions.push(this.validatorTransactions[i])
        }
        
    }
    
    preVote(){
        var stake =  this.db.get(this.resolveDbPath([CONSENSUS_DB_KEYS.voting_round_validators_path, this.db.publicKey]))
        var diff = {[CONSENSUS_DB_KEYS.voting_round_pre_votes_path]: stake}
        this.status = VOTING_STATUS.pre_vote
        console.log(`Current prevotes are ${this.db.db._voting.preVotes}`)
        var transaction =  this.db.createTransaction({type: "INCREASE", diff})
        this.registerValidatingTransaction(transaction)
        return transaction
    
    }

    isCommit(){
        console.log(`Checking status ${this.status}`)
        return  this.status !== VOTING_STATUS.committed && this.checkPreCommits()
    }

    reset(){
        this.status = VOTING_STATUS.committed
        this.block = null
        this.validatorTransactions.length = []
    }

    isSyncedWithNetwork(bc){
        // This does not currently take in to a count the situation where consensus is not reached.
        // Need to add logic to account for this situation
        const sync =  (VOTING_STATUS.committed === this.status && bc.height() + 1 === Number(this.db.get(CONSENSUS_DB_KEYS.voting_round_height_path)))
        if (!sync){
            this.status = VOTING_STATUS.syncing
        }
        return sync
    }
    
    
    preCommit(){
        if (this.status !== VOTING_STATUS.pre_vote){
            return null
        }
        var stake =  this.db.get(this.resolveDbPath([CONSENSUS_DB_KEYS.voting_round_validators_path, this.db.publicKey]))
        var diff = {[CONSENSUS_DB_KEYS.voting_round_pre_commits_path]: stake}
        console.log(`Current precommits are ${this.db.db._voting.preCommits}`)
        this.status = VOTING_STATUS.pre_commit
        var transaction =  this.db.createTransaction({type: "INCREASE", diff})
        this.registerValidatingTransaction(transaction)
        return transaction

    }
    
    checkPreCommits(){
        var total  = Object.values(this.db.get(CONSENSUS_DB_KEYS.voting_round_validators_path)).reduce(function(a, b) { return a + b; }, 0)
        console.log(`Total preCommits from validators : ${total}\nReceived preCommits ${this.db.get(CONSENSUS_DB_KEYS.voting_round_pre_commits_path)}`)
        return  (this.db.get(CONSENSUS_DB_KEYS.voting_round_pre_commits_path) > (total *.6666)) || total === 0
    }
    
    
    instantiate(bc){
        console.log("Initialising voting !!")
        // This method should only be called by the very first node on the network !!
        // This user should establish themselves as the first node on the network, instantiate the first _voting entry t db
        // and commit this to the blockchain so it will be picked up by new peers on the network
        var time = Date.now()
        var firstVotingData = {validators: {}, next_round_validators: {}, threshold: -1, forger: this.db.publicKey, preVotes: 0, 
                                preCommits: 0, time, blockHash: "", height: bc.lastBlock().height + 1,  lastHash: bc.lastBlock().hash}
        return this.db.createTransaction({type: "SET", ref: CONSENSUS_DB_KEYS.voting_round_path, value: firstVotingData})
    }
    
    
    startNewRound(bc){
        var lastRound = this.db.get("_voting")
        var time = Date.now()
        let forger
        if (Object.keys(lastRound.next_round_validators).length){
            forger = this.getForger(lastRound.next_round_validators, bc)
            delete lastRound.next_round_validators[forger]
        } else{
            forger = this.db.publicKey
        }
        var threshold = Math.round(Object.values(lastRound.next_round_validators).reduce(function(a, b) { return a + b; }, 0) * .666) - 1
        var nextRound = {validators: lastRound.next_round_validators, next_round_validators:{}, threshold, forger:forger, preVotes: 0, preCommits: 0, time, blockHash: null}
        if (this.checkPreCommits()){
            // Should be1
            nextRound =  Object.assign({}, nextRound, {height: lastRound.height + 1, lastHash: lastRound.blockHash})
        } else {
            // Start same round
            nextRound =  Object.assign({}, nextRound, {height: lastRound.height,  lastHash: lastRound.lastHash})
        }

        let newRoundTransaction
        try {
            newRoundTransaction = this.db.createTransaction({type: "SET", ref: CONSENSUS_DB_KEYS.voting_round_path, value: nextRound})
        } catch (error) {
            if(error instanceof InvalidPermissionsError){
                console.log('Not designated forger')
                return null
            } else {
                throw error
            }
        }
        return newRoundTransaction
    }
    
    registerForNextRound(height){
        var votingRound = this.db.get(CONSENSUS_DB_KEYS.voting_round_path)
        console.log(`${height + 1} is the expected height and actual info is ${votingRound.height + 1}`)
        if (height !== votingRound.height){
            throw Error("Not valid height")
        }
    
        var ref = `_voting/next_round_validators/${this.db.publicKey}`
        var value = this.db.get(this.resolveDbPath([CONSENSUS_DB_KEYS.stakeholder_path, this.db.publicKey]))
        return this.db.createTransaction({type: "SET", ref, value})
    } 

    setBlock(block){
        console.log(`Setting block ${block.hash.substring(0, 5)} at height ${block.height}`)
        this.block = block
        this.status = VOTING_STATUS.block_received
        this.validatorTransactions.length = 0 
    }

    getForger(stakeHolders, bc){
        var alphabeticallyOrderedStakeHolders  = Object.keys(stakeHolders).sort()
        var totalStakedAmount = Object.values(stakeHolders).reduce(function(a, b) { return a + b; }, 0);
        var seed = bc.chain.length > 5 ? bc.chain[bc.chain.length - 4].hash : bc.chain[0].hash 
        
        alphabeticallyOrderedStakeHolders = shuffleSeed.shuffle(alphabeticallyOrderedStakeHolders, seed)
        var cumulativeStakeFromPotentialValidators = 0
        var randomNumGenerator = seedrandom(seed)
        var targetValue = randomNumGenerator() * totalStakedAmount
        for(var i=0; i < alphabeticallyOrderedStakeHolders.length; i++){
            cumulativeStakeFromPotentialValidators += stakeHolders[alphabeticallyOrderedStakeHolders[i]]
            if(targetValue < cumulativeStakeFromPotentialValidators){
                console.log(`Forger is ${alphabeticallyOrderedStakeHolders[i]}`)
                return alphabeticallyOrderedStakeHolders[i]
            }
        }
        throw Error(`No forger was selected frok stakeholder dict ${stakeHolders} `)
    }

    stake(stakeAmount){
        console.log(`Successfully staked ${stakeAmount}`)
        return this.db.createTransaction({type: "SET", ref: this.resolveDbPath([CONSENSUS_DB_KEYS.stakeholder_path, this.db.publicKey]), value: stakeAmount})
    }

    isForger(){
        this.status = VOTING_STATUS.wait_for_block
        return this.db.get(CONSENSUS_DB_KEYS.voting_round_forger_path) === this.db.publicKey
    }

    isValidator(){
        return Boolean(this.db.get(this.resolveDbPath([CONSENSUS_DB_KEYS.voting_round_validators_path, this.db.publicKey])))
    }

    isStaked(){
        return Boolean(this.db.get(this.resolveDbPath([CONSENSUS_DB_KEYS.stakeholder_path, this.db.publicKey])))
    }

    writeSuccessfulForge(){
        var recentForgers = JSON.parse(JSON.stringify(this.db.get(CONSENSUS_DB_KEYS.recent_forgers_path)))
        if (recentForgers == null){
            recentForgers = []
        }
        else if (recentForgers.length == MAX_RECENT_FORGERS){
            recentForgers.shift()
        }

        if (recentForgers.indexOf(this.db.publicKey) >= 0){
            recentForgers.splice(recentForgers.indexOf(this.db.publicKey), 1)
        }
        recentForgers.push(this.db.publicKey)
        return this.db.createTransaction({type: "SET", ref: CONSENSUS_DB_KEYS.recent_forgers_path, value: recentForgers})
    }
    
}

module.exports = VotingUtil