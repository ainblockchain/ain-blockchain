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
        const data = []
        if (fs.existsSync(RULES_FILE_PATH)) {
            data.push({output: {type: "SET", ref: "rules", 
                                value: JSON.parse(fs.readFileSync(RULES_FILE_PATH))["rules"]}})
        }   
        return new this('Genesis time', '-----', 'f1r57-h45h', data, 0, DIFFICULTY);
    }

    static loadBlock(block_path){
        var block_info = fs.readFileSync(block_path.toString())
        block_info = JSON.parse(block_info)
        return new this(block_info["timestamp"], block_info["lastHash"], block_info["hash"],
                        block_info["data"], block_info["nonce"], block_info["difficulty"])
    }

    static mineBlock(lastBlock, data){
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