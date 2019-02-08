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
        this.preVotes = 0
        this.preCommits = 0
        this.newBlock = null 
        this.iteration = 0
    }

    getByzantineThreshold(){
        return Math.ceil(this.validators.map(validator => this.stakeHolders[validator]).reduce(function(a, b) { return Number(a) + Number(b); }, 0) * .66)
    }

    static getGenesisRound(){
        var genesisRound = new this(0, null, null, null)
        genesisRound.newBlock = Block.genesis()
        genesisRound.status = ROUND_STATUS.success
        return genesisRound

    }

    getNextRound(validator){
        if (this.status === "INCOMPLETE"){
            throw Error
        }
        let newRound
        if (this.status == ROUND_STATUS.success){
            newRound =  new BlockGenRound(this.height + 1, this.newBlock, validator.getRankedValidators(this.newBlock), validator.getStakeHolders())
        } else if (this.status == ROUND_STATUS.failure){
            newRound =  new BlockGenRound(this.height , this.lastBlock, validator.getRankedValidators(this.lastBlock),  validator.getStakeHolders())
        }   
        console.log(`Starting round at new height ${newRound.height}, with ${newRound.validators.length} stake holders `)
        return newRound
    }

    startNextIteration(){

        this.iteration++
        if (this.iteration >= this.validators.length){
            this.status = ROUND_STATUS.failure
            return
        }
        this.preCommits = 0
        this.preVotes = 0
        this.newBlock = null
    }

    havePreVotesBeenReceived(){
        return this.preVotes > this.getByzantineThreshold()
    }

    havePreCommitsBeenReceived(){
        return this.preCommits > this.getByzantineThreshold()
    }

    registerPreVote(address, preVote){
        // Note this is currently suseptable to double voting
        if (preVote && this.validators.indexOf(address) > -1){
            this.preVotes += Number(this.stakeHolders[address])
        }
    }

    registerPreCommit(address, preCommit){
        // Note this is currently suseptable to double voting
        if (preCommit && this.validators.indexOf(address) > -1){
            this.preCommits += Number(this.stakeHolders[address])
        }
    }

    validateAndAddBlock(block){
        let isValidBlock
        if (ChainUtil.verifySignature(this.validators[this.iteration], block.signature, ChainUtil.hash(block.data))){
            this.newBlock = block
            isValidBlock = true
        } else {
            isValidBlock = false
        }
        return isValidBlock

    }

}

module.exports = BlockGenRound