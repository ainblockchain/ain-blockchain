// All functions return either nothign or a transaction which is broadcast to the network

module.exports =  function services(db, blockchain, tp){

    return {
        "test": {
            "comcom":{
                "trigger" : (transaction) => {
                    return db.createTransaction({type: "SET", ref:"/test/ai", value : transaction.output.value * 2}, tp)
                }
            }, "ai":{
                "trigger" : (transaction) => {
                    // For test cases (return transaction if value is > 10)
                    if (db.get("/test/ai") < 10){
                        return null 
                    }
                    return db.createTransaction({type: "SET", ref:"/test/something", value : "HelloWorld"}, tp)
                }
            } 
        }
    }
}
