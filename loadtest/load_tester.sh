# Instructions for installing apache benchmarker !!
# sudo apt-get install apache2-utils
# sudo apt-get install apache2

# Initially focus on improving on improving performance on just one instance

BASEDIR=$(dirname "$0")

node $BASEDIR/../tracker-server/index.js &
PID1=$!
sleep 5
LOCAL=true node $BASEDIR/../client/index.js > $BASEDIR/log1.txt &
PID2=$!
sleep 10
P2P_PORT=5020 PORT=8081 STAKE=100000 node $BASEDIR/../client/index.js > $BASEDIR/log2.txt &
PID3=$!

sleep 20

date > $BASEDIR/load1.txt
ab -p $BASEDIR/data/post.txt -T application/json  -c 50 -n 25000 http://localhost:8080/inc_value >> $BASEDIR/load1.txt &

sleep 1

date > $BASEDIR/load2.txt
ab -p $BASEDIR/data/post.txt -T application/json  -c 50 -n 25000 http://localhost:8081/inc_value >> $BASEDIR/load2.txt 

sleep 15

curl -H "Content-type:application/json" -d '{"jsonrpc": "2.0", "id": "curltest", "method": "ain_getBlockList", "params": {}}' http://localhost:8080/json-rpc > $BASEDIR/blocks1.txt
curl -H "Content-type:application/json" -d '{"jsonrpc": "2.0", "id": "curltest", "method": "ain_getBlockList", "params": {}}' http://localhost:8081/json-rpc > $BASEDIR/blocks2.txt

RESULT1=$(wget -qO-  http://localhost:8080/get?ref=/test/increase/first/level)

diff $BASEDIR/blocks1.txt $BASEDIR/blocks2.txt
kill  -9 $PID1 $PID2 $PID3
rm -rf $BASEDIR/chains

echo $RESULT1
if [ "$RESULT1" = "{'code':0,'result':50000}" ] ;
then
    echo "/test/increase/first/level correctly increased to 50000 !! Pass"
else
    echo "Error: Increases sum to $RESULT1!! Fail"
    exit 0
fi

# NOTE(platfowner): '\n' in sed command does not take effect on macOS.
NUM=$(sed 's/level/level\
/g' $BASEDIR/blocks1.txt | grep -c "level")

echo $NUM
if test $NUM -eq 50000 
then
    echo "50000 occurances of string found in blocks !! Pass"
else
    echo "$NUM occuraces of string found in blocks!! Fail"
    exit 0
fi

exit 0

 

