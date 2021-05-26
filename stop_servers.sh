killall -9 node # SIGKILL
rm -rf ~/.ain/
BASEDIR=$(dirname "$0")
rm -rf $BASEDIR/logs/
