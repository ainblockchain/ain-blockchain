node $0/../tracker-server/index.js &
sleep 5
STAKE=250 LOG=true node $0/../server/index.js &
sleep 10
STAKE=250 P2P_PORT=5020 PORT=8081 LOG=true node $0/../server/index.js &
sleep 10
STAKE=250 P2P_PORT=5019 PORT=8082 LOG=true node $0/../server/index.js &
