const glob = require( 'glob' )
const path = require( 'path' );
const ChainUtil = require('../chain-util')

class ServiceExecutor {

    constructor(db, blockchain, tp) {
        const services = []
        glob.sync( './services/*.js' ).forEach( function( file ) {
            services.push(require( path.resolve( file ) )(db, blockchain, tp));
          });
        this.services = services.reduce(function (r, o) {
            Object.keys(o).forEach(function (k) { r[k] = o[k]; });
            return r;
        }, {});
        

    }

    executeTransactionFunction(transaction){
        let functionPath  
        switch(transaction.output.type){
            case "SET":
                functionPath = ChainUtil.queryParser(transaction.output.ref)
                break
            case "INCREASE":
                // Currently only works for 
                functionPath = ChainUtil.queryParser(Object.values(transaction.diff[0]))
                break
            default:
                console.log("Not yet supported ")
                return null
        }

       return  this._execute(functionPath, transaction)
    }

    _execute(functionPath, transaction){
        var func =  this.services
        try{
            functionPath.forEach(function(key){
                func = func[key]
            })
        } catch (error) {
            console.log(`No function for path ${functionPath}`)
            return null
        }
        return ("trigger" in func) ? func.trigger(transaction): null

    }
    
}


module.exports = ServiceExecutor;
