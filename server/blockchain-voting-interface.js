
const {getForger} =  require('./validator')

function checkPreVotes(db){
    var total  = Object.values(db.get("_voting/validators")).reduce(function(a, b) { return a + b; }, 0)
    console.log(`Total preVotes from validators : ${total}\nReceived preVotes ${db.get("_voting/preVotes")}`)
    return (db.get("_voting/preVotes") > (total *.6666)) || total === 0
}

function preVote(db, tp, votingHelper){
    var stake =  db.get(`_voting/validators/${db.publicKey}`)
    var diff = {"_voting/preVotes": stake}
    db.increase(diff)
    votingHelper.votingStage = "pre_vote"
    console.log(`Current prevotes are ${db.db._voting.preVotes}`)
    return db.createTransaction({type: "INCREASE", diff}, tp)

}

function preCommit(db, tp){
    var stake =  db.get(`_voting/validators/${db.publicKey}`)
    var diff = {"_voting/preCommits": stake}
    db.increase(diff)
    console.log(`Current precommits are ${db.db._voting.preCommits}`)
    return db.createTransaction({type: "INCREASE", diff}, tp)
}

function checkPreCommits(db){
    var total  = Object.values(db.get("_voting/validators")).reduce(function(a, b) { return a + b; }, 0)
    console.log(`Total preCommits from validators : ${total}\nReceived preCommits ${db.get("_voting/preCommits")}`)
    return  (db.get("_voting/preCommits") > (total *.6666)) || total === 0
}


function instantiate(db, genesis, tp){
    // This method should only be called by the very first node on the network !!
    // This user should establish themselves as the first node on the network, instantiate the first _voting entry t db
    // and commit this to the blockchain so it will be picked up by new peers on the network
    var time = Date.now()
    var firstVotingData = {validators: {}, next_round_validators: {}, forger:db.publicKey, preVotes: 1, preCommits: 1, time, blockHash: "", height: 1,  lastHash: genesis.hash}
    db.set("_voting", firstVotingData)
    return db.createTransaction({type: "SET", ref: "_voting", value: firstVotingData}, tp)
}

function checkIfFirstNode(db) {
    var votingRound = db.get("_voting")
    console.log(`Voting round is ${votingRound}`)
    return null === votingRound
}

function startNewRound(db, tp, bc){
    var lastRound = db.get("_voting")
    var time = Date.now()
    let forger
    if (Object.keys(lastRound.next_round_validators).length){
        forger = getForger(lastRound.next_round_validators, bc)
        delete lastRound.next_round_validators[forger]
    } else{
        forger = db.publicKey
    }
    var nextRound = {validators: lastRound.next_round_validators, next_round_validators:{}, forger:forger, preVotes: 0, preCommits: 0, time, blockHash: null}
    if (checkPreCommits(db)){
        // Should be1
        nextRound =  Object.assign({}, nextRound, {height: lastRound.height + 1, lastHash: lastRound.blockHash})
    } else {
        // Start same round
        nextRound =  Object.assign({}, nextRound, {height: lastRound.height,  lastHash: lastRound.lastHash})
    }
    // Writing permissions can be driven through the rules
    db.set("_voting", nextRound)
    return db.createTransaction({type: "SET", ref: "_voting", value: nextRound}, tp)
}


function registerForNextRound(height, db, tp){
    var votingRound = db.get(`_voting`)
    console.log(`${height + 1} is the expected height and actual info is ${votingRound.height + 1}`)
    if (height !== votingRound.height){
        throw Error("Not valid height")
    }

    var ref = `_voting/next_round_validators/${db.publicKey}`
    var value = db.get(`stakes/${db.publicKey}`)
    db.set(ref, value)
    return db.createTransaction({type: "SET", ref, value}, tp)
}




module.exports = {
    checkPreVotes,
    preVote,
    preCommit,
    checkPreCommits,
    startNewRound,
    instantiate,
    checkIfFirstNode,
    getForger,
    registerForNextRound
}
