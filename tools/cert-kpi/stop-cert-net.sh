#!/usr/bin/env bash
KPI=${KPI_DIR:-$(cd "$(dirname "$0")" && pwd)}
# 인증망 정지. 체인 데이터·매니페스트는 삭제하지 않는다(증빙 보존).
PIDF=$KPI/cert-net.pids
[ -f "$PIDF" ] && kill $(cat "$PIDF") 2>/dev/null
sleep 2
[ -f "$PIDF" ] && kill -9 $(cat "$PIDF") 2>/dev/null
rm -f "$PIDF"
echo stopped
