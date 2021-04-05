
BASEDIR=$(dirname "$0")
rm -rf $BASEDIR/chains/
rm -rf $BASEDIR/logs/
killall -9 node # SIGKILL
