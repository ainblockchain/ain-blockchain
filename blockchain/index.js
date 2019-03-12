
const {Block, MinedBlock, ForgedBlock} = require('./block')
const {BLOCKCHAINS_DIR, METHOD} = require('../config') 
const rimraf = require("rimraf")
const path = require('path')
const fs = require('fs')


class Blockchain{
    constructor(blockchain_dir){
        this.chain = [Block.genesis()];
        this.blockchain_dir = blockchain_dir
        let new_chain
        if(this.createBlockchainDir()){
            new_chain =  Blockchain.loadChain(this._blockchainDir())
            this.chain = new_chain ? new_chain: this.chain
        }
        this.writeChain()
    }

    height(){
        return this.chain.length
    }

    addNewBlock(block){
        if (block.height != this.chain.length){
            throw Error("Blockchain height is wrong")
        }
        this.chain.push(block);
        this.writeChain()
    }

    addBlock(data){
        let block
        // Now supporting POW and POS implementations
        block = MinedBlock.mineBlock(this.chain[this.chain.length -1], data);
        this.chain.push(block);
        this.writeChain()
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
        return BLOCKCHAINS_DIR + '/' + this.blockchain_dir
    }

    _path_to_block(blockNum, blockHash){
        return this._blockchainDir() + "/block" + blockNum + "-" + blockHash.substring(0, 5) + ".json"
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
        for(var i=0; i< this.chain.length; i++){
            if (!(fs.existsSync(this._path_to_block(i, this.chain[i].hash)))) {
                fs.writeFile(this._path_to_block(i, this.chain[i].hash), JSON.stringify(this.chain[i]), function(err){
                    if (err) throw err;
                })
            }
        }
    }

    static loadChain(chain_path){
        var newChain = []
        var blockFiles =  fs.readdirSync(chain_path)
        blockFiles.sort(function(file1, file2) {
            return fs.statSync(path.resolve(chain_path, file1)).mtime.getTime() - 
                   fs.statSync(path.resolve(chain_path, file2)).mtime.getTime();
        });
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