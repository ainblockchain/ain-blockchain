const path = require("path")
const DIFFICULTY = 5
const MINE_RATE = 5000
const RULES_FILE_PATH = path.resolve(__dirname, "db", "database.rules.json")
const BLOCKCHAINS_DIR = path.resolve(__dirname, "blockchain", ".blockchains")

module.exports = {DIFFICULTY, MINE_RATE, RULES_FILE_PATH, BLOCKCHAINS_DIR}