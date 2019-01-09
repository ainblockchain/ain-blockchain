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

        var result = this.db;
        ref.split("/").forEach(function(key){
        result = result[key];
        });
        return result
    }

    set(ref, value){
        if (ref == '/') {
            ref = value
          } else {
            this.db[ref] = value
          }
    }

    increase(diff){
        for (var k in diff) {
            if (this.db[k] && typeof this.db[k] != 'number') {
              return {code: -1, error_message: "Not a number type: " + k}
            }
          }
          var result = {}
          for (var k in diff) {
            this.db[k] = (this.db[k] || 0) + diff[k]
            result[k] = this.db[k]
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