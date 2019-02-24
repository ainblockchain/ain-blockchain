
const getForger =  require('./validator')
const {ForgedBlock} = require('../blockchain/block')

function register(height, db, tp, lastHash){
    // Returns tranasaction to peers
    var votingRound = db.get(`_voting`)
    if (height !== votingRound.height){
        throw Error("Not valid height")
    }
    if(lastHash !== db.db["_voting"]["lastHash"]){
        throw Error(`Invalid ${lastHash}`)
    }
        var ref = `_voting/validators/${db.publicKey}`
        var value = db.get(`stakes/${db.publicKey}`)
        db.set(ref, value)
        return db.createTransaction({type: "SET", ref, value}, tp)
}

function checkPreVotes(db){
    var total  = Object.values(db.get("_voting/validators")).reduce(function(a, b) { return a + b; }, 0)
    return db.get("_voting/preVotes") > total *.6666
}

function preVote(db, tp){
    var stake =  db.get(`_voting/validators/${db.publicKey}`)
    var diff = {"_voting/preVotes": stake}
    db.increase(diff)
    return db.createTransaction({type: "INCREASE", diff}, tp)

}

function preCommit(db, tp){
    var stake =  db.get(`_voting/validators/${db.publicKey}`)
    var diff = {"_voting/preCommits": stake}
    db.increase(diff)
    return db.createTransaction({type: "INCREASE", diff}, tp)
}

function checkPreCommits(db){
    var total  = Object.values(db.get("_voting/validators")).reduce(function(a, b) { return a + b; }, 0)
    return db.get("_voting/preCommits") > total *.6666
}


function instantiate(db, genesis, tp){
    // This method should only be called by the very first node on the network !!
    // This user should establish themselves as the first node on the network, instantiate the first _voting entry t db
    // and commit this to the blockchain so it will be picked up by new peers on the network
    var time = Date.now()
    var firstVotingData = {height: 1, validators:{}, preVotes: 1, preCommits: 1, time, block: {hash: "noHash", forger: db.publicKey}, lastHash: genesis.hash}
    db.set("_voting", firstVotingData)
    return db.createTransaction({type: "SET", ref: "_voting", value: firstVotingData}, tp)
}

function checkIfFirstNode(db) {
    var votingRound = db.get("_voting")
    console.log(`Voting round is ${votingRound}`)
    return null === votingRound
}

function startNewRound(db, tp){
    var lastRound = db.get("_voting")
    var time = Date.now()
    let nextRound 
    if (checkPreCommits(db)){
        // Should be1
        nextRound =  {height: lastRound.height + 1, validators:{}, preVotes: 0, preCommits: 0, time, block: {}, lastHash: lastRound.block.hash}
    } else {
        // Start same round
        nextRound =  {height: lastRound.height, validators:{}, preVotes: 0, preCommits: 0, time, block: {}, lastHash: lastRound.lastHash}
    }
    // Writing permissions can be driven through the rules
    db.set("_voting", nextRound)
    return db.createTransaction({type: "SET", ref: "_voting", value: nextRound}, tp)
}





module.exports = {
    register,
    checkPreVotes,
    preVote,
    preCommit,
    checkPreCommits,
    startNewRound,
    instantiate,
    checkIfFirstNode,
    getForger
}
