const shuffleSeed = require('shuffle-seed')
const seedrandom = require('seedrandom')

class VotingUtilHelper {

    static updateForgers(db){
        
        var recentForgers = JSON.parse(JSON.stringify(db.get("_recentForgers")))

        if (recentForgers == null){
            recentForgers = []
        }
        else if (recentForgers.length == 20){
            recentForgers.shift()
        }
    
        if (recentForgers.indexOf(db.publicKey) >= 0){
            recentForgers.splice(recentForgers.indexOf(db.publicKey), 1)
        }
        recentForgers.push(db.publicKey)
        return recentForgers
    }
    
    static getForger(bc, stakeHolders){

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
        throw Error("Function failed to select forger")
    }
    
    static startNewRound(bc, db){
        
        var lastRound = db.get("_voting") 
        var time = Date.now()
        let forger
        if (Object.keys(lastRound.next_round_validators).length){
            forger = VotingUtilHelper.getForger(bc, lastRound.next_round_validators)
            delete lastRound.next_round_validators[forger]
        } else{
            forger = db.publicKey
        }
        var threshold = Math.round(Object.values(lastRound.next_round_validators).reduce(function(a, b) { return a + b; }, 0) * .666) - 1
        var nextRound = {validators: lastRound.next_round_validators, next_round_validators:{}, threshold, forger:forger, preVotes: 0, preCommits: 0, time, blockHash: null}
        if (lastRound.preCommits > lastRound.threshold){
            // Begin new round
            nextRound =  Object.assign({}, nextRound, {height: lastRound.height + 1, lastHash: lastRound.blockHash})
        } else {
            // Start same round
            nextRound =  Object.assign({}, nextRound, {height: lastRound.height,  lastHash: lastRound.lastHash})
        }
        return db.createTransaction({type: "SET", ref: "_voting", value: nextRound})
    } 
}

module.exports = VotingUtilHelper