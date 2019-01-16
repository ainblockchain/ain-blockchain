const {DIFFICULTY, MINE_RATE} = require("../config")
const ChainUtil = require('../chain-util')
const fs = require("fs")
const {RULES_FILE_PATH} = require('../config')


class Block {

    constructor(timestamp, lastHash, hash, data, nonce, difficulty){
        this.timestamp = timestamp
        this.lastHash = lastHash
        this.hash = hash
        this.data = data
        this.nonce = nonce
        this.difficulty = difficulty || DIFFICULTY

    }

    toString(){
        return `Block -
        Timestamp : ${this.timestamp}
        Last Hash : ${this.lastHash.substring(0, 10)}
        Hash      : ${this.hash.substring(0, 10)}
        Nonce     : ${this.nonce}
        Difficulty: ${this.difficulty}
        Data      : ${this.data}`;
    }

    static genesis(){
        // Gensis block will set all the rules for the database if any rules are
        // specified in the proj/database/database.rules.json 
        const data = []
        if (fs.existsSync(RULES_FILE_PATH)) {
            data.push({output: {type: "SET", ref: "rules", 
                                value: JSON.parse(fs.readFileSync(RULES_FILE_PATH))["rules"]}})
        }   
        return new this('Genesis time', '-----', 'f1r57-h45h', data, 0, DIFFICULTY);
    }

    static loadBlock(block_path){
        // Returns block stored at the file path provided by "block_path"
        var block_info = JSON.parse(fs.readFileSync(block_path.toString()))
        return new this(block_info["timestamp"], block_info["lastHash"], block_info["hash"],
                        block_info["data"], block_info["nonce"], block_info["difficulty"])
    }

    static mineBlock(lastBlock, data){
        // Adds a new block containing the "data" hp thd 
        const lastHash = lastBlock.hash;
        let nonce = 0;
        let hash, timestamp
        let {difficulty} = lastBlock
        do{
            nonce++
            timestamp = Date.now()
            difficulty = Block.adjustDifficulty(lastBlock, timestamp)
            hash = Block.hash(timestamp, lastHash, data, nonce, difficulty)
        } while(hash.substring(0, difficulty) !== '0'.repeat(difficulty));

        return new Block(timestamp, lastHash, hash, data, nonce, difficulty)
    }

    static hash(timestamp, lastHash, data, nonce, difficulty){
        return ChainUtil.hash(`${timestamp}${lastHash}${data}${nonce}${difficulty}`).toString();
    }

    static adjustDifficulty(lastBlock, currentTime) {
        // In order to keep mining occring at a consistent rate 
        // TODO: Allow for mining at inconsistent periods as this will cause bgs currently
        let {difficulty} = lastBlock;
        difficulty = lastBlock.timestamp + MINE_RATE > currentTime ? difficulty + 1 : difficulty - 1
        return difficulty 
    }

    static blockHash(block){
        const {timestamp, lastHash, data, nonce, difficulty} = block;
        return Block.hash(timestamp, lastHash, data, nonce, difficulty)
    }
}

module.exports = Block;