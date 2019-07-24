# Instructions for installing apache benchmarker !!
# sudo apt-get install apache2-utils
# sudo apt-get install apache2

# Initially focus on improving on improving performance on just one instance

BASEDIR=$(dirname "$0")

node $BASEDIR/tracker-server/index.js &
PID1=$!
sleep 5
STAKE=250 LOG=true node $BASEDIR/client/index.js > log1.txt &
PID2=$!
sleep 10
STAKE=250 P2P_PORT=5020 PORT=8081 LOG=true node $BASEDIR/client/index.js > log2.txt &
PID3=$!
sleep 20
date > load1.txt


ab -p post.txt -T application/json  -c 50 -n 50000 http://localhost:8080/increase >> load1.txt &
sleep 1
date > load2.txt
ab -p post.txt -T application/json  -c 50 -n 50000 http://localhost:8081/increase >> load2.txt 



sleep 15

 curl -H "Content-type:application/json" -d '{"jsonrpc":"2.0", "id":"curltest", "method":"getBlocks"}' http://localhost:8080/json-rpc > b1.txt
 curl -H "Content-type:application/json" -d '{"jsonrpc":"2.0", "id":"curltest", "method":"getBlocks"}' http://localhost:8081/json-rpc > b2.txt

RESULT1=$(wget -qO-  http://localhost:8080/get?ref=/test/increase/first/level)
RESULT2=$(wget -qO-  http://localhost:8081/get?ref=/test/increase/first/level2)


diff b1.txt b2.txt
kill  -9 $PID1 $PID2 $PID3
rm -rf $BASEDIR/blockchain/.blockchains

NUM=$(sed 's/level/level\n/g' b1.txt | grep -c "level")

 if [ "$RESULT1"=="{'code':0,'result':1000000}" ] ;
 then
    echo "/test/increase/first/level correctly increased to 1000000 !! Pass"
else
    echo "Error: Increases sum to $RESULT1!! Fail"
    exit 1
fi

 if [ "$RESULT2"=="{'code':0,'result':2000000}" ] ;
 then
    echo "/test/increase/first/leve2 correctly increased to 2000000 !! Pass"
else
    echo "Error: Increases sum to $RESULT2!! Fail"
    exit 1
fi

if test $NUM -eq 200000 
then
      echo "200000 occurances of string found in last 10 blocks !! Pass"
else
    echo "$NUM occuraces of string found in last 10 blocks!! Fail"
    exit 1
fi

exit 0

 

