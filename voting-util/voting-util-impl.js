// All functions return either nothign or a transaction which is broadcast to the network
const {VOTING_ACTION_TYPES, STAKE, START_UP_STATUS} = require("../config")
const VotingUtilHelper = require("./voting-util-helper")

 /**
 * Defines the list of functions which may be triggered in response to a voting Transaction 
 * 
 * @param {Blockchain} blockchain - Instance of the Blockchain class
 * @param {TransactionPool} transactionPool - Instance of the TransactionPool class
 * @return {dict} A closure of functions which will be invoked by writes to the specified 
 *                paths in the blockchain database by transactions marked as 'vote' transactions. 
 *                  
 */
module.exports =  function getVotiingUtilClosure(db, blockchain){

    const BLOCK_CREATION_INTERVAL = 6000
    const validatingTransactions = []
    var preVote = false
    var preCommit = false
    var blockCount = 3

    return {
        _recentForgers: {
             /**
             * Function that will be invoked when a vote transaction is made to '_recentForgers' path
             * 
             * @param {Transaction} transaction - Instance of the Transactio class 
             * @return {dict} VOTING_ACTION_TYPES dict which will either: 
             *                      - Specify a VOTING_ACTION_TYPES.delayed_transaction to indicate a new round should be started in 6 seconds
             *                      - Specify a VOTING_ACTION_TYPES.transaction which will stake an amount for POS if no stake has already been made
             */
            trigger(transaction){
                if(transaction.address === db.publicKey){
                    console.log("Starting new voting round in 6 second")
                    return {
                        type: VOTING_ACTION_TYPES.delayed_transaction,
                        transactionFunction: VotingUtilHelper.startNewRound,
                        delay: BLOCK_CREATION_INTERVAL
                    }
                } else if (blockCount > 0 * blockchain.status !== START_UP_STATUS.start_up){
                    blockCount -= 1
                    // If blockCount is 0, the peer has observed the process for 3 blocks and can not actively participate in voting
                    if (blockCount == 0){
                        return {
                            type: VOTING_ACTION_TYPES.transaction,
                            transaction: STAKE !== null ? db.createTransaction({type: "SET", ref: `stakes/${db.publicKey}`, value: STAKE}): null,
                            delay: BLOCK_CREATION_INTERVAL
                        }
                    }
                }
            },
        },
        _voting: {
             /**
             * Function that will be invoked when a vote transaction is made to '_voting' path
             * 
             * @param {Transaction} transaction - Instance of the TransactionPool class
             * @return {dict} VOTING_ACTION_TYPES dict which will either: 
             *                      - Specify a VOTING_ACTION_TYPES.request_chain_subsection to indicate that the current local blockchain is behind the consensus blockchain and 
             *                                  is requesting to sync with the network
             *                      - Specify a VOTING_ACTION_TYPES.transaction indicating that the validator node recognises that a new voting round has started, and that the current
             *                                  validator would like to register for the next round of voting
             */
            trigger(transaction){
                    console.log(`New voting round has been started by ${transaction.address}`)
                    // First check if blockchain is synced with network
                    preVote = false
                    preCommit = false
                    validatingTransactions.length = 0
                    if(blockchain.height() + 1 !== transaction.output.value.height){
                        return {
                            type: VOTING_ACTION_TYPES.request_chain_subsection
                        }
                    }

                    // Register for next round of validators
                    var ref = `_voting/next_round_validators/${db.publicKey}`
                    var value = db.get(`stakes/${db.publicKey}`)
                    if (value !== null) {
                        return {
                            type: VOTING_ACTION_TYPES.transaction,
                            transaction: db.createTransaction({type: "SET", ref, value})
                        }
                    }
                },

            blockHash:{
                /**
                 * Function that will be invoked when a vote transaction is made to '_voting/blockHash' path
                 * 
                 * @param {Transaction} transaction - Instance of the Transactio class 
                 * @return {dict} VOTING_ACTION_TYPES dict which will either: 
                 *                      - Specify a VOTING_ACTION_TYPES.transaction indicating a preVote for a valid block, if this node is a validator and has received a valid Block 
                 *                      - Specify a VOTING_ACTION_TYPES.transaction adding node publicKey to recentForgers, if this node is forger and there are no validators
                 */
                trigger(transaction){
                    console.log(`Block proposer  ${transaction.address} has proposed a new block`)
                    var block =  blockchain.getProposedBlock(transaction.output.value)
                    console.log(`Block is ${JSON.stringify(block)}`)
                    // If block is valid and you are only validator/  
                    if (block !== null && blockchain.isValidBlock(block) && block.hash === transaction.output.value && Boolean(db.get(`_voting/validators/${db.publicKey}`))){
                        // Prevote for block
                        var stake =  db.get(`_voting/validators/${db.publicKey}`)
                        var diff = {"_voting/preVotes": stake}
                        return {
                            type: VOTING_ACTION_TYPES.transaction,
                            transaction:  db.createTransaction({type: "INCREASE", diff})
                        }
                    } else if (Object.keys(db.get(`_voting/validators`)).length === 0){
                        return {
                            type: VOTING_ACTION_TYPES.add_block,
                            transaction: db.publicKey === db.get("_voting/forger") ?
                                db.createTransaction({type: "SET", ref: '_recentForgers', value: VotingUtilHelper.updateForgers(db)}) : null
                        }
                    }  
                }
            }, 

            preVotes:{
                /**
                 * Function that will be invoked when a vote transaction is made to '_voting/preVotes' path
                 * 
                 * @param {Transaction} transaction - Instance of the Transactio class 
                 * @return {dict} VOTING_ACTION_TYPES dict which will: 
                 *                      - Specify a VOTING_ACTION_TYPES.transaction indicating a preCommit for a valid block, 
                 *                                 if this node is a validator and the preVotes threshold has been exceeded 
                 */
                trigger(transaction){
                    console.log(`Prevote registered by ${transaction.address}`)
                    // Add incoming validator Transaction to block
                    validatingTransactions.push(transaction)
                    // If enough preVotes have been received and I have not already preCommitted
                    if (db.get('_voting/preVotes') > db.get("_voting/threshold") && db.get(`_voting/validators/${db.publicKey}`) !== null && !preVote){
                        // PreCommit for block
                        preVote = true
                        var stake =  db.get(`_voting/validators/${db.publicKey}`)
                        var diff = {"_voting/preCommits": stake}
                        // Append validating transaction to block so validators can be held accountable
                        return {
                            type: VOTING_ACTION_TYPES.transaction,
                            transaction:  db.createTransaction({type: "INCREASE", diff})
                        }
                    }   
                }
            },
            preCommits: {
                /**
                 * Function that will be invoked when a vote transaction is made to '_voting/preCommits' path
                 * 
                 * @param {Transaction} transaction - Instance of the Transactio class 
                 * @return {dict} VOTING_ACTION_TYPES dict which will either: 
                 *                      - Specify a VOTING_ACTION_TYPES.add_block indicating the proposed block should be added to the blockchain, 
                 *                                 if the preCommits threshold has been exceeded 
                 */
                trigger(transaction){
                    console.log(`PreCcommit registered by ${transaction.address}`)
                    validatingTransactions.push(transaction)
                    // If enough preVotes have been received and I have not already preCommitted
                    if (db.get('_voting/preCommits') > db.get("_voting/threshold") && !preCommit){
                        console.log(`Adding new block at height ${db.get("_voting/height")}`)
                        preCommit = true
                        // Commit Block
                        return {
                            type: VOTING_ACTION_TYPES.add_block,
                            transaction: db.publicKey === db.get("_voting/forger") ?
                                db.createTransaction({type: "SET", ref: '_recentForgers', value: VotingUtilHelper.updateForgers(db)}) : null,
                            validatingTransactions: JSON.parse(JSON.stringify(validatingTransactions))
                        }
                    }   
                }
            },
            next_round_validators: {
                $id: {
                    /**
                     * Function that will be invoked when a vote transaction is made to '_voting/next_round_validators' path
                     * 
                     * @param {Transaction} transaction - Instance of the Transactio class 
                     * @return {dict} VOTING_ACTION_TYPES dict which will either: 
                     *                      - Specify a VOTING_ACTION_TYPES.propose_block indicating that the current node is the forger for this round and should propose a blcok, 
                     *                                 if the node is the designated forger selected for this voting round
                     */
                    trigger(transaction) {
                        // next_round_validators transaction means that a new round of voting has begun
                        // If you are the forger, forge the block and publish the blockHash
                        console.log(`Registering ${transaction.address} for next round of voting`)
                        if (db.get('_voting/forger') === transaction.address &&  transaction.address  === db.publicKey){
                            return {
                                type: VOTING_ACTION_TYPES.propose_block
                            }
                        }  
                    }
                }
            }
        }
    }
}
