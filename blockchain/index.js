
const Block = require('./block');
const PATH_TO_DIR = require('path').dirname(__dirname) + "/blockchain/.blockchains"
const fs = require('fs')

class Blockchain{
    constructor(blockchain_dir){
        this.chain = [Block.genesis()];
        this.blockchain_dir = blockchain_dir
        this.createBlockchainDir()
        this.writeChain()
    }

    addBlock(data){
        const block = Block.mineBlock(this.chain[this.chain.length -1], data);
        this.chain.push(block);
        this.writeChain()
        return block;
    }

    static isValidChain(chain){
    
        if(JSON.stringify(chain[0]) !== JSON.stringify(Block.genesis())) return false
        for(let i =1; i < chain.length; i++) {
            const block = chain[i];
            const lastBlock = chain[i - 1];

            if(block.lastHash !== lastBlock.hash || block.hash !== Block.blockHash(block)){
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
        //this.writeChain()
        return true
    }

    _blockchainDir(){
        return PATH_TO_DIR + '/' + this.blockchain_dir
    }

    _path_to_block(blockNum){
        return this._blockchainDir() + "/block" + blockNum + ".json"
    }

    createBlockchainDir(){
        [PATH_TO_DIR, this._blockchainDir()].forEach((directory) => {
            if (!(fs.existsSync(directory))){
                fs.mkdirSync(directory);
            }
        })
    }


    writeChain(){
        for(var i=0; i< this.chain.length; i++){
            fs.writeFile(this._path_to_block(i), JSON.stringify(this.chain[i].toJson()), function(err){
                if (err) throw err;
            })
        }
    }

    static loadChain(chain_path){
        var newChain = []
        fs.readdirSync(chain_path).forEach(block => {
            newChain.push(Block.loadBlock(chain_path + "/" + block))
        })

        if (Blockchain.isValidChain(newChain)){
            console.log(`Valid chain of size ${newChain.length}`)
            return newChain
        }
        console.log("Invalid chain")
        return null
        
    }
}

module.exports = Blockchain;