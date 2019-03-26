const path = require("path")
const DIFFICULTY = 5
const MINE_RATE = 5000
const RULES_FILE_PATH = path.resolve(__dirname, "db", "database.rules.json")
const BLOCKCHAINS_DIR = path.resolve(__dirname, "blockchain", ".blockchains")
const METHOD = "POS"
const FORGE_RATE = 10
const MESSAGE_TYPES = {
    chain: "CHAIN",
    transaction: "TRANSACTION",
    clear_transactions: "CLEAR_TRANSACTIONS",
    server_register : "SERVER_REGISTER",
    forge: "FORGE",
    peers: "PEERS",
    proposed_block: "PROPOSED_BLOCK",
    pre_vote: "PRE_VOTE",
    pre_commit: "PRE_COMMIT",
    request_block: "REQUEST_BLOCK",
    requested_block: "REQUESTED_BLOCK",
    request_sync: "REQUEST_SYNC",
    new_voting: "NEW_VOTING",
    chain_subsection: "CHAIN_SUBSECTION",
    chain_subsection_request: "CHAIN_SUBSECTION_REQUEST"

}

module.exports = {DIFFICULTY, MINE_RATE, RULES_FILE_PATH, BLOCKCHAINS_DIR, METHOD, MESSAGE_TYPES, FORGE_RATE}