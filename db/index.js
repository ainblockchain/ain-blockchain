const ChainUtil = require('../chain-util')
const Transaction = require("./transaction")

class DB {

    constructor(){
        this.db = {}
        this.keyPair = ChainUtil.genKeyPair()
        this.publicKey = this.keyPair.getPublic().encode('hex')
    }

    get(ref){
        if (ref == '/') {
            return this.db
          }
        var result = this.db
        try{
            ref.split("/").forEach(function(key){
                result = result[key]
            })
        } catch (e) {
            console.log(e.message)
            return null
        }
        return result
    }

    set(ref, value){
        let value_copy
        if (ChainUtil.isDict(value)){
            value_copy = JSON.parse(JSON.stringify(value))
        } else {
            value_copy = value
        }
        if (ref == '/') {
            this.db = value_copy
        } else if (!ref.includes("/")) {
            this.db[ref] = value_copy
        } else {
            var path_to_key = ref.substring(0, ref.lastIndexOf("/"))
            var ref_key = ref.substring(ref.lastIndexOf("/") + 1, ref.length)
            this._force_path(path_to_key)[ref_key] = value_copy
        } 
    }

    _force_path(db_path){
        // Returns reference to provided path if exists, otherwise creates path
        var sub_db = this.db
        db_path.split("/").forEach((key) => {
            if ((!ChainUtil.isDict(sub_db[key])) || (!(key in sub_db))) {
                sub_db[key] = {}
            }
            sub_db = sub_db[key]
        })
        return sub_db
    }

    increase(diff){
        for (var k in diff) {
            if (this.get(k) && typeof this.get(k) != 'number') {
                return {code: -1, error_message: "Not a number type: " + k}
            }
        }
        var result = {}
        for (var k in diff) {
            this.set(k, (this.get(k) || 0) + diff[k])
            result[k] = this.get(k)
        }
        return {code: 0, result: result}
    }

    createTransaction(data, transactionPool){
        let transaction = Transaction.newTransaction(this, data)
        transactionPool.addTransaction(transaction)
        return transaction
    }

    sign(dataHash) {
        return this.keyPair.sign(dataHash)
    }

    createDatabase(blockchain){
        this.db = {}
        let outputs = []
        blockchain.chain.forEach(block => block.data.forEach(transaction => {
            outputs.push(transaction.output)
        }))
        console.log(outputs)
        outputs.forEach(output => {
            switch(output.type){
                case "SET":
                    this.set(output.ref, output.value)
                    break
                case "INCREASE": {
                    this.increase(output.diff)
                    break
                }
            }
        })
    }
}

module.exports = DB

