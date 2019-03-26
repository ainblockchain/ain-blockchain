
const {Block, MinedBlock, ForgedBlock} = require('./block')
const {BLOCKCHAINS_DIR, METHOD} = require('../config') 
const rimraf = require("rimraf")
const path = require('path')
const fs = require('fs')
const zipper = require("zip-local")
const naturalSort = require("node-natural-sort")
const CHAIN_SUBSECT_LENGTH = 20

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
        return this.lastBlock().height
    }

    lastBlock(){
        return this.chain[this.chain.length -1]
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
        return  Blockchain.isValidChainSubsection(chain)
    }

    static isValidChainSubsection(chainSubSection){

        for(let i=1; i < chainSubSection.length; i++) {
            const block = chainSubSection[i];
            const lastBlock = chainSubSection[i - 1];
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
        for(var i=0; i< this.chain.length; i++){
            var file_path = this._path_to_block(i, this.chain[i])
            if (!(fs.existsSync(file_path))) {
                // Change to async implementation
                zipper.sync.zip(Buffer.from(JSON.stringify(this.chain[i]))).compress().save(file_path);
            }
        }
    }

    requestBlockchainSection(lastBlock){
        var blockFiles = Blockchain.getBlockFiles(this._blockchainDir())
        if (blockFiles[lastBlock.height].indexOf(`${lastBlock.height}-${lastBlock.lastHash.substring(0, 5)}-${lastBlock.hash.substring(0, 5)}`) < 0){
            console.log("Invalid blockchain request")
            return 
        }
        if (lastBlock.hash === this.lastBlock().hash){
            console.log("Requesters blockchain is up to date with this blockchain")
            return
        }

        const chainSectionFiles = blockFiles.slice(lastBlock.height, lastBlock.height + CHAIN_SUBSECT_LENGTH)
        const chainSubSection = []
        chainSectionFiles.forEach((blockFile) => {
            chainSubSection.push(ForgedBlock.loadBlock(blockFile))
        })
        return chainSubSection
    }

    merge(chainSubSection){
        // Call to shift here is important as it removes the first element from the list !!

        const firstBlock = chainSubSection.shift()
        if (this.lastBlock().hash !== ForgedBlock.blockHash(firstBlock) && this.lastBlock().hash !== Block.genesis().hash){
            console.log(`Hash ${this.lastBlock().hash.substring(0, 5)} does not equal ${ForgedBlock.blockHash(firstBlock).substring(0, 5)}`)
            return false
        }
        if (!Blockchain.isValidChainSubsection(chainSubSection)){
            console.log("Invalid chain subsection")
            return false
        }
        this.chain.push(...chainSubSection)
        return true
    }

    static loadChain(chain_path){
        var newChain = []
        var blockFiles =  Blockchain.getBlockFiles(chain_path)

        blockFiles.forEach(block => {
            newChain.push(MinedBlock.loadBlock(block))
        })

        if (Blockchain.isValidChain(newChain)){
            console.log(`Valid chain of size ${newChain.length}`)
            return newChain
        }
        console.log("Invalid chain")
        rimraf.sync(chain_path + "/*")
        return null
        
    }

    static getBlockFiles(chainPath){
        return fs.readdirSync(chainPath).sort(naturalSort()).map(fileName => path.resolve(chainPath, fileName))
    }
}

module.exports = Blockchain;