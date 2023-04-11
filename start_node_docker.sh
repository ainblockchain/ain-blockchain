if [[ $SEASON = 'mainnet' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/mainnet-prod
elif [[ $SEASON = 'summer' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-prod
elif [[ $SEASON = 'spring' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-prod
elif [[ $SEASON = 'sandbox' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-sandbox
elif [[ $SEASON = 'staging' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-staging
elif [[ $SEASON = 'exp' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-exp
elif [[ $SEASON = 'dev' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-dev
fi

nohup node --max-old-space-size=55000 ./client/index.js 2>error_logs.txt &

sleep 1

if [[ -z "$PORT" ]]; then
    NODE_ENDPOINT="http://localhost:8080"
else
    NODE_ENDPOINT="http://localhost:$PORT"
fi

if [[ -z "$ACCOUNT_INJECTION_OPTION" ]]; then
    printf "You must provide a ACCOUNT_INJECTION_OPTION\n"
    exit
elif [[ $ACCOUNT_INJECTION_OPTION = "private_key" ]]; then
    if [[ -z "$PRIVATE_KEY" ]]; then
        printf 'You should manually inject your account into this node.\n'
    else
        echo $PRIVATE_KEY | node inject_node_account.js $NODE_ENDPOINT --private-key
        unset PRIVATE_KEY
    fi
elif [[ $ACCOUNT_INJECTION_OPTION = "keystore" ]]; then
    if [[ -z "$KEYSTORE_FILE_PATH" ]] || [[ -z "$PASSWORD" ]]; then
        printf 'You should manually inject your account into this node.\n'
    else
        {
            echo $KEYSTORE_FILE_PATH
            sleep 1
            echo $PASSWORD
        } | node inject_node_account.js $NODE_ENDPOINT --keystore
    fi
elif [[ $ACCOUNT_INJECTION_OPTION = "mnemonic" ]]; then
    if [[ -z "$MNEMONIC" ]]; then
        printf 'You should manually inject your account into this node.\n'
    else
        {
            echo $MNEMONIC
            sleep 1
            echo 0
        } | node inject_node_account.js $NODE_ENDPOINT --mnemonic
        unset MNEMONIC
    fi
else
    printf "Invalid ACCOUNT_INJECTION_OPTION:"$ACCOUNT_INJECTION_OPTION"\n"
    exit
fi

printf 'Done\n'
tail -f /dev/null
