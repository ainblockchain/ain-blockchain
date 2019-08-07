
const {ForgedBlock} = require('./block')
const {BLOCKCHAINS_DIR} = require('../constants')
const rimraf = require("rimraf")
const path = require('path')
const fs = require('fs')
const zipper = require("zip-local")
const naturalSort = require("node-natural-sort")
const CHAIN_SUBSECT_LENGTH = 20

class Blockchain{

    constructor(blockchain_dir){
        this.chain = [ForgedBlock.genesis()];
        this.blockchain_dir = blockchain_dir
        this.backUpDB = null
        this._proposedBlock = null
        this.syncedAfterStartup = false
        let new_chain
        if(this.createBlockchainDir()){
            new_chain =  Blockchain.loadChain(this._blockchainDir())
            this.chain = new_chain ? new_chain: this.chain
        }
        this.writeChain()
    }

    setBackDb(backUpDB){
        if (this.backUpDB !== null){
            throw Error("Already set backupDB")
        }
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
        if (!(block instanceof ForgedBlock)){
            block =  ForgedBlock.parse(block)
        }

        this.chain.push(block)
        while (this.chain.length > 10){
            this.backUpDB.executeBlockTransactions(this.chain.shift())
        }
        this.writeChain()
    }


    static isValidChain(chain){
        if(JSON.stringify(chain[0]) !== JSON.stringify(ForgedBlock.genesis())) {
            console.log("first block not genesis")
            return false
        }
        return  Blockchain.isValidChainSubsection(chain)
    }

    static isValidChainSubsection(chainSubSection){

        for(let i=1; i < chainSubSection.length; i++) {
            const block = chainSubSection[i];
            const lastBlock = chainSubSection[i - 1];
            if(block.lastHash !== lastBlock.hash || block.hash !== ForgedBlock.blockHash(block)){
                console.log(`Invalid hashing for block ${block.height}`)
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

    _path_to_block(block){
        return path.resolve(this._blockchainDir(), ForgedBlock.getFileName(block))
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
        for(var i=this.chain[0].height; i<this.height() + 1; i++){
            var block = this.chain[i - this.chain[0].height]
            var file_path = this._path_to_block(block)
            if (!(fs.existsSync(file_path))) {
                // Change to async implementation
                zipper.sync.zip(Buffer.from(JSON.stringify(block))).compress().save(file_path);
            }
        }
    }

    /**
    * Returns a section of the chain up to a maximuim of length CHAIN_SUBSECT_LENGTH, starting from the index of the queired lastBLock
    *
    * @param {ForgedBlock} lastBlock - The current highest block tin the querying nodes blockchain 
    * @return {list} A list of ForgedBlock instances with lastBlock at index 0, up to a maximuim length CHAIN_SUBSECT_LENGTH
    */
    requestBlockchainSection(lastBlock) {
        console.log(`Current chain height: ${this.height()}: Requesters height ${lastBlock.height}\t hash ${lastBlock.lastHash.substring(0, 5)}`)
        var blockFiles = Blockchain.getBlockFiles(this._blockchainDir())
        if (blockFiles.length < lastBlock.height || blockFiles[lastBlock.height].indexOf(ForgedBlock.getFileName(lastBlock)) < 0){
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
        return chainSubSection.length > 0 ? chainSubSection: null
    }

    merge(chainSubSection){
        // Call to shift here is important as it removes the first element from the list !!
        console.log(`Current height before merge: ${this.height()}`)
        if (chainSubSection[chainSubSection.length - 1].height <= this.height()){
            console.log("Received chain is of lower height than current height")
            return false
        }
        const firstBlock = chainSubSection.shift()
        if (this.lastBlock().hash !== ForgedBlock.blockHash(JSON.parse(JSON.stringify(firstBlock))) && this.lastBlock().hash !== ForgedBlock.genesis().hash){
            console.log(`Hash ${this.lastBlock().hash.substring(0, 5)} does not equal ${ForgedBlock.blockHash(JSON.parse(JSON.stringify(firstBlock))).substring(0, 5)}`)
            return false
        }
        if (!Blockchain.isValidChainSubsection(chainSubSection)){
            console.log("Invalid chain subsection")
            return false
        }
        chainSubSection.forEach(block => this.addNewBlock(block))
        console.log(`Height after merge: ${this.height()}`)
        return true
    }

    static loadChain(chain_path){
        var newChain = []
        var blockFiles =  Blockchain.getBlockFiles(chain_path)

        blockFiles.forEach(block => {
            newChain.push(ForgedBlock.loadBlock(block))
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

    blockFiles(){
        return Blockchain.getBlockFiles(this._blockchainDir())
    }

    getChainSection(from, to){
        from = Number(from)
        to = to ? Number(to) : this.height()
        var chain = []
        if (from < this.chain[0].height){
            var blockFiles = this.blockFiles()
            var endPoint = to > blockFiles.length ? blockFiles.length: to
            for(var i = from; i < endPoint; i++){
                chain.push(ForgedBlock.loadBlock(blockFiles[i]))
            }
        } else {
            var endPoint = to > this.chain.length ? this.chain.length: to
            for(var i = from; i < endPoint; i++){
                chain.push(this.chain[i])
            }
        }
        return chain
    }

}

module.exports = Blockchain;