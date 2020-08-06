node $0/../tracker-server/index.js &
sleep 5
NUM_VALIDATORS=4 ACCOUNT_INDEX=0 HOSTING_ENV=local node $0/../client/index.js &
sleep 10
NUM_VALIDATORS=4 ACCOUNT_INDEX=1 HOSTING_ENV=local node $0/../client/index.js &
sleep 10
NUM_VALIDATORS=4 ACCOUNT_INDEX=2 HOSTING_ENV=local node $0/../client/index.js &
sleep 10
NUM_VALIDATORS=4 ACCOUNT_INDEX=3 HOSTING_ENV=local node $0/../client/index.js &
sleep 10
