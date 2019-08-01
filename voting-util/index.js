const ChainUtil = require('../chain-util')
const getVotiingUtilClosure = require("./voting-util-impl")
const {STAKE} = require('../config')

class VotingUtil {

    constructor(db, blockchain) {
        this.votingUtilImpl = getVotiingUtilClosure(db, blockchain) 
    }

    execute(transaction){
        let functionPath
        switch(transaction.output.type){
            case "SET":
                functionPath = transaction.output.ref
                break
            case "INCREASE":
                functionPath = Object.keys(transaction.output.diff)[0]
                break
        }

        functionPath = ChainUtil.queryParser(functionPath)
        var func =  this.votingUtilImpl
        try{
            functionPath.forEach(function(key){
                if (!(key in func)){
                    for(var wildKey in func){
                        if (wildKey.startsWith("$")) {
                            key = wildKey
                            break
                        }
                    }
                }
                func = func[key]
            })
        } catch (error) {
            console.log(`No function for path ${functionPath}`)
            return null
        }
        var votingAction = null
        if (typeof func !=="undefined" && "trigger" in func){
            votingAction = func.trigger(transaction)
        } 
        return typeof votingAction == "undefined" ?  null : votingAction
    }

    initiate(p2pServer){
        console.log("Initialising voting !!")
        // This method should only be called by the very first node on the network !!
        // This user should establish themselves as the first node on the network, instantiate the first _voting entry t db
        // and commit this to the blockchain so it will be picked up by new peers on the network
        const stakeTransaction = p2pServer.db.createTransaction({type: "SET", ref: `stakes/${p2pServer.db.publicKey}`, value: STAKE})
        p2pServer.executeAndBroadcastTransaction(stakeTransaction, false)
        var firstVotingData = {validators: {}, next_round_validators: {}, threshold: -1, forger: p2pServer.db.publicKey, preVotes: 1, 
                                 preCommits: 1, time: Date.now(), blockHash: "", height: p2pServer.blockchain.lastBlock().height + 1,  lastHash: p2pServer.blockchain.lastBlock().hash}
        const initVotingTransaction = p2pServer.db.createTransaction({type: "SET", ref: `_voting`, value: firstVotingData})
        p2pServer.executeAndBroadcastVotingTransaction(initVotingTransaction)
    }
}

module.exports = VotingUtil;
