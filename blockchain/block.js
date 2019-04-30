const ChainUtil = require('../chain-util')
const fs = require("fs")
const {RULES_FILE_PATH} = require('../config')
var zipper = require("zip-local")


class Block {

    constructor(timestamp, lastHash, hash, data){
        this.timestamp = timestamp
        this.lastHash = lastHash
        this.hash = hash
        this.data = data

    }

}

class ForgedBlock extends Block {


    constructor(timestamp, lastHash, hash, data, height, signature){  
        super(timestamp, lastHash, hash, data)
        this.height = height
        this.signature = signature
        
    }


    static forgeBlock(data, db, height, lastBlock){
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
            return ForgedBlock.genesis()
        }
        var unzippedfs = zipper.sync.unzip(blockZipFile).memory()
        var block_info = JSON.parse(unzippedfs.read(unzippedfs.contents()[0], "buffer").toString())
        return new this(block_info["timestamp"], block_info["lastHash"], block_info["hash"],
                        block_info["data"], block_info["height"], block_info["signature"])
    
    }

    static validateBlock(block, blockchain){
        
        if(block.height !== (blockchain.height() + 1)){
            console.log(`Height is not correct for block ${block.hash}. Expected: ${(blockchain.height() + 1)} Actual: ${block.height}`)
            return false
        } 
        const nonceTracker = {}
        let transaction

        for(var i=0; i<block.data.length; i++) {
            transaction = block.data[i]
            if (!(transaction.address in nonceTracker)){
                nonceTracker[transaction.address] = transaction.nonce
                continue
            }  
            
            if (transaction.nonce != nonceTracker[transaction.address] + 1){
                console.log(`Invalid noncing for ${transaction.address}. Expected ${nonceTracker[transaction.address] + 1}. Received ${transaction.nonce}`)
                return false
            }
            nonceTracker[transaction.address] = transaction.nonce


        }
        console.log(`Valid block at height ${block.height}`)
        return true
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
        const genesis = new this('Genesis time', '#####', 'f1r57-h45h', data, 0, );
        genesis.height = 0
        return genesis
    }

}

module.exports = {ForgedBlock};