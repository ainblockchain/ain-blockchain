#!/usr/sh
# Instructions for installing apache benchmarker !!
# sudo apt-get install apache2-utils
# sudo apt-get install apache2

# Initially focus on improving on improving performance on just one instance
node $0/../tracker-server/index.js &
sleep 5
STAKE=250 LOG=true node $0/../server/index.js > log1.txt &
sleep 10
STAKE=250 P2P_PORT=5020 PORT=8081 LOG=true node $0/../server/index.js > log2.txt &
sleep 20
ab -p post.txt -T application/json  -c 50 -n 10000 http://localhost:8080/set > load1.txt &
sleep 1
ab -p post.txt -T application/json  -c 50 -n 10000 http://localhost:8081/set > load2.txt 



sleep 5

wget -O b1.txt http://localhost:8080/blocks
wget -O b2.txt http://localhost:8081/blocks

diff b1.txt b2.txt
