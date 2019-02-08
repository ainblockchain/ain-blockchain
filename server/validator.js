const ChainUtil = require("../chain-util")
// Use an external library for now but we can definitely find another way round this later 
const shuffleSeed = require('shuffle-seed')
const seedrandom = require('seedrandom')

class Validator{

    constructor(db){
        this.db = db
    }

    getRankedValidators(lastBlock){
        var orderedValidators = []
        var stakeHolders = this.getStakeHolders()
        var alphabeticallyOrderedStakeHolders  = Object.keys(stakeHolders).sort()
        var totalStakedAmount = Object.values(stakeHolders).reduce(function(a, b) { return a + b; }, 0);
        var lastBlockHash = ChainUtil.hash(lastBlock)
        alphabeticallyOrderedStakeHolders = shuffleSeed.shuffle(alphabeticallyOrderedStakeHolders, lastBlockHash)
        var cumulativeStakeFromPotentialValidators = 0
        var randomNumGenerator = seedrandom(lastBlockHash)
        let targetValue
        for(var i = 0; i < Object.keys(stakeHolders).length; i++){
            targetValue = randomNumGenerator() * totalStakedAmount
            for (var stakeHolder in alphabeticallyOrderedStakeHolders){
                cumulativeStakeFromPotentialValidators += stakeHolders[alphabeticallyOrderedStakeHolders[stakeHolder]]
                if(targetValue < cumulativeStakeFromPotentialValidators){
                    orderedValidators.push(alphabeticallyOrderedStakeHolders[stakeHolder])
                    totalStakedAmount -= cumulativeStakeFromPotentialValidators
                    cumulativeStakeFromPotentialValidators = 0
                    alphabeticallyOrderedStakeHolders.splice(stakeHolder, 1)
                    break
                }
            }
        }
        return orderedValidators
    }

    getStakeHolders(){
        return this.db.get("stakes")
    }



}

module.exports = Validator 