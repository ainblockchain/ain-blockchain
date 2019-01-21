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
    peers: "PEERS"
}

module.exports = {DIFFICULTY, MINE_RATE, RULES_FILE_PATH, BLOCKCHAINS_DIR, METHOD, MESSAGE_TYPES, FORGE_RATE}