#!/usr/sh
# Instructions for installing apache benchmarker !!
# sudo apt-get install apache2-utils
# sudo apt-get install apache2

# Initially focus on improving on improving performance on just one instance
ab -p post.txt -T application/json  -c 50 -n 10000 http://localhost:8080/set

