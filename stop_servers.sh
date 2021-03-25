
BASEDIR=$(dirname "$0")
rm -rf $BASEDIR/blockchains
rm -rf $BASEDIR/logger/logs
rm -rf $BASEDIR/tracker-server/logs
killall -9 node # SIGKILL
