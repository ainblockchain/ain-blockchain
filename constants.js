const path = require("path")
const RULES_FILE_PATH = path.resolve(__dirname, "db", "database.rules.json")
const BLOCKCHAINS_DIR = path.resolve(__dirname, "blockchain", ".blockchains")
const STAKE =  process.env.STAKE ? Number(process.env.STAKE) : null
const MESSAGE_TYPES = {
    transaction: "TRANSACTION",
    chain_subsection: "CHAIN_SUBSECTION",
    chain_subsection_request: "CHAIN_SUBSECTION_REQUEST",
    voting: "VOTING"
}

const VOTING_ACTION_TYPES = {
    new_voting: "NEW_VOTING",
    proposed_block: "PROPOSED_BLOCK",
    pre_vote: "PRE_VOTE",
    pre_commit: "PRE_COMMIT",
}

const VOTING_STATUS = {
    wait_for_block: "WAIT_FOR_BLOCK",
    block_received: "BLOCK_RECEIVED",
    pre_vote: "PRE_VOTE",
    pre_commit: "PRE_COMMIT",
    committed: "COMMITTED",
    syncing: "SYNCING",
    start_up: "START_UP"
}

const START_UP_STATUS = {
    start_up: "START_UP",
    started: "STARTED"
}

const CONSENSUS_DB_KEYS = {
    recent_forgers_path: "_recentForgers",
    voting_round_path: "_voting",
    voting_round_validators_path: "_voting/validators/",
    voting_round_forger_path: "_voting/forger",
    voting_round_pre_commits_path: "_voting/preCommits",
    voting_round_pre_votes_path: "_voting/preVotes",
    voting_round_threshold_path: "_voting/threshold",
    voting_round_height_path: "_voting/height",
    stakeholder_path : "stakes",
    voting_round_block_hash_path: "_voting/blockHash"

}

module.exports = {RULES_FILE_PATH, 
    BLOCKCHAINS_DIR, 
    MESSAGE_TYPES, 
    VOTING_STATUS,
    START_UP_STATUS,
    STAKE,
    VOTING_ACTION_TYPES,
    CONSENSUS_DB_KEYS
}