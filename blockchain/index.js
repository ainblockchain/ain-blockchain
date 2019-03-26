
const {Block, MinedBlock, ForgedBlock} = require('./block')
const {BLOCKCHAINS_DIR, METHOD} = require('../config') 
const rimraf = require("rimraf")
const path = require('path')
const fs = require('fs')
const zipper = require("zip-local")
const naturalSort = require("node-natural-sort")

class Blockchain{
    constructor(blockchain_dir){
        this.chain = [Block.genesis()];
        this.blockchain_dir = blockchain_dir
        this.backUpDB = null
        let new_chain
        if(this.createBlockchainDir()){
            new_chain =  Blockchain.loadChain(this._blockchainDir())
            this.chain = new_chain ? new_chain: this.chain
        }
        this.writeChain()
    }

    setBackDb(backUpDB){
        this.backUpDB = backUpDB
    }

    height(){
        return this.chain[this.chain.length -1].height
    }

    addNewBlock(block){
        if (block.height != this.height() + 1){
            throw Error("Blockchain height is wrong")
        }
        this.chain.push(block)
        this.writeChain()
    }

    addBlock(data){
        let block
        // Now supporting POW and POS implementations
        block = MinedBlock.mineBlock(this.chain[this.chain.length -1], data);
        this.chain.push(block);
        this.writeChain()
        while (this.chain.length > 50){
            this.backUpDB.executeBlockTransactions(this.chain.splice(0, 1)[0])
        }
        return block;
    }


    static isValidChain(chain){
        if(JSON.stringify(chain[0]) !== JSON.stringify(Block.genesis())) {
            console.log("first block not genesis")
            return false
        }
        for(let i =1; i < chain.length; i++) {
            const block = chain[i];
            const lastBlock = chain[i - 1];
``
            if(block.lastHash !== lastBlock.hash || block.hash !== (METHOD === "POW" ? MinedBlock.blockHash(block): ForgedBlock.blockHash(block))){
                console.log(`Invalid hashing for block ${i}`)
                return false;
            }
        }
        return true 
    }

    replaceChain(newChain){
        // This operation is too slow !!!!! must speed up !!!!!!

        if (newChain.length <= this.chain.length){
            console.log('Received chain is not longer than current chain')
            return false;
        } else if (! Blockchain.isValidChain(newChain)){
            console.log('Received chain is not valid')
            return false;
        }

        console.log('Replacing blockchain with the new chain');
        this.chain = newChain;
        this.writeChain()
        return true
    }

    _blockchainDir(){
        return path.resolve(BLOCKCHAINS_DIR, this.blockchain_dir)
    }

    _path_to_block(blockNum, block){
        return path.resolve(this._blockchainDir(),`${blockNum}-${block.lastHash.substring(0, 5)}-${block.hash.substring(0, 5)}.json.zip`)
    }

    createBlockchainDir(){
        var alreadyExists = true
        var dirs = [BLOCKCHAINS_DIR, this._blockchainDir()]
        dirs.forEach((directory) => {
            if (!(fs.existsSync(directory))){
                fs.mkdirSync(directory);
                alreadyExists = false
            }
        })
        return alreadyExists
    }

    writeChain(){ 
        for(var i=1; i< this.chain.length; i++){
            var file_path = this._path_to_block(i, this.chain[i])
            if (!(fs.existsSync(file_path))) {
                // Change to async implementation
                zipper.sync.zip(Buffer.from(JSON.stringify(this.chain[i]))).compress().save(file_path);
            }
        }
    }

    static loadChain(chain_path){
        var newChain = []
        var blockFiles =  fs.readdirSync(chain_path).sort(naturalSort())

        blockFiles.forEach(block => {
            newChain.push(MinedBlock.loadBlock(chain_path + "/" + block))
        })

        if (Blockchain.isValidChain(newChain)){
            console.log(`Valid chain of size ${newChain.length}`)
            return newChain
        }
        console.log("Invalid chain")
        rimraf.sync(chain_path + "/*")
        return null
        
    }
}

module.exports = Blockchain;