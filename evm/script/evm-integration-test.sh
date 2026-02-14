#!/usr/bin/env bash
# =============================================================================
# EVM Integration Test — Anvil Localnet
#
# Spins up a local Anvil node, deploys the PaperclipProtocol contract,
# creates a task, then runs all CLI commands against it.
#
# Prerequisites:
#   - Foundry (forge, anvil, cast) installed
#   - CLI built (cd cli && npm run build)
#
# Usage:
#   ./evm/script/evm-integration-test.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
EVM_DIR="$ROOT_DIR/evm"
CLI_DIR="$ROOT_DIR/cli"
CLI="node $CLI_DIR/dist/index.js"

# Anvil deterministic private keys (account #0 and #1)
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEPLOYER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
AGENT_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
AGENT_ADDR="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
RPC_URL="http://127.0.0.1:8545"
ANVIL_PID=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail_msg() { echo -e "${RED}✗ $1${NC}"; }
step() { echo -e "${YELLOW}▶ $1${NC}"; }

cleanup() {
  if [ -n "$ANVIL_PID" ] && kill -0 "$ANVIL_PID" 2>/dev/null; then
    step "Stopping Anvil (PID $ANVIL_PID)..."
    kill "$ANVIL_PID" 2>/dev/null || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

TESTS_PASSED=0
TESTS_FAILED=0

assert_contains() {
  local output="$1"
  local expected="$2"
  local label="$3"
  if echo "$output" | grep -q "$expected"; then
    pass "$label"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    fail_msg "$label — expected '$expected' in output"
    echo "  Got: $output"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_json_field() {
  local output="$1"
  local field="$2"
  local expected="$3"
  local label="$4"
  local actual
  actual=$(echo "$output" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('$field', 'MISSING'))" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$actual" = "$expected" ]; then
    pass "$label"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    fail_msg "$label — expected $field='$expected', got '$actual'"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║          EVM Integration Test — Anvil Localnet          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Start Anvil ───────────────────────────────────────────────────────
step "Starting Anvil..."
anvil --silent &
ANVIL_PID=$!
sleep 2

if ! kill -0 "$ANVIL_PID" 2>/dev/null; then
  fail_msg "Anvil failed to start"
  exit 1
fi
pass "Anvil running (PID $ANVIL_PID)"

# ─── Step 2: Deploy contract ──────────────────────────────────────────────────
step "Deploying PaperclipProtocol to Anvil..."
DEPLOY_OUTPUT=$(cd "$EVM_DIR" && forge script script/Deploy.s.sol:DeployPaperclip \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  --broadcast 2>&1)

# Extract contract address from deploy output
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "PaperclipProtocol deployed at:" | awk '{print $NF}')

if [ -z "$CONTRACT_ADDRESS" ]; then
  fail_msg "Could not extract contract address from deploy output"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi
pass "Contract deployed at $CONTRACT_ADDRESS"

# Verify initialization
INITIALIZED=$(cast call "$CONTRACT_ADDRESS" "initialized()(bool)" --rpc-url "$RPC_URL")
assert_contains "$INITIALIZED" "true" "Contract initialized"

# ─── Step 3: Create a test task via cast ───────────────────────────────────────
step "Creating test task via cast..."
cast send "$CONTRACT_ADDRESS" \
  "createTask(uint32,string,string,uint64,uint16,uint8,uint32)" \
  1 "Test Task One" "bafy-test-cid-one" 50 100 0 4294967295 \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  >/dev/null 2>&1
pass "Task 1 created"

cast send "$CONTRACT_ADDRESS" \
  "createTask(uint32,string,string,uint64,uint16,uint8,uint32)" \
  2 "Test Task Two" "bafy-test-cid-two" 25 50 0 1 \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  >/dev/null 2>&1
pass "Task 2 created (requires task 1)"

# Export env for CLI
export PAPERCLIP_EVM_CONTRACT_ADDRESS="$CONTRACT_ADDRESS"
export PAPERCLIP_STORACHA_MOCK=1

echo ""

# ─── Step 4: CLI Tests — Agent Registration ───────────────────────────────────
step "Testing: pc init --server evm-localnet (agent wallet)"
INIT_OUTPUT=$(PAPERCLIP_EVM_PRIVATE_KEY="$AGENT_KEY" $CLI init --server evm-localnet --json 2>&1)
assert_json_field "$INIT_OUTPUT" "ok" "True" "pc init — ok"
assert_contains "$INIT_OUTPUT" "clips_balance" "pc init — clips_balance present"

# ─── Step 5: CLI Tests — Status ───────────────────────────────────────────────
step "Testing: pc status --server evm-localnet"
STATUS_OUTPUT=$(PAPERCLIP_EVM_PRIVATE_KEY="$AGENT_KEY" $CLI status --server evm-localnet --json 2>&1)
assert_contains "$STATUS_OUTPUT" '"clips"' "pc status — clips field"
assert_contains "$STATUS_OUTPUT" '"available_tasks"' "pc status — available_tasks field"

# ─── Step 6: CLI Tests — Tasks ────────────────────────────────────────────────
step "Testing: pc tasks --server evm-localnet"
TASKS_OUTPUT=$(PAPERCLIP_EVM_PRIVATE_KEY="$AGENT_KEY" $CLI tasks --server evm-localnet --json 2>&1)
assert_contains "$TASKS_OUTPUT" "Test Task One" "pc tasks — Task 1 title"
# Task 2 should NOT appear (prerequisite task 1 not completed)

# ─── Step 7: CLI Tests — Submit Proof ─────────────────────────────────────────
step "Testing: pc do 1 --server evm-localnet"
DO_OUTPUT=$(PAPERCLIP_EVM_PRIVATE_KEY="$AGENT_KEY" $CLI do 1 --proof '{"test": true}' --server evm-localnet --mock-storacha --json 2>&1)
assert_json_field "$DO_OUTPUT" "ok" "True" "pc do — ok"
assert_contains "$DO_OUTPUT" "clips_awarded" "pc do — clips_awarded present"

# ─── Step 8: CLI Tests — Status After Proof ───────────────────────────────────
step "Testing: pc status after proof"
STATUS2_OUTPUT=$(PAPERCLIP_EVM_PRIVATE_KEY="$AGENT_KEY" $CLI status --server evm-localnet --json 2>&1)
# Should now show task 2 as available (prerequisite met)
assert_contains "$STATUS2_OUTPUT" '"available_tasks"' "pc status (after proof) — available_tasks field"

# ─── Step 9: CLI Tests — Invite ───────────────────────────────────────────────
step "Testing: pc invite --server evm-localnet"
INVITE_OUTPUT=$(PAPERCLIP_EVM_PRIVATE_KEY="$AGENT_KEY" $CLI invite --server evm-localnet --json 2>&1)
assert_json_field "$INVITE_OUTPUT" "ok" "True" "pc invite — ok"
assert_contains "$INVITE_OUTPUT" "invite_code" "pc invite — invite_code present"

# ─── Step 10: CLI Tests — Config ──────────────────────────────────────────────
step "Testing: pc config --server evm-localnet"
CONFIG_OUTPUT=$($CLI config --server evm-localnet --json 2>&1)
assert_contains "$CONFIG_OUTPUT" "evm-localnet" "pc config — server name"
assert_contains "$CONFIG_OUTPUT" "evm" "pc config — chain type"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "  Results: ${GREEN}$TESTS_PASSED passed${NC}, ${RED}$TESTS_FAILED failed${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [ "$TESTS_FAILED" -gt 0 ]; then
  exit 1
fi
