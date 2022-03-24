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
    printf 'You should manually inject your account into this node.\n'
elif [[ $ACCOUNT_INJECTION_OPTION = "private_key" ]]; then
    if [[ -z "$PRIVATE_KEY" ]]; then
        printf "Must provide a PRIVATE_KEY\n"
        exit
    fi
    echo $PRIVATE_KEY | node inject_account_gcp.js $NODE_ENDPOINT --private-key
    unset PRIVATE_KEY
elif [[ $ACCOUNT_INJECTION_OPTION = "keystore" ]]; then
    if [[ -z "$KEYSTORE_FILE_PATH" ]]; then
        printf "Must provide a KEYSTORE_FILE_PATH\n"
        exit
    fi
    node inject_account_gcp.js $NODE_ENDPOINT --keystore
elif [[ $ACCOUNT_INJECTION_OPTION = "mnemonic" ]]; then
    if [[ -z "$MNEMONIC" ]]; then
        printf "Must provide a MNEMONIC\n"
        exit
    fi
    {
        echo $MNEMONIC
        sleep 1
        echo 0
    } | node inject_account_gcp.js $NODE_ENDPOINT --mnemonic
    unset MNEMONIC
fi

printf 'Done\n'
tail -f /dev/null
