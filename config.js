const path = require("path")
const RULES_FILE_PATH = path.resolve(__dirname, "db", "database.rules.json")
const BLOCKCHAINS_DIR = path.resolve(__dirname, "blockchain", ".blockchains")
const STAKE =  process.env.STAKE ? Number(process.env.STAKE) : null
const MESSAGE_TYPES = {
    transaction: "TRANSACTION",
    proposed_block: "PROPOSED_BLOCK",
    chain_subsection: "CHAIN_SUBSECTION",
    chain_subsection_request: "CHAIN_SUBSECTION_REQUEST",
    voting: "VOTING"

}

const VOTING_ACTION_TYPES = {
    transaction: "TRANSACTION",
    delayed_transaction: "DELAYED_TRANSACTION",
    propose_block: "PROPOSE_BLOCK",
    add_block: "ADD_BLOCK",
    request_chain_subsection: "REQUEST_CHAIN_SUBSECTION",
}

const START_UP_STATUS = {
    start_up: "START_UP",
    started: "STARTED"
}


module.exports = {RULES_FILE_PATH, 
    BLOCKCHAINS_DIR, 
    MESSAGE_TYPES, 
    VOTING_ACTION_TYPES,
    START_UP_STATUS,
    STAKE
}