const path = require("path")
const DIFFICULTY = 5
const MINE_RATE = 3000
const RULES_FILE_PATH = path.resolve(__dirname, "db", "database.rules.json")

module.exports = {DIFFICULTY, MINE_RATE, RULES_FILE_PATH}