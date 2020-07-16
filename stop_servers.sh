
BASEDIR=$(dirname "$0")
rm -rf $BASEDIR/blockchain/blockchains
rm -rf $BASEDIR/logger/logs
rm -rf $BASEDIR/tracker/logs
killall node

