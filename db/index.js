const ChainUtil = require('../chain-util')
const Transaction = require("./transaction")
const InvalidPermissionsError = require("../errors")

class DB {

    constructor(){
        this.db = {}
        this.keyPair = ChainUtil.genKeyPair()
        this.publicKey = this.keyPair.getPublic().encode('hex')
        this.nonce = 0
        console.log(`creating new db with id ${this.publicKey}`)

    }

    static getDatabase(blockchain, tp){
        const db = new DB()
        blockchain.setBackDb(new BackUpDB(db.keyPair))
        db.reconstruct(blockchain, tp)
        return db
    }

    get(queryPath, auth=null){
        auth = auth || this.publicKey
        var listQueryPath = ChainUtil.queryParser(queryPath)

        if (listQueryPath.length < 1) {
            return this.db
          }
        var result = this.db
        try{
            listQueryPath.forEach(function(key){
                result = result[key]
            })
        } catch (error) {
            if (error instanceof TypeError){
                //console.log(error.message)
                return null
            }
            throw error
        }
        return result ? result : null
    }

    stake(stakeAmount){
        return this.set(["stakes", this.publicKey].join("/"), stakeAmount)
    }

    set(queryPath, value, auth=null, timestamp=null){
        let valueCopy
        var listQueryPath = ChainUtil.queryParser(queryPath)
        // TODO: Find a better way to manage seeting of rules than this dodgy condition
        // In future should be able to accomidate other types of rules beyoned wrie
        if (!(listQueryPath.length === 1 && listQueryPath[0] === "rules") && this.getPermissions(listQueryPath, auth, timestamp,  ".write", value) == false){
            throw new InvalidPermissionsError(`Invalid set permissons for ${queryPath}`)
        }
        
        if (ChainUtil.isDict(value)){
            valueCopy = JSON.parse(JSON.stringify(value))
        } else {
            valueCopy = value
        }
        if (listQueryPath.length < 1) {
            this.db = valueCopy
        } else if (listQueryPath.length  == 1) {
            this.db[listQueryPath[0]] = valueCopy
        } else {
            var pathToKey = listQueryPath.splice(0, listQueryPath.length - 1)
            var refKey = listQueryPath[listQueryPath.length - 1]
            this._forcePath(pathToKey)[refKey] = valueCopy
        } 
        return true
    }

    update(data, auth=null, timestamp=null){
        for (let key in data) {
            this.set(key, data[key], auth, timestamp)
          }
          return true
    }

    batch(batch_list, auth=null, timestamp=null){
        var result_list = []
        batch_list.forEach((item) => {
            if (item.op === 'set') {
              result_list.push(this.set(item.ref, item.value, auth, timestamp))
            } else if (item.op === 'increase') {
              result_list.push(this.increase(item.diff, auth, timestamp))
            } else if (item.op === 'get') {
              result_list.push(this.get(item.ref, auth, timestamp))
            } else if (item.op === 'update') {
              result_list.push(this.update(item.data, auth, timestamp))
            } else if (item.op === 'batch') {
                result_list.push(this.batch(item.batch_list, auth, timestamp))
            }
          })
          return result_list
    }

    _forcePath(listQueryPath){
        // Returns reference to provided path if exists, otherwise creates path
        var subDb = this.db
        listQueryPath.forEach((key) => {
            if ((!ChainUtil.isDict(subDb[key])) || (!(key in subDb))) {
                subDb[key] = {}
            }
            subDb = subDb[key]
        })
        return subDb
    }

    increase(diff, auth=null, timestamp=null){
        for (var k in diff) {
            if (this.get(k, auth) && typeof this.get(k, auth) != 'number') {
                // TODO: Raise error here
                return {code: -1, error_message: "Not a number type: " + k}
            }
        }
        var results = {}
        for (var k in diff) {
            var result = (this.get(k, auth) || 0) + diff[k]
            this.set(k, result, auth, timestamp)
            results[k] = result
        }
        return results
    }

    createTransaction(data, transactionPool){
        let transaction = Transaction.newTransaction(this, data)
        transactionPool.addTransaction(transaction, false)
        return transaction
    }

    sign(dataHash) {
        return this.keyPair.sign(dataHash)
    }

    reconstruct(blockchain, transactionPool){
        console.log("Reconstructing database")
        this.setDBToBackUp(blockchain.backUpDB)
        this.createDatabase(blockchain)
        this.addTransactionPool(transactionPool.validTransactions())
        
    }

    createDatabase(blockchain){
        blockchain.chain.forEach(block => {
            this.executeBlockTransactions(block)
        })
    }

    executeBlockTransactions(block){
        block.data.forEach(transaction =>{
            this.execute(transaction.output, transaction.address, transaction.timestamp)
        })
    }

    addTransactionPool(transactions){
        transactions.forEach(trans => {
            this.execute(trans.output, trans.address)
        })
    }

    setDBToBackUp(backUpDB){
        if (this.publicKey === backUpDB.publicKey){
            this.db = JSON.parse(JSON.stringify(backUpDB.db))
        }
    }

    execute(transaction, address, timestamp) {
        switch(transaction.type){
            case "SET":
                this.set(transaction.ref, transaction.value, address, timestamp)
                break
            case "INCREASE": 
                this.increase(transaction.diff, address, timestamp)
                break
            case "UPDATE":
                this.update(transaction.data, address, timestamp)
                break
            case "BATCH": 
                this.batch(transaction.batch_list, address, timestamp)
                break
        }
    }

    getPermissions(queryPath, auth, timestamp,  permissionQuery, newValue=null) {
        let lastRuleSet
        auth = auth || this.publicKey
        timestamp = timestamp || Date.now()
        var rule = false
        var wildCards = {}
        var currentRuleSet = this.db["rules"]
        var i = 0
        do{
            if (permissionQuery in currentRuleSet){ 
                rule = currentRuleSet[permissionQuery]
            }
            lastRuleSet = currentRuleSet
            currentRuleSet = currentRuleSet[queryPath[i]]
            if (!currentRuleSet && queryPath[i]){
                // If no rule set is available for specific key, check for wildcards
                var keys = Object.keys(lastRuleSet)
                for(var j=0; j<keys.length; j++){
                    if (keys[j].startsWith("$")) {
                        wildCards[keys[j]] = queryPath[i]
                        currentRuleSet = lastRuleSet[keys[j]]
                    }
                }
            }
            i++
        } while(currentRuleSet &&  i <= queryPath.length);

        if (typeof rule === "string"){
            rule = this.verifyAuth(rule, wildCards, queryPath, newValue, auth, timestamp)
        }

        //console.log(`Access for user ${auth.substring(0, 10)} for path ${queryPath.join("/")} is ${Object.values(rules)}`)
        return rule
    }


    verifyAuth(ruleString, wildCards, queryPath, newValue, auth, timestamp){

        if (ruleString.includes("auth")){
            ruleString = ruleString.replace(/auth/g, `'${auth}'`)
        } 
        if (Object.keys(wildCards).length > 0){
            for(var wildCard in wildCards){
                if (ruleString.includes(wildCard)){
                    // May need to come back here to figure out how to change ALL occurrences of wildCards
                    ruleString = ruleString.replace(wildCard, `${wildCards[wildCard]}`)
                } 
            }

        }  
        if (ruleString.includes("newData")){
            ruleString = ruleString.replace(/newData/g, JSON.stringify(newValue))
        }  
        if (ruleString.includes("currentTime")){
            ruleString = ruleString.replace(/currentTime/g, timestamp)
        }  
        if (ruleString.includes("oldData")){
            ruleString = ruleString.replace(/oldData/g, this.get(queryPath.join("/")))
        }  
        if (ruleString.includes("db.get")){
            ruleString = ruleString.replace(/db.get/g, "this.get")
        } 

        var permission = eval(ruleString)
        if (!permission){
            console.log(`"${ruleString}" evaluated as false`)
        }
        return permission
    }

}

class BackUpDB extends DB{
    constructor(keyPair){
        super()
        this.keyPair = keyPair
        this.publicKey = this.keyPair.getPublic().encode('hex')

    }

}

module.exports = DB

