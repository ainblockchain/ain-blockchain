
BASEDIR=$(dirname "$0")
rm -rf $BASEDIR/blockchains
rm -rf $BASEDIR/logs
killall -9 node # SIGKILL
