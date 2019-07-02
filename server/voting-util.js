
const shuffleSeed = require('shuffle-seed')
const seedrandom = require('seedrandom')
const {VOTING_STATUS} = require('../config')
const MAX_RECENT_FORGERS = 20
const InvalidPermissionsError = require("../errors")


class VotingUtil {

    constructor(db){
        this.db = db
        this.status = VOTING_STATUS.START_UP
        this.block = null
        this.validatorTransactions = []
    }

    registerValidatingTransaction(transaction){

        // Transactions can be null (when cascading from proposed_block) and duplicate (when cascading from pre_cote)
        if (transaction && !this.validatorTransactions.find(trans => {return trans.id === transaction.id})){
            this.validatorTransactions.push(transaction)
        }
    }

    checkPreVotes(){
        var total  = Object.values(this.db.get("_voting/validators")).reduce(function(a, b) { return a + b; }, 0)
        console.log(`Total preVotes from validators : ${total}\nReceived preVotes ${this.db.get("_voting/preVotes")}`)
        return (this.db.get("_voting/preVotes") > (total *.6666)) || total === 0
    }

    addValidatorTransactionsToBlock() {
        for(var i=0; i<this.validatorTransactions.length; i++){
            this.block.validatorTransactions.push(this.validatorTransactions[i])
        }
        
    }
    
    preVote(tp){
        var stake =  this.db.get(`_voting/validators/${this.db.publicKey}`)
        var diff = {"_voting/preVotes": stake}
        this.db.increase(diff)
        this.status = VOTING_STATUS.PRE_VOTE
        console.log(`Current prevotes are ${this.db.db._voting.preVotes}`)
        var transaction =  this.db.createTransaction({type: "INCREASE", diff}, tp)
        this.registerValidatingTransaction(transaction)
        return transaction
    
    }

    isCommit(){
        console.log(`Checking status ${this.status}`)
        return  this.status !== VOTING_STATUS.COMMITTED && this.checkPreCommits()
    }

    reset(){
        this.status = VOTING_STATUS.COMMITTED
        this.block = null
        this.validatorTransactions.length = []
    }

    isSyncedWithNetwork(bc){
        // This does not currently take in to a count the situation where consensus is not reached.
        // Need to add logic to account for this situation
        const sync =  (VOTING_STATUS.COMMITTED === this.status && bc.height() + 1 === Number(this.db.get(`_voting/height`)))
        if (!sync){
            this.status = VOTING_STATUS.SYNCING
        }
        return sync
    }
    
    
    preCommit(tp){
        if (this.status !== VOTING_STATUS.PRE_VOTE){
            return null
        }
        var stake =  this.db.get(`_voting/validators/${this.db.publicKey}`)
        var diff = {"_voting/preCommits": stake}
        this.db.increase(diff)
        console.log(`Current precommits are ${this.db.db._voting.preCommits}`)
        this.status = VOTING_STATUS.PRE_COMMIT
        var transaction =  this.db.createTransaction({type: "INCREASE", diff}, tp)
        this.registerValidatingTransaction(transaction)
        return transaction

    }
    
    checkPreCommits(){
        var total  = Object.values(this.db.get("_voting/validators")).reduce(function(a, b) { return a + b; }, 0)
        console.log(`Total preCommits from validators : ${total}\nReceived preCommits ${this.db.get("_voting/preCommits")}`)
        return  (this.db.get("_voting/preCommits") > (total *.6666)) || total === 0
    }
    
    
    instantiate(bc, tp){
        console.log("Initialising voting !!")
        // This method should only be called by the very first node on the network !!
        // This user should establish themselves as the first node on the network, instantiate the first _voting entry t db
        // and commit this to the blockchain so it will be picked up by new peers on the network
        var time = Date.now()
        var firstVotingData = {validators: {}, next_round_validators: {}, threshold: 0, forger: this.db.publicKey, preVotes: 1, 
                                preCommits: 1, time, blockHash: "", height: bc.lastBlock().height + 1,  lastHash: bc.lastBlock().hash}
        this.db.set("_voting", firstVotingData)
        return this.db.createTransaction({type: "SET", ref: "_voting", value: firstVotingData}, tp)
    }
    
    
    startNewRound(tp, bc){
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
        // Writing permissions can be driven through the rules
        try{
            this.db.set("_voting", nextRound)
        } catch (InvalidPermissionsError){
            console.log(`${this.db.publicKey} does not have permission to start next round`)
            return null
        }
        
        return this.db.createTransaction({type: "SET", ref: "_voting", value: nextRound}, tp)
    }
    
    
    registerForNextRound(height, tp){
        var votingRound = this.db.get(`_voting`)
        console.log(`${height + 1} is the expected height and actual info is ${votingRound.height + 1}`)
        if (height !== votingRound.height){
            throw Error("Not valid height")
        }
    
        var ref = `_voting/next_round_validators/${this.db.publicKey}`
        var value = this.db.get(`stakes/${this.db.publicKey}`)
        this.db.set(ref, value)
        return this.db.createTransaction({type: "SET", ref, value}, tp)
    } 

    setBlock(block){
        console.log(`Setting block ${block.hash.substring(0, 5)} at height ${block.height}`)
        this.block = block
        this.status = VOTING_STATUS.BLOCK_RECEIVED
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
        throw Error("Chris your function is absolutely useless ! Sort your life out")
    }

    stake(stakeAmount, tp){
        this.db.stake(stakeAmount)
        console.log(`Successfully staked ${stakeAmount}`)
        return this.db.createTransaction({type: "SET", ref: ["stakes", this.db.publicKey].join("/"), value: stakeAmount}, tp)
    }

    isForger(){
        this.status = VOTING_STATUS.WAITING_FOR_BLOCK
        return this.db.get("_voting/forger") === this.db.publicKey
    }

    isValidator(){
        return Boolean(this.db.get(`_voting/validators/${this.db.publicKey}`))
    }

    writeSuccessfulForge(tp){
        var ref = `_recentForgers`
        var recentForgers = JSON.parse(JSON.stringify(this.db.get(ref)))
        if (recentForgers == null){
            recentForgers = []
        }
        else if (recentForgers.length == 20){
            recentForgers.shift()
        }

        if (recentForgers.indexOf(this.db.publicKey) >= 0){
            recentForgers.splice(recentForgers.indexOf(this.db.publicKey), 1)
        }
        recentForgers.push(this.db.publicKey)
        this.db.set(ref, recentForgers)
        return this.db.createTransaction({type: "SET", ref , value: recentForgers}, tp)
    }
    
}

module.exports = VotingUtil