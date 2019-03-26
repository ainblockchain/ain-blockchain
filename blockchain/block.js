const {DIFFICULTY, MINE_RATE, METHOD} = require("../config")
const ChainUtil = require('../chain-util')
const fs = require("fs")
const {RULES_FILE_PATH} = require('../config')
var zipper = require("zip-local")


class Block {

    constructor(timestamp, lastHash, hash, data, nonce, difficulty){
        this.timestamp = timestamp
        this.lastHash = lastHash
        this.hash = hash
        this.data = data
        this.nonce = nonce !== undefined ? nonce : -1
        this.difficulty = difficulty !== undefined ? (difficulty || DIFFICULTY) : -1

    }

    toString(){
        return `Block -
        Timestamp : ${this.timestamp}
        Last Hash : ${this.lastHash.substring(0, 10)}
        Hash      : ${this.hash.substring(0, 10)}
        Data      : ${this.data}`;
    }

    static genesis(){
        // Genesis block will set all the rules for the database if any rules are
        // specified in the proj/database/database.rules.json 
        const data = []
        // Hack here to simulate a transaction for the initial setting of rules
        if (fs.existsSync(RULES_FILE_PATH)) {
            data.push({output: {type: "SET", ref: "rules", 
                                value: JSON.parse(fs.readFileSync(RULES_FILE_PATH))["rules"]}, address: null})
        }   
        // Change this to use 
        const genesis = new this('Genesis time', '#####', 'f1r57-h45h', data, 0);
        genesis.height = 0
        return genesis
    }

}

class MinedBlock extends Block {

    constructor(timestamp, lastHash, hash, data, nonce, difficulty){
        super(timestamp, lastHash, hash, data)
        this.nonce = nonce 
        this.difficulty = difficulty || DIFFICULTY 

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
            difficulty = MinedBlock.adjustDifficulty(lastBlock, timestamp)
            hash = MinedBlock.hash(timestamp, lastHash, data, nonce, difficulty)
        } while(hash.substring(0, difficulty) !== '0'.repeat(difficulty));

        return new MinedBlock(timestamp, lastHash, hash, data, nonce, difficulty)
    }

    static adjustDifficulty(lastBlock, currentTime) {
        // In order to keep mining occring at a consistent rate 
        // TODO: Allow for mining at inconsistent periods as this will cause bgs currently
        let {difficulty} = lastBlock;
        difficulty = lastBlock.timestamp + MINE_RATE > currentTime ? difficulty + 1 : difficulty - 1
        return difficulty > 0 ? difficulty : 1
    }


    static blockHash(block){
        const {timestamp, lastHash, data, nonce, difficulty} = block;
        return MinedBlock.hash(timestamp, lastHash, data, nonce, difficulty)
    }

    static hash(timestamp, lastHash, data, nonce, difficulty){
        return ChainUtil.hash(`${timestamp}${lastHash}${data}${nonce}${difficulty}`).toString();
    }

    static loadBlock(block_path){
        // Returns block stored at the file path provided by "block_path"
        var unzippedfs = zipper.sync.unzip(block_path).memory()
        var block_info = JSON.parse(unzippedfs.read(unzippedfs.contents()[0], "buffer").toString())
        return new this(block_info["timestamp"], block_info["lastHash"], block_info["hash"],
                        block_info["data"], block_info["nonce"], block_info["difficulty"])
    }

}

class ForgedBlock extends Block {


    constructor(timestamp, lastHash, hash, data, height, signature){  
        super(timestamp, lastHash, hash, data)
        this.height = height
        this.signature = signature
        
    }


    static _forgeBlock(data, db, height, lastBlock){
        var lastHash = lastBlock.hash
        var timestamp = Date.now()
        var signature = db.sign(ChainUtil.hash(data))
        var hash = ForgedBlock.hash(timestamp, lastHash, data, height, signature)       
        return new ForgedBlock(timestamp, lastHash, hash, data, height, signature)
    }
    

    static blockHash(block){
        const {timestamp, lastHash, data, height, signature} = block;
        return ForgedBlock.hash(timestamp, lastHash, data, height, signature) 
    }

    static hash(timestamp, lastHash, data, height, signature){
        return ChainUtil.hash(`${timestamp}${lastHash}${data}${height}${signature}`).toString();
    }

    toString(){
        return `Block -
        Timestamp : ${this.timestamp}
        Last Hash : ${this.lastHash.substring(0, 10)}
        Hash      : ${this.hash.substring(0, 10)}
        Data      : ${this.data}
        Height    : ${this.height}`;
    }

    static loadBlock(blockZipFile){ 
        // Hack to return global genesis. Need to return separate genesis blocks for mined and forged implementations
        if (blockZipFile.indexOf("0-#####-f1r57") >= 0){
            return Block.genesis()
        }
        var unzippedfs = zipper.sync.unzip(blockZipFile).memory()
        var block_info = JSON.parse(unzippedfs.read(unzippedfs.contents()[0], "buffer").toString())
        return new this(block_info["timestamp"], block_info["lastHash"], block_info["hash"],
                        block_info["data"], block_info["height"], block_info["signature"])
    
    }

}

module.exports = {Block, MinedBlock, ForgedBlock};