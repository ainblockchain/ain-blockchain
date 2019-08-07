
const shuffleSeed = require('shuffle-seed')
const seedrandom = require('seedrandom')
const {VotingStatus, ConsensusDbKeys} = require('../constants')
const MAX_RECENT_FORGERS = 20
const InvalidPermissionsError = require("../errors")

class VotingUtil {

    constructor(db){
        this.db = db
        this.status = VotingStatus.START_UP
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
        var total  = Object.values(this.db.get(ConsensusDbKeys.VOTING_ROUND_VALIDATORS_PATH)).reduce(function(a, b) { return a + b; }, 0)
        console.log(`Total preVotes from validators : ${total}\nReceived preVotes ${this.db.get(ConsensusDbKeys.VOTING_ROUND_PRE_VOTES_PATH)}`)
        return (this.db.get(ConsensusDbKeys.VOTING_ROUND_PRE_VOTES_PATH) > (total *.6666)) || total === 0
    }

    addValidatorTransactionsToBlock() {
        for(var i = 0; i < this.validatorTransactions.length; i++){
            this.block.validatorTransactions.push(this.validatorTransactions[i])
        }
        
    }
    
    preVote(){
        var stake =  this.db.get(this.resolveDbPath([ConsensusDbKeys.VOTING_ROUND_VALIDATORS_PATH, this.db.publicKey]))
        var diff = {[ConsensusDbKeys.VOTING_ROUND_PRE_VOTES_PATH]: stake}
        this.status = VotingStatus.PRE_VOTE
        console.log(`Current prevotes are ${this.db.db._voting.preVotes}`)
        var transaction =  this.db.createTransaction({type: "INCREASE", diff})
        this.registerValidatingTransaction(transaction)
        return transaction
    
    }

    isCommit(){
        console.log(`Checking status ${this.status}`)
        return  this.status !== VotingStatus.COMMITTED && this.checkPreCommits()
    }

    reset(){
        this.status = VotingStatus.COMMITTED
        this.block = null
        this.validatorTransactions.length = []
    }

    isSyncedWithNetwork(bc){
        // This does not currently take in to a count the situation where consensus is not reached.
        // Need to add logic to account for this situation
        const sync =  (VotingStatus.COMMITTED === this.status && bc.height() + 1 === Number(this.db.get(ConsensusDbKeys.VOTING_ROUND_HEIGHT_PATH)))
        if (!sync){
            this.status = VotingStatus.SYNCING
        }
        return sync
    }
    
    
    preCommit(){
        if (this.status !== VotingStatus.PRE_VOTE){
            return null
        }
        var stake =  this.db.get(this.resolveDbPath([ConsensusDbKeys.VOTING_ROUND_VALIDATORS_PATH, this.db.publicKey]))
        var diff = {[ConsensusDbKeys.VOTING_ROUND_PRE_COMMITS_PATH]: stake}
        console.log(`Current precommits are ${this.db.db._voting.preCommits}`)
        this.status = VotingStatus.PRE_COMMIT
        var transaction =  this.db.createTransaction({type: "INCREASE", diff})
        this.registerValidatingTransaction(transaction)
        return transaction

    }
    
    checkPreCommits(){
        var total  = Object.values(this.db.get(ConsensusDbKeys.VOTING_ROUND_VALIDATORS_PATH)).reduce(function(a, b) { return a + b; }, 0)
        console.log(`Total preCommits from validators : ${total}\nReceived preCommits ${this.db.get(ConsensusDbKeys.VOTING_ROUND_PRE_COMMITS_PATH)}`)
        return  (this.db.get(ConsensusDbKeys.VOTING_ROUND_PRE_COMMITS_PATH) > (total *.6666)) || total === 0
    }
    
    
    instantiate(bc){
        console.log("Initialising voting !!")
        // This method should only be called by the very first node on the network !!
        // This user should establish themselves as the first node on the network, instantiate the first _voting entry t db
        // and commit this to the blockchain so it will be picked up by new peers on the network
        var time = Date.now()
        var firstVotingData = {validators: {}, next_round_validators: {}, threshold: -1, forger: this.db.publicKey, preVotes: 0, 
                                preCommits: 0, time, blockHash: "", height: bc.lastBlock().height + 1,  lastHash: bc.lastBlock().hash}
        return this.db.createTransaction({type: "SET", ref: ConsensusDbKeys.VOTING_ROUND_PATH, value: firstVotingData})
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

        return this.db.createTransaction({type: "SET", ref: ConsensusDbKeys.VOTING_ROUND_PATH, value: nextRound}, false)
    }
    
    registerForNextRound(height){
        var votingRound = this.db.get(ConsensusDbKeys.VOTING_ROUND_PATH)
        console.log(`${height + 1} is the expected height and actual info is ${votingRound.height + 1}`)
        if (height !== votingRound.height){
            throw Error("Not valid height")
        }
    
        var value = this.db.get(this.resolveDbPath([ConsensusDbKeys.STAKEHOLDER_PATH, this.db.publicKey]))
        return this.db.createTransaction({type: "SET", ref: this.resolveDbPath([ConsensusDbKeys.VOTING_NEXT_ROUND_VALIDATORS_PATH, this.db.publicKey]), value})
    } 

    setBlock(block){
        console.log(`Setting block ${block.hash.substring(0, 5)} at height ${block.height}`)
        this.block = block
        this.status = VotingStatus.BLOCK_RECEIVED
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
        return this.db.createTransaction({type: "SET", ref: this.resolveDbPath([ConsensusDbKeys.STAKEHOLDER_PATH, this.db.publicKey]), value: stakeAmount})
    }

    isForger(){
        this.status = VotingStatus.WAIT_FOR_BLOCK
        return this.db.get(ConsensusDbKeys.VOTING_ROUND_FORGER_PATH) === this.db.publicKey
    }

    isValidator(){
        return Boolean(this.db.get(this.resolveDbPath([ConsensusDbKeys.VOTING_ROUND_VALIDATORS_PATH, this.db.publicKey])))
    }

    isStaked(){
        return Boolean(this.db.get(this.resolveDbPath([ConsensusDbKeys.STAKEHOLDER_PATH, this.db.publicKey])))
    }

    writeSuccessfulForge(){
        var recentForgers = JSON.parse(JSON.stringify(this.db.get(ConsensusDbKeys.RECENT_FORGERS_PATH)))
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
        return this.db.createTransaction({type: "SET", ref: ConsensusDbKeys.RECENT_FORGERS_PATH, value: recentForgers})
    }
    
}

module.exports = VotingUtil