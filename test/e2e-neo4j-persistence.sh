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

# --- Phase 1: Verify node is running ---
echo "[Phase 1] Waiting for node to be ready..."
wait_for_node
BLOCK_NUM=$(node_curl "$NODE_URL/last_block_number" | python3 -c "import json,sys; print(json.load(sys.stdin)['result'])")
echo "  Node is ready at block $BLOCK_NUM"
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

# Wait for finalization
echo "  Waiting for finalization (8s)..."
sleep 8
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
INTEGRITY_LOG=$(docker compose exec -T ain-blockchain grep 'checkAndRebuildBlockIndex.*Chain tip' /home/ain_blockchain_data/logs/8080/node-8080-combined-19-Feb-26.log 2>/dev/null | tail -1)
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

# --- Summary ---
echo "=========================================="
echo "Results: $PASS passed, $FAIL failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
