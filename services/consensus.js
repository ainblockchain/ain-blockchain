// All functions return either nothign or a transaction which is broadcast to the network

module.exports =  function services(db, blockchain, tp){
    const preCommitDep = []
    const recentForgerDep = []
    return {
        "_recentForgers": {
            "trigger": (transaction) => {
                    // First check if blockchain is synced with network
                    //Set the logic of how the next one will work
                    return db.createTransaction({type: "SET", ref, value}, tp, [transaction])
                },
        },
        "_voting": {
                "trigger": (transaction) => {
                        // First check if blockchain is synced with network
                        preCommitDep.length = 0
                        recentForgerDep.length = 0
                        if(blockchain.height() !== transaction.output._voting.height){
                            throw UnsyncedError('Blockchain height is not the same as maximuim height')
                        }
                        // Register for next round of validators
                        var ref = `_voting/next_round_validators/${db.publicKey}`
                        var value = db.get(`stakes/${this.db.publicKey}`)
                        return db.createTransaction({type: "SET", ref, value}, tp)
                    },

                "blockHash":{
                    "trigger": (transaction) => {
                        preVoteDep.push(transaction)
                        var block = blockchain.getProposedBlock(transaction.output._voting.blockHash)
                        // Verify block is valid
                        if (blockchain.isValidBlock(block)){
                            // Prevote for block
                            var stake =  db.get(`_voting/validators/${this.db.publicKey}`)
                            var diff = {"_voting/preVotes": stake}
                            // Append validating transaction to block so validators can be held accountable
                            var validatingTransaction =  db.createTransaction({type: "INCREASE", diff}, tp, [transaction])
                            return validatingTransaction
                        }
                    }
                }, 

                "preVotes":{
                    "trigger": (transaction) => {
                        preCommitDep.push(transaction)
                        // Add incoming validator Transaction to block
                        blockchain.getProposedBlock(transaction.output._voting.blockHash).addValidatingTransaction(transaction)
                        // If enough preVotes have been received and I have not already preCommitted
                        if (db.get('_voting/preVotes') > db.get("_voting/threshold") && db.get(`_voting/preCommits/${db.publicKey}`) == null){
                            // PreCommit for block
                            var stake =  db.get(`_voting/validators/${db.publicKey}`)
                            var diff = {"_voting/preCommits": stake}
                            // Append validating transaction to block so validators can be held accountable
                            var validatingTransaction =  db.createTransaction({type: "INCREASE", diff}, tp, preCommitDep)
                            return validatingTransaction
                        }   
                    }
                },
                "preCommits": {
                    "trigger": (transaction) => {
                        recentForgerDep.push(transaction)
                        // Add incoming validator Transaction to block
                        blockchain.getProposedBlock(transaction.output._voting.blockHash).addValidatingTransaction(transaction)
                        // If enough preVotes have been received and I have not already preCommitted
                        if (db.get('_voting/prCommits') > db.get("_voting/threshold") && db.get(`_voting/preCommits/${db.publicKey}`) == null){
                            // Commit Block
                            blockchain.addProposedBlock(transaction.output._voting.blockHash)
                            
                            // Allow yourself to start next round (this logic is kinda messty so maybe keep it in seperate class)
                            if (db.publicKey !== db.get("_voting/forger")){
                                var forgers = db.get('_recentForgers').append(db.publicKey)
                                return db.createTransaction({type: "SET", ref: '_recentForgers', value: forgers}, tp, recentForgerDep)
                            }
                        }   
                    }
                }
        }
    }
}
