const path = require("path")
const RULES_FILE_PATH = path.resolve(__dirname, "db", "database.rules.json")
const BLOCKCHAINS_DIR = path.resolve(__dirname, "blockchain", ".blockchains")
const MESSAGE_TYPES = {
    transaction: "TRANSACTION",
    proposed_block: "PROPOSED_BLOCK",
    pre_vote: "PRE_VOTE",
    pre_commit: "PRE_COMMIT",
    request_block: "REQUEST_BLOCK",
    requested_block: "REQUESTED_BLOCK",
    new_voting: "NEW_VOTING",
    chain_subsection: "CHAIN_SUBSECTION",
    chain_subsection_request: "CHAIN_SUBSECTION_REQUEST"

}

module.exports = {RULES_FILE_PATH, BLOCKCHAINS_DIR, MESSAGE_TYPES}