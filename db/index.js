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

    get(queryPath, auth){
        auth = auth || this.publicKey
        var listQueryPath = ChainUtil.queryParser(queryPath)

        if (!this.getPermissions(listQueryPath, auth, [".read"])[".read"]){
            throw new InvalidPermissionsError(`Invalid get permissions for ${queryPath}`)
        }

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

    set(queryPath, value, auth=null){
        let valueCopy
        var listQueryPath = ChainUtil.queryParser(queryPath)
        // TODO: Find a better way to manage seeting of rules than this dodgy condition
        if (!(listQueryPath.length === 1 && listQueryPath[0] === "rules") && Object.values(this.getPermissions(listQueryPath, auth, [".read", ".write"], value)).includes(false)){
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

    update(data, auth=null){
        for (let key in data) {
            this.set(key, data[key], auth)
          }
          return true
    }

    batch(batch_list, auth=null){
        var result_list = []
        batch_list.forEach((item) => {
            if (item.op === 'set') {
              result_list.push(this.set(item.ref, item.value, auth))
            } else if (item.op === 'increase') {
              result_list.push(this.increase(item.diff, auth))
            } else if (item.op === 'get') {
              result_list.push(this.get(item.ref, auth))
            } else if (item.op === 'update') {
              result_list.push(this.update(item.data, auth))
            } else if (item.op === 'batch') {
                result_list.push(this.batch(item.batch_list, auth))
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

    increase(diff, auth=null){
        for (var k in diff) {
            if (this.get(k, auth) && typeof this.get(k, auth) != 'number') {
                // TODO: Raise error here
                return {code: -1, error_message: "Not a number type: " + k}
            }
        }
        var results = {}
        for (var k in diff) {
            var result = (this.get(k, auth) || 0) + diff[k]
            this.set(k, result, auth)
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
            this.execute(transaction.output, transaction.address)
        })
    }

    addTransactionPool(transactions){
        transactions.forEach(trans => {
            this.execute(trans.output, trans.address)
        })
    }

    setDBToBackUp(backUpDB){
        if (this.db.publicKey === backUpDB.publicKey){
            this.db = backUpDB.db
        }
    }

    execute(transaction, address) {
        switch(transaction.type){
            case "SET":
                this.set(transaction.ref, transaction.value, address)
                break
            case "INCREASE": 
                this.increase(transaction.diff, address)
                break
            case "UPDATE":
                this.update(transaction.data, address)
                break
            case "BATCH": 
                this.batch(transaction.batch_list, address)
                break
        }
    }

    getPermissions(queryPath, auth, permissionQueries, newValue) {
        // Checks permissions for the given query path. Specify permissionQueries as a list of the permissions of interest i.e [".read", ".write"]
        let lastRuleSet
        auth = auth || this.publicKey
        var rules = {}
        var wildCards = {}
        var currentRuleSet = this.db["rules"]
        var i = 0
        do{
            for(var j=0; j <permissionQueries.length; j++){
                if (permissionQueries[j] in currentRuleSet){ 
                    rules[permissionQueries[j]] = currentRuleSet[permissionQueries[j]]
                }
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
        for(var permission in rules)
            if (typeof rules[permission] === "string"){
                rules[permission] = this.verifyAuth(rules[permission], wildCards, queryPath, newValue, auth)
            }

        //console.log(`Access for user ${auth.substring(0, 10)} for path ${queryPath.join("/")} is ${Object.values(rules)}`)
        return rules
    }


    verifyAuth(ruleString, wildCards, queryPath, newValue, auth){

        if (ruleString.includes("auth")){
            ruleString = ruleString.replace(/auth/g, `'${auth}'`)
        } 
        if (Object.keys(wildCards).length > 0){
            for(var wildCard in wildCards){
                if (ruleString.includes(wildCard)){
                    // May need to come back here to figure out how to change ALL occurances of wildCards
                    ruleString = ruleString.replace(wildCard, `${wildCards[wildCard]}`)
                } 
            }

        }  
        if (ruleString.includes("newData")){
            ruleString = ruleString.replace(/newData/g, newValue)
        }  
        if (ruleString.includes("oldData")){
            ruleString = ruleString.replace(/oldData/g, this.get(queryPath.join("/")))
        }  
        if (ruleString.includes("db.get")){
            ruleString = ruleString.replace(/db.get.*\)/g, function replacer(match){
                return match.replace("db.get", "this.get").replace(/'/g, "") ;
            } );
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

