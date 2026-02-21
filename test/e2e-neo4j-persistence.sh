#!/bin/bash
# End-to-end test: Neo4j block/transaction persistence + recent knowledge API
#
# Prerequisites: docker compose services (neo4j + ain-blockchain) running
# Usage: sg docker -c "bash test/e2e-neo4j-persistence.sh"
#
set -euo pipefail

NODE_URL="http://localhost:8080"
PASS=0
FAIL=0

# Helper: run curl inside the container
node_curl() {
  docker compose exec -T ain-blockchain curl -sf "$@" 2>/dev/null
}

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc (expected=$expected)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected=$expected, got=$actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_one_of() {
  local desc="$1" actual="$2"
  shift 2
  for expected in "$@"; do
    if [ "$expected" = "$actual" ]; then
      echo "  PASS: $desc (got=$actual)"
      PASS=$((PASS + 1))
      return
    fi
  done
  echo "  FAIL: $desc (got=$actual, expected one of: $*)"
  FAIL=$((FAIL + 1))
}

assert_gt() {
  local desc="$1" threshold="$2" actual="$3"
  if [ "$actual" -gt "$threshold" ] 2>/dev/null; then
    echo "  PASS: $desc ($actual > $threshold)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected > $threshold, got=$actual)"
    FAIL=$((FAIL + 1))
  fi
}

wait_for_node() {
  local max_attempts=60
  for i in $(seq 1 $max_attempts); do
    if node_curl "$NODE_URL/last_block_number" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: Node did not become ready within ${max_attempts}s"
  return 1
}

# ============================================================
echo "=========================================="
echo "E2E Test: Neo4j Persistence + Recent Knowledge API"
echo "=========================================="
echo ""

# --- Phase 1: Verify node is running and finalizing ---
echo "[Phase 1] Waiting for node to be ready..."
wait_for_node
BLOCK_NUM=$(node_curl "$NODE_URL/last_block_number" | python3 -c "import json,sys; print(json.load(sys.stdin)['result'])")
echo "  Node is ready at block $BLOCK_NUM"

# Wait for node to be actively finalizing (block number advancing)
echo "  Waiting for block production to stabilize..."
PREV_BLOCK=$BLOCK_NUM
STABLE_COUNT=0
for i in $(seq 1 60); do
  sleep 2
  CUR_BLOCK=$(node_curl "$NODE_URL/last_block_number" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['result'])" 2>/dev/null || echo "$PREV_BLOCK")
  if [ "$CUR_BLOCK" -gt "$PREV_BLOCK" ] 2>/dev/null; then
    STABLE_COUNT=$((STABLE_COUNT + 1))
    PREV_BLOCK=$CUR_BLOCK
    if [ "$STABLE_COUNT" -ge 3 ]; then
      echo "  Block production stable at block $CUR_BLOCK (advanced ${STABLE_COUNT} times)"
      break
    fi
  fi
done
echo ""

# --- Phase 2: Send transactions ---
echo "[Phase 2] Sending test transactions..."

# Create app
CREATE_RESULT=$(node_curl -X POST "$NODE_URL/set_value" \
  -H 'Content-Type: application/json' \
  -d '{"ref": "/manage_app/e2e_neo4j_test/create/0", "value": {"admin": {"0x00ADEc28B6a845a085e03591bE7550dd68673C1C": true}}}')
CREATE_TX=$(echo "$CREATE_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['tx_hash'])")
echo "  App creation tx: $CREATE_TX"

sleep 3

# Set a value
SET_RESULT=$(node_curl -X POST "$NODE_URL/set_value" \
  -H 'Content-Type: application/json' \
  -d '{"ref": "/apps/e2e_neo4j_test/message", "value": "persistence_test_data"}')
SET_TX=$(echo "$SET_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['tx_hash'])")
echo "  Set value tx: $SET_TX"

# Wait for finalization (poll up to 120s)
echo "  Waiting for finalization..."
FINALIZED=false
for i in $(seq 1 60); do
  GT_CHECK=$(node_curl "$NODE_URL/get_transaction?hash=$SET_TX" 2>/dev/null)
  GT_CHECK_STATE=$(echo "$GT_CHECK" | python3 -c "import json,sys; r=json.load(sys.stdin).get('result'); print(r.get('state','') if r else '')" 2>/dev/null)
  if [ "$GT_CHECK_STATE" = "FINALIZED" ]; then
    echo "  Finalized after $((i * 2))s"
    FINALIZED=true
    break
  fi
  sleep 2
done
if [ "$FINALIZED" = "false" ]; then
  echo "  WARNING: Transaction not finalized within 120s, continuing anyway"
fi
echo ""

# --- Phase 3: Verify APIs before restart ---
echo "[Phase 3] Verifying APIs (pre-restart)..."

# Test /recent_blocks_with_transactions
RBT=$(node_curl "$NODE_URL/recent_blocks_with_transactions?count=5")
RBT_CODE=$(echo "$RBT" | python3 -c "import json,sys; print(json.load(sys.stdin)['code'])")
RBT_COUNT=$(echo "$RBT" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']))")
assert_eq "/recent_blocks_with_transactions code" "0" "$RBT_CODE"
assert_gt "/recent_blocks_with_transactions has blocks" "0" "$RBT_COUNT"

# Test /recent_transactions
RT=$(node_curl "$NODE_URL/recent_transactions?count=5")
RT_CODE=$(echo "$RT" | python3 -c "import json,sys; print(json.load(sys.stdin)['code'])")
RT_COUNT=$(echo "$RT" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']))")
assert_eq "/recent_transactions code" "0" "$RT_CODE"
assert_gt "/recent_transactions has txs" "0" "$RT_COUNT"

# Test /get_transaction with our tx hash
GT=$(node_curl "$NODE_URL/get_transaction?hash=$SET_TX")
GT_STATE=$(echo "$GT" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r['state'] if r else 'null')")
GT_FINALIZED=$(echo "$GT" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r['is_finalized'] if r else 'null')")
assert_eq "/get_transaction state" "FINALIZED" "$GT_STATE"
assert_eq "/get_transaction is_finalized" "True" "$GT_FINALIZED"

# Test /recent_knowledge
RK=$(node_curl "$NODE_URL/recent_knowledge?count=5")
RK_CODE=$(echo "$RK" | python3 -c "import json,sys; print(json.load(sys.stdin)['code'])")
assert_eq "/recent_knowledge code" "0" "$RK_CODE"

# Record pre-restart block number
PRE_RESTART_BLOCK=$(node_curl "$NODE_URL/last_block_number" | python3 -c "import json,sys; print(json.load(sys.stdin)['result'])")
echo "  Pre-restart block number: $PRE_RESTART_BLOCK"
echo ""

# --- Phase 4: Restart and verify persistence ---
echo "[Phase 4] Restarting ain-blockchain container..."
docker compose restart ain-blockchain 2>&1
echo "  Waiting for node to restart..."
sleep 5
wait_for_node
POST_RESTART_BLOCK=$(node_curl "$NODE_URL/last_block_number" | python3 -c "import json,sys; print(json.load(sys.stdin)['result'])")
echo "  Post-restart block number: $POST_RESTART_BLOCK"
echo ""

# --- Phase 5: Verify data persisted after restart ---
echo "[Phase 5] Verifying data persistence (post-restart)..."

# Check startup logs for integrity check (not full rebuild)
INTEGRITY_LOG=$(docker compose exec -T ain-blockchain sh -c 'grep "checkAndRebuildBlockIndex.*Chain tip" /home/ain_blockchain_data/logs/8080/node-8080-combined-*.log 2>/dev/null' | tail -1)
NEO4J_MAX=$(echo "$INTEGRITY_LOG" | python3 -c "import sys,re; m=re.search(r'Neo4j max block: (\d+)', sys.stdin.read()); print(m.group(1) if m else '-1')")
assert_gt "Neo4j max block after restart > 0 (persisted)" "0" "$NEO4J_MAX"

# Verify /recent_blocks_with_transactions still returns data
RBT2=$(node_curl "$NODE_URL/recent_blocks_with_transactions?count=5")
RBT2_COUNT=$(echo "$RBT2" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']))")
assert_gt "/recent_blocks_with_transactions persisted" "0" "$RBT2_COUNT"

# Verify /recent_transactions still returns data
RT2=$(node_curl "$NODE_URL/recent_transactions?count=5")
RT2_COUNT=$(echo "$RT2" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']))")
assert_gt "/recent_transactions persisted" "0" "$RT2_COUNT"

# Verify /get_transaction still finds our tx after restart
GT2=$(node_curl "$NODE_URL/get_transaction?hash=$SET_TX")
GT2_STATE=$(echo "$GT2" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r['state'] if r else 'null')")
GT2_HAS_TX=$(echo "$GT2" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print('yes' if r and r.get('transaction') else 'no')")
assert_eq "/get_transaction persisted state" "FINALIZED" "$GT2_STATE"
assert_eq "/get_transaction persisted has tx data" "yes" "$GT2_HAS_TX"

# Verify /recent_knowledge still returns data
RK2=$(node_curl "$NODE_URL/recent_knowledge?count=5")
RK2_CODE=$(echo "$RK2" | python3 -c "import json,sys; print(json.load(sys.stdin)['code'])")
assert_eq "/recent_knowledge post-restart code" "0" "$RK2_CODE"

# Verify JSON-RPC ain_getTransactionByHash works
JRPC_RESULT=$(node_curl -X POST "$NODE_URL/json-rpc" \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"ain_getTransactionByHash\", \"params\": {\"protoVer\": \"1.1.3\", \"hash\": \"$SET_TX\"}}")
JRPC_STATE=$(echo "$JRPC_RESULT" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']['result']; print(r['state'] if r else 'null')")
assert_eq "JSON-RPC ain_getTransactionByHash persisted" "FINALIZED" "$JRPC_STATE"

echo ""

# --- Phase 6: LLM Engine tests ---
echo "[Phase 6] Testing LLM Engine JSON-RPC methods..."

# Test ain_llm_infer
echo "  Testing ain_llm_infer..."
LLM_INFER=$(node_curl -X POST "$NODE_URL/json-rpc" \
  -H 'Content-Type: application/json' \
  --max-time 120 \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "ain_llm_infer", "params": {"protoVer": "1.1.3", "messages": [{"role": "user", "content": "Say hello in one word."}], "max_tokens": 32, "temperature": 0.1}}')
LLM_INFER_HAS_CONTENT=$(echo "$LLM_INFER" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']['result']; print('yes' if r and r.get('content') else 'no')")
assert_eq "ain_llm_infer returns content" "yes" "$LLM_INFER_HAS_CONTENT"

# Test ain_llm_explore (LLM output may not always parse as JSON, so accept parse error too)
echo "  Testing ain_llm_explore..."
LLM_EXPLORE=$(node_curl -X POST "$NODE_URL/json-rpc" \
  -H 'Content-Type: application/json' \
  --max-time 120 \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "ain_llm_explore", "params": {"protoVer": "1.1.3", "topic_path": "math/algebra"}}')
LLM_EXPLORE_STATUS=$(echo "$LLM_EXPLORE" | python3 -c "
import json,sys
r=json.load(sys.stdin)['result']
if r.get('result') and isinstance(r['result'], dict) and r['result'].get('title'):
    print('title_ok')
elif r.get('code') == 30802:
    print('parse_error')
else:
    print('unexpected')
")
assert_one_of "ain_llm_explore responds (title or parse_error)" "$LLM_EXPLORE_STATUS" "title_ok" "parse_error"

# Test ain_llm_generateCourse (LLM output may not always parse as JSON, so accept parse error too)
echo "  Testing ain_llm_generateCourse..."
LLM_COURSE=$(node_curl -X POST "$NODE_URL/json-rpc" \
  -H 'Content-Type: application/json' \
  --max-time 120 \
  -d '{"jsonrpc": "2.0", "id": 3, "method": "ain_llm_generateCourse", "params": {"protoVer": "1.1.3", "topic_path": "math/algebra", "explorations": [{"title": "Intro to Algebra", "depth": 1, "summary": "Basic algebraic concepts and operations."}]}}')
LLM_COURSE_STATUS=$(echo "$LLM_COURSE" | python3 -c "
import json,sys
r=json.load(sys.stdin)['result']
if r.get('result') and isinstance(r['result'], dict) and r['result'].get('stages'):
    print('stages_ok')
elif r.get('code') == 30802:
    print('parse_error')
else:
    print('unexpected')
")
assert_one_of "ain_llm_generateCourse responds (stages or parse_error)" "$LLM_COURSE_STATUS" "stages_ok" "parse_error"

# Test ain_llm_analyze
echo "  Testing ain_llm_analyze..."
LLM_ANALYZE=$(node_curl -X POST "$NODE_URL/json-rpc" \
  -H 'Content-Type: application/json' \
  --max-time 120 \
  -d '{"jsonrpc": "2.0", "id": 4, "method": "ain_llm_analyze", "params": {"protoVer": "1.1.3", "question": "What is algebra?", "context_nodes": [{"title": "Intro to Algebra", "topic_path": "math/algebra", "depth": 1, "summary": "Basic algebraic concepts."}]}}')
LLM_ANALYZE_HAS_CONTENT=$(echo "$LLM_ANALYZE" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']['result']; print('yes' if r and len(r) > 0 else 'no')")
assert_eq "ain_llm_analyze returns content" "yes" "$LLM_ANALYZE_HAS_CONTENT"

echo ""

# --- Phase 7: Container Deployment tests ---
echo "[Phase 7] Testing Container Deployment JSON-RPC methods..."

# Helper for JSON-RPC calls
jrpc() {
  node_curl -X POST "$NODE_URL/json-rpc" \
    -H 'Content-Type: application/json' \
    --max-time 120 \
    -d "$1"
}

# Test ain_deployment_list (should be enabled and return empty list)
echo "  Testing ain_deployment_list (initial)..."
DEP_LIST=$(jrpc '{"jsonrpc":"2.0","id":1,"method":"ain_deployment_list","params":{"protoVer":"1.1.3"}}')
DEP_LIST_OK=$(echo "$DEP_LIST" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print('yes' if r.get('result') is not None and r.get('code') is None else 'no')")
assert_eq "ain_deployment_list enabled" "yes" "$DEP_LIST_OK"

# Test ain_deployment_deploy with unauthorized image (should reject)
echo "  Testing ain_deployment_deploy (unauthorized image)..."
DEP_UNAUTH=$(jrpc '{"jsonrpc":"2.0","id":2,"method":"ain_deployment_deploy","params":{"protoVer":"1.1.3","image":"nginx:alpine","name":"test-unauth"}}')
DEP_UNAUTH_CODE=$(echo "$DEP_UNAUTH" | python3 -c "import json,sys; print(json.load(sys.stdin)['result'].get('code',''))")
assert_eq "ain_deployment_deploy rejects unauthorized" "30802" "$DEP_UNAUTH_CODE"

# Test ain_deployment_authorize
echo "  Testing ain_deployment_authorize..."
DEP_AUTH=$(jrpc '{"jsonrpc":"2.0","id":3,"method":"ain_deployment_authorize","params":{"protoVer":"1.1.3","github_username":"nginxinc"}}')
DEP_AUTH_OK=$(echo "$DEP_AUTH" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']['result']; print('yes' if r and r.get('authorized') else 'no')")
assert_eq "ain_deployment_authorize succeeds" "yes" "$DEP_AUTH_OK"

# Test ain_deployment_deploy with authorized image
echo "  Testing ain_deployment_deploy (authorized image)..."
DEP_DEPLOY=$(jrpc '{"jsonrpc":"2.0","id":4,"method":"ain_deployment_deploy","params":{"protoVer":"1.1.3","image":"ghcr.io/nginxinc/nginx-unprivileged:alpine","name":"e2e-test-container"}}')
DEP_DEPLOY_STATUS=$(echo "$DEP_DEPLOY" | python3 -c "import json,sys; r=json.load(sys.stdin)['result'].get('result'); print(r.get('status','') if r else 'failed')")
assert_eq "ain_deployment_deploy status" "running" "$DEP_DEPLOY_STATUS"

# Test ain_deployment_status
echo "  Testing ain_deployment_status..."
DEP_STATUS=$(jrpc '{"jsonrpc":"2.0","id":5,"method":"ain_deployment_status","params":{"protoVer":"1.1.3","name":"e2e-test-container"}}')
DEP_STATUS_VAL=$(echo "$DEP_STATUS" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']['result']; print(r.get('status',''))")
assert_eq "ain_deployment_status running" "running" "$DEP_STATUS_VAL"

# Test ain_deployment_logs
echo "  Testing ain_deployment_logs..."
DEP_LOGS=$(jrpc '{"jsonrpc":"2.0","id":6,"method":"ain_deployment_logs","params":{"protoVer":"1.1.3","name":"e2e-test-container","tail":5}}')
DEP_LOGS_OK=$(echo "$DEP_LOGS" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print('yes' if r.get('result') and r['result'].get('containerName') == 'e2e-test-container' else 'no')")
assert_eq "ain_deployment_logs returns data" "yes" "$DEP_LOGS_OK"

# Test ain_deployment_list (should have 1 deployment)
echo "  Testing ain_deployment_list (after deploy)..."
DEP_LIST2=$(jrpc '{"jsonrpc":"2.0","id":7,"method":"ain_deployment_list","params":{"protoVer":"1.1.3"}}')
DEP_LIST2_COUNT=$(echo "$DEP_LIST2" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['result']))")
assert_eq "ain_deployment_list count after deploy" "1" "$DEP_LIST2_COUNT"

# Test ain_deployment_stop
echo "  Testing ain_deployment_stop..."
DEP_STOP=$(jrpc '{"jsonrpc":"2.0","id":8,"method":"ain_deployment_stop","params":{"protoVer":"1.1.3","name":"e2e-test-container"}}')
DEP_STOP_STATUS=$(echo "$DEP_STOP" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']['result']; print(r.get('status',''))")
assert_eq "ain_deployment_stop status" "stopped" "$DEP_STOP_STATUS"

# Verify list is empty after stop
DEP_LIST3=$(jrpc '{"jsonrpc":"2.0","id":9,"method":"ain_deployment_list","params":{"protoVer":"1.1.3"}}')
DEP_LIST3_COUNT=$(echo "$DEP_LIST3" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['result']))")
assert_eq "ain_deployment_list empty after stop" "0" "$DEP_LIST3_COUNT"

echo ""

# --- Summary ---
echo "=========================================="
echo "Results: $PASS passed, $FAIL failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
