# Instructions for installing apache benchmarker !!
# sudo apt-get install apache2-utils
# sudo apt-get install apache2

# Initially focus on improving on improving performance on just one instance

BASEDIR=$(dirname "$0")

node $BASEDIR/tracker-server/index.js &
PID1=$!
sleep 5
STAKE=250 LOG=true node $BASEDIR/server/index.js > log1.txt &
PID2=$!
sleep 10
STAKE=250 P2P_PORT=5020 PORT=8081 LOG=true node $BASEDIR/server/index.js > log2.txt &
PID3=$!
sleep 20
date > load1.txt
ab -p post.txt -T application/json  -c 50 -n 7500 http://localhost:8080/set >> load1.txt &
sleep 1
date > load2.txt
ab -p post.txt -T application/json  -c 50 -n 7400 http://localhost:8081/set >> load2.txt 



sleep 5

wget -O b1.txt http://localhost:8080/blocks
wget -O b2.txt http://localhost:8081/blocks

diff b1.txt b2.txt
# kill  -9 $PID1 $PID2 $PID3
# rm -rf $BASEDIR/blockchain/.blockchains
