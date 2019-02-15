const {Block} = require("../blockchain/block")
const ChainUtil = require("../chain-util")

const ROUND_STATUS = {
    incomplete: "INCOMPLETE",
    success: "SUCCESS",
    failure: "FAILURE"
}

class BlockGenRound {

    constructor(height, lastBlock, validators, stakeHolders){
        this.validators =  validators
        this.stakeHolders = stakeHolders
        this.height = height
        this.lastBlock = lastBlock
        this.status = ROUND_STATUS.incomplete
        this.preCommitVoters = []
        this.preVoteVoters = []
        this.preVotes = 0
        this.preCommits = 0
        this.newBlock = null 
        this.iteration = 0
        this.timestamp = Date.now()
    }

    toString(){
        return `
        Status           :${this.status}
        Height           :${this.height}
        PreCommitVoters  :${this.preCommitVoters.length}
        PreVoteVoters    :${this.preVoteVoters.length}
        PreCommits       :${this.preCommits}
        PreVotes         :${this.preVotes}  
        NewBlock         :${this.newBlock ? this.newBlock.hash: null}
        LastBlock        :${this.lastBlock ? this.lastBlock.hash: null}
        Timestamp        :${this.timestamp}
        Iteration        :${this.iteration}          
        `
    }

    getByzantineThreshold(){
        return Math.ceil(this.validators.map(validator => this.stakeHolders[validator]).reduce(function(a, b) { return Number(a) + Number(b); }, 0) * .66)
    }

    static getGenesisRound(){
        var genesisRound = new this(0, null, null, [])
        genesisRound.newBlock = Block.genesis()
        genesisRound.status = ROUND_STATUS.success
        return genesisRound

    }

    getNextRound(validator){
        console.log(`Last voting round was ${this.toString()}`)
        if (this.status === "INCOMPLETE"){
            throw Error
        }
        let newRound
        if (this.status == ROUND_STATUS.success){
            console.log(`Round ${this.height} was successful`)
            newRound =  new BlockGenRound(this.height + 1, this.newBlock, validator.getRankedValidators(this.newBlock), validator.getStakeHolders())
        } else if (this.status == ROUND_STATUS.failure){
            console.log(`Round ${this.height} was a failure`)
            newRound =  new BlockGenRound(this.height , this.lastBlock, validator.getRankedValidators(this.lastBlock),  validator.getStakeHolders())
        }   
        console.log(`Starting round at new height ${newRound.height}, with ${newRound.validators.length} stake holders and last block ${newRound.lastBlock.hash}`)
        return newRound
    }

    startNextIteration(){
        console.log(`Last voting iteration was ${this.toString()}`)
        this.iteration++

        if (this.iteration >= this.validators.length){
            this.status = ROUND_STATUS.failure
            return
        } else if (this.status != ROUND_STATUS.incomplete){
            console.log(`Already finished with status ${this.status}`)
            return
        }
        this.preCommits = 0
        this.preVotes = 0
        this.preCommitVoters = []
        this.preVoteVoters = []
        this.newBlock = null
        this.timestamp = Date.now()
    }

    havePreVotesBeenReceived(){
        return this.preVotes > this.getByzantineThreshold()
    }

    havePreCommitsBeenReceived(){
        return this.preCommits > this.getByzantineThreshold()
    }

    registerPreVote(address, preVote){
        // Note this is currently suseptable to double voting
        if (preVote && this.validators.indexOf(address) > -1 && this.preVoteVoters.indexOf(address) < 0){
            this.preVotes += Number(this.stakeHolders[address])
            this.preVoteVoters.push(address)
            console.log(`Registering pre vote from ${address} for block ${this.newBlock}`)
        }
    }

    registerPreCommit(address, preCommit){
        // Note this is currently suseptable to double voting
        if (preCommit && this.validators.indexOf(address) > -1 && this.preCommitVoters.indexOf(address) < 0){
            this.preCommits += Number(this.stakeHolders[address])
            this.preCommitVoters.push(address)
            console.log(`Registering commit vote from ${address} for block ${this.newBlock}`)
        }
    }

    validateAndAddBlock(block){

        if (block.height != this.height){
            console.log(`Block height ${block.height} not equal to round height ${this.height}`)
            return false
        }  
        if(!ChainUtil.verifySignature(this.validators[this.iteration], block.signature, ChainUtil.hash(block.data))){
            console.log(`Signature not from designated sender ${this.validators[this.iteration].substring(0,10)}`)
            return false
        } 
        this.newBlock = block
        console.log(`Valid block received`)
        return true

    }

}

module.exports = BlockGenRound