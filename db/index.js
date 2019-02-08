const ChainUtil = require('../chain-util')
const Transaction = require("./transaction")
const InvalidPerissonsError = require("../errors")

class DB {

    constructor(){
        this.db = {}
        this.keyPair = ChainUtil.genKeyPair()
        this.publicKey = this.keyPair.getPublic().encode('hex')

    }

    static getDatabase(blockchain){
        const db = new DB()
        db.createDatabase(blockchain)
        return db
    }

    get(queryPath, ruleCheck=true){
        var listQueryPath = ChainUtil.queryParser(queryPath)

        if (ruleCheck && !this.getPermissisons(listQueryPath, [".read"])[".read"]){
            throw new InvalidPerissonsError(`Invalid get permissons for ${queryPath}`)
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
                console.log(error.message)
                return null
            }
            throw error
        }
        return result ? result : null
    }

    stake(stakeAmount){
        return this.set(["stakes", this.publicKey].join("/"), stakeAmount)
    }

    set(queryPath, value, ruleCheck=true){

        let valueCopy
        var listQueryPath = ChainUtil.queryParser(queryPath)
        // TODO: Find a better way to manage seeting of rules than this dodgy condition
        if (!(listQueryPath.length === 1 && listQueryPath[0] === "rules") && ruleCheck && Object.values(this.getPermissisons(listQueryPath, [".read", ".write"], value)).includes(false)){
            throw new InvalidPerissonsError(`Invalid set permissons for ${queryPath}`)
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

    increase(diff, skipRuleCheck=false){

        for (var k in diff) {
            if (this.get(k, skipRuleCheck) && typeof this.get(k, skipRuleCheck) != 'number') {
                return {code: -1, error_message: "Not a number type: " + k}
            }
        }
        var results = {}
        for (var k in diff) {
            var result = (this.get(k, skipRuleCheck) || 0) + diff[k]
            this.set(k, result, skipRuleCheck)
            results[k] = result
        }
        return {code: 0, result: results}
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
        outputs.forEach(output => {
            // This ruleCheck 'false' is used to add values that were written by a user with different auth permissions to their local database.
            // This will need to be improved as it is unsafe 
            switch(output.type){
                case "SET":
                    this.set(output.ref, output.value, false)
                    break
                case "INCREASE": {
                    this.increase(output.diff, false)
                    break
                }
            }
        })
    }

    getPermissisons(queryPath, permissionQueries, newValue) {
        // Checks permissions for thegien query path. Specify permissionQueries as a list of the permissions of interest i.e [".read", ".write"]
        let lastRuleSet
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
                rules[permission] = this.verifyAuth(rules[permission], wildCards, queryPath, newValue)
            }

        console.log(`Access for user ${this.publicKey.substring(0, 10)} for path ${queryPath.join("/")} is ${Object.values(rules)}`)
        return rules
    }


    verifyAuth(ruleString, wildCards, queryPath, newValue){

        if (ruleString.includes("auth")){
            ruleString = ruleString.replace(/auth/g, `'${this.publicKey}'`)
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
        console.log(`Evaluating: ${ruleString}`)
        return eval(ruleString)
    }

}

module.exports = DB

