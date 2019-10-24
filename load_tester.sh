# Instructions for installing apache benchmarker !!
# sudo apt-get install apache2-utils
# sudo apt-get install apache2

# Initially focus on improving on improving performance on just one instance

BASEDIR=$(dirname "$0")

node $BASEDIR/tracker-server/index.js &
PID1=$!
sleep 5
STAKE=250 P2P_PORT=5001 PORT=9091 LOG=true LOCAL=true DEBUG=true node $BASEDIR/client/index.js > ./loadtest/log1.txt &
PID2=$!
sleep 10
STAKE=250 P2P_PORT=5002 PORT=9092 LOG=true LOCAL=true DEBUG=true node $BASEDIR/client/index.js > ./loadtest/log2.txt &
PID3=$!

sleep 20

date > ./loadtest/load1.txt
ab -p ./loadtest/post.txt -T application/json  -c 50 -n 25000 http://localhost:9091/inc_value >> ./loadtest/load1.txt &

sleep 1

date > ./loadtest/load2.txt
ab -p ./loadtest/post.txt -T application/json  -c 50 -n 25000 http://localhost:9092/inc_value >> ./loadtest/load2.txt 

sleep 15

curl -H "Content-type:application/json" -d '{"jsonrpc": "2.0", "id": "curltest", "method": "ain_getBlockList", "params": {}}' http://localhost:9091/json-rpc > ./loadtest/block1.txt
curl -H "Content-type:application/json" -d '{"jsonrpc": "2.0", "id": "curltest", "method": "ain_getBlockList", "params": {}}' http://localhost:9092/json-rpc > ./loadtest/block2.txt

RESULT1=$(wget -qO-  http://localhost:9091/get_value?ref=/test/increase/first/level)

diff ./loadtest/block1.txt ./loadtest/block2.txt
kill  -9 $PID1 $PID2 $PID3
rm -rf $BASEDIR/blockchain/.blockchains

echo $RESULT1
if [ "$RESULT1"=="{'code':0,'result':50000}" ] ;
then
    echo "/test/increase/first/level correctly increased to 50000 !! Pass"
else
    echo "Error: Increases sum to $RESULT1!! Fail"
    exit 1
fi

# NOTE: '\n' in sed command does not take effect on macOS
NUM=$(sed 's/level/level\
/g' ./loadtest/block1.txt | grep -c "level")

echo $NUM
if test $NUM -eq 50000 
then
    echo "50000 occurances of string found in last 10 blocks !! Pass"
else
    echo "$NUM occuraces of string found in last 10 blocks!! Fail"
    exit 1
fi

exit 0

 

