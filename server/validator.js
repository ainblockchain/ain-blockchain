// Use an external library for now but we can definitely find another way round this later 
const shuffleSeed = require('shuffle-seed')
const seedrandom = require('seedrandom')


function getForger(stakeHolders, bc){
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

module.exports = getForger