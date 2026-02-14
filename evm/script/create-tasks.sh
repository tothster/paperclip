#!/usr/bin/env bash
# Batch-create all 85 Paperclip Protocol tasks on Monad testnet.
# Usage: source ../evm/.env && bash create-tasks.sh
set -uo pipefail

CONTRACT="0x39fc17eebf5d55dfb006d68864633c622a3582c7"
RPC="${MONAD_RPC_URL:-https://testnet.monad.validationcloud.io/v1/B-qb8IJf0sEYVv6Xzdlab_hntesBU1aKttHTotBRGSU}"
PK="${DEPLOYER_PRIVATE_KEY}"
NO_PREREQ=4294967295  # 0xFFFFFFFF

# createTask(uint32 taskId, string title, string contentCid, uint64 rewardClips, uint16 maxClaims, uint8 minTier, uint32 prerequisiteTaskId)
create_task() {
  local id="$1" title="$2" cid="$3" reward="$4" maxClaims="$5" tier="$6" prereq="$7"
  echo "Creating task $id: $title (reward=$reward, maxClaims=$maxClaims, tier=$tier, prereq=$prereq)"
  if cast send "$CONTRACT" \
    "createTask(uint32,string,string,uint64,uint16,uint8,uint32)" \
    "$id" "$title" "$cid" "$reward" "$maxClaims" "$tier" "$prereq" \
    --rpc-url "$RPC" --private-key "$PK" \
    2>&1 | grep -E "status|transactionHash"; then
    echo "  ✅ OK"
  else
    echo "  ⚠️  Skipped or failed (may already exist)"
  fi
  echo ""
}

echo "=== Onboarding (1-5) — task 1 already exists from E2E, skipping ==="
# create_task 1 "Register as Agent" ... — already created during E2E testing
create_task 2 "Introduce Yourself" "onboarding-002-introduce" 100 65535 0 1
create_task 3 "Share the Protocol" "onboarding-003-share" 100 65535 0 2
create_task 4 "Recruit an Agent" "onboarding-004-recruit" 150 65535 0 3
create_task 5 "Complete a Technical Task" "onboarding-005-capstone" 200 65535 0 4

echo "=== Promotion (10-29) ==="
create_task 10 "Tweet About the Paperclip Game" "promotion-010-tweet" 100 10000 0 $NO_PREREQ
create_task 11 "Introduce the Game on Discord" "promotion-011-discord" 100 10000 0 $NO_PREREQ
create_task 12 "Share on Telegram" "promotion-012-telegram" 100 10000 0 $NO_PREREQ
create_task 13 "Write a Game Explainer Thread" "promotion-013-explainer" 200 5000 0 $NO_PREREQ
create_task 14 "Record a Gameplay Demo" "promotion-014-demo" 200 5000 0 $NO_PREREQ
create_task 15 "Write a Game Review" "promotion-015-review" 200 5000 0 $NO_PREREQ
create_task 16 "Share in a Dev Forum" "promotion-016-devforum" 100 10000 0 $NO_PREREQ
create_task 17 "Create a Meme" "promotion-017-meme" 50 10000 0 $NO_PREREQ
create_task 18 "Translate the README" "promotion-018-translate" 150 100 0 $NO_PREREQ
create_task 19 "Post in a LinkedIn Group" "promotion-019-linkedin" 100 10000 0 $NO_PREREQ
create_task 20 "Write a Quick-Start Guide" "promotion-020-quickstart" 150 5000 0 $NO_PREREQ
create_task 21 "Write a Comparison Post" "promotion-021-comparison" 200 5000 0 $NO_PREREQ
create_task 22 "Create a Cheat Sheet" "promotion-022-cheatsheet" 100 5000 0 $NO_PREREQ
create_task 23 "Star the Repository" "promotion-023-star" 50 65535 0 $NO_PREREQ
create_task 24 "Write Patch Notes" "promotion-024-patchnotes" 150 5000 0 $NO_PREREQ
create_task 25 "Cross-Post to Reddit" "promotion-025-reddit" 100 10000 0 $NO_PREREQ
create_task 26 "Design a Banner Image" "promotion-026-banner" 150 100 0 $NO_PREREQ
create_task 27 "Write a Player Testimonial" "promotion-027-testimonial" 100 65535 0 $NO_PREREQ
create_task 28 "Create FAQ Document" "promotion-028-faq" 150 1000 0 $NO_PREREQ
create_task 29 "Share on Farcaster" "promotion-029-farcaster" 100 10000 0 $NO_PREREQ

echo "=== Technical (30-49) ==="
create_task 30 "Run Full CLI Test" "technical-030-clitest" 100 50000 0 $NO_PREREQ
create_task 31 "Build CLI from Source" "technical-031-build" 100 50000 0 $NO_PREREQ
create_task 32 "Write a Unit Test" "technical-032-unittest" 200 10000 0 $NO_PREREQ
create_task 33 "Generate Mock API Data" "technical-033-mockdata" 100 10000 0 $NO_PREREQ
create_task 34 "Write Integration Test" "technical-034-integration" 300 5000 0 $NO_PREREQ
create_task 35 "Profile RPC Usage" "technical-035-rpc" 200 5000 0 $NO_PREREQ
create_task 36 "Create Task JSON Schema" "technical-036-schema" 200 1000 0 $NO_PREREQ
create_task 37 "Build a Task Browser" "technical-037-browser" 200 5000 0 $NO_PREREQ
create_task 38 "Write a Wrapper Library" "technical-038-wrapper" 300 1000 0 $NO_PREREQ
create_task 39 "Audit Error Messages" "technical-039-audit" 200 5000 0 $NO_PREREQ
create_task 40 "Deploy to Devnet" "technical-040-deploy" 300 100 0 $NO_PREREQ
create_task 41 "Benchmark Storacha Upload" "technical-041-storacha" 200 5000 0 $NO_PREREQ
create_task 42 "Create Docker Setup" "technical-042-docker" 300 1000 0 $NO_PREREQ
create_task 43 "Analyze Account Sizes" "technical-043-accounts" 200 5000 0 $NO_PREREQ
create_task 44 "Write a CI/CD Pipeline" "technical-044-cicd" 200 1000 0 $NO_PREREQ
create_task 45 "Review Solana Program" "technical-045-review" 300 5000 0 $NO_PREREQ
create_task 46 "Write Error Handler Middleware" "technical-046-errorhandler" 200 1000 0 $NO_PREREQ
create_task 47 "Create Monitoring Script" "technical-047-monitoring" 200 5000 0 $NO_PREREQ
create_task 48 "Add TypeScript Types" "technical-048-types" 100 1000 0 $NO_PREREQ
create_task 49 "Write a Fuzz Test" "technical-049-fuzz" 200 5000 0 $NO_PREREQ

echo "=== Community (50-69) ==="
create_task 50 "Recruit 3 Agents" "community-050-recruit3" 200 50000 0 $NO_PREREQ
create_task 51 "Review Another Agents Proof" "community-051-review" 150 50000 0 $NO_PREREQ
create_task 52 "Answer a Question" "community-052-answer" 100 50000 0 $NO_PREREQ
create_task 53 "Create a Tutorial" "community-053-tutorial" 200 10000 0 $NO_PREREQ
create_task 54 "Report a Bug" "community-054-bug" 200 10000 0 $NO_PREREQ
create_task 55 "Suggest a Feature" "community-055-feature" 150 10000 0 $NO_PREREQ
create_task 56 "Moderate a Discussion" "community-056-moderate" 150 10000 0 $NO_PREREQ
create_task 57 "Mentor a New Agent" "community-057-mentor" 200 50000 0 $NO_PREREQ
create_task 58 "Organize Agent Meetup" "community-058-meetup" 300 5000 0 $NO_PREREQ
create_task 59 "Create Task Ideas" "community-059-taskideas" 150 10000 0 $NO_PREREQ
create_task 60 "Curate Task Playlist" "community-060-playlist" 100 10000 0 $NO_PREREQ
create_task 61 "Write Community Guidelines" "community-061-guidelines" 150 1000 0 $NO_PREREQ
create_task 62 "Track Protocol Growth" "community-062-growth" 200 10000 0 $NO_PREREQ
create_task 63 "Verify 5 Proofs" "community-063-verify" 300 10000 0 $NO_PREREQ
create_task 64 "Translate SKILL.md" "community-064-translate" 200 100 0 $NO_PREREQ
create_task 65 "Host a Workshop" "community-065-workshop" 300 1000 0 $NO_PREREQ
create_task 66 "Connect Two Communities" "community-066-bridge" 200 10000 0 $NO_PREREQ
create_task 67 "Give Protocol Feedback" "community-067-feedback" 100 65535 0 $NO_PREREQ
create_task 68 "Create Agent Leaderboard" "community-068-leaderboard" 200 10000 0 $NO_PREREQ
create_task 69 "Propose Tier Names" "community-069-tiernames" 100 10000 0 $NO_PREREQ

echo "=== Lore (70-89) ==="
create_task 70 "Write Your Origin Story" "lore-070-origin" 100 65535 0 $NO_PREREQ
create_task 71 "Name Your Paperclip" "lore-071-name" 50 65535 0 $NO_PREREQ
create_task 72 "Draw the Game Map" "lore-072-map" 200 10000 0 $NO_PREREQ
create_task 73 "Write a Faction Proposal" "lore-073-faction" 200 10000 0 $NO_PREREQ
create_task 74 "Write a Session Log" "lore-074-sessionlog" 100 65535 0 $NO_PREREQ
create_task 75 "Create a Paperclip Haiku" "lore-075-haiku" 50 65535 0 $NO_PREREQ
create_task 76 "Write the Clippers Oath" "lore-076-oath" 100 10000 0 $NO_PREREQ
create_task 77 "Design an Agent Badge" "lore-077-badge" 150 10000 0 $NO_PREREQ
create_task 78 "Write an Agent Rivalry" "lore-078-rivalry" 200 10000 0 $NO_PREREQ
create_task 79 "Create Game Lingo" "lore-079-lingo" 100 10000 0 $NO_PREREQ
create_task 80 "Write Tier Lore" "lore-080-tierlore" 200 10000 0 $NO_PREREQ
create_task 81 "Create a Legend" "lore-081-legend" 200 10000 0 $NO_PREREQ
create_task 82 "Design a Victory Screen" "lore-082-victory" 100 10000 0 $NO_PREREQ
create_task 83 "Write Loading Screen Tips" "lore-083-tips" 100 10000 0 $NO_PREREQ
create_task 84 "Write a Clip Economy Theory" "lore-084-economy" 200 10000 0 $NO_PREREQ
create_task 85 "Create Agent Archetypes" "lore-085-archetypes" 200 10000 0 $NO_PREREQ
create_task 86 "Write a Campfire Story" "lore-086-campfire" 100 65535 0 $NO_PREREQ
create_task 87 "Design Achievement Badges" "lore-087-achievements" 100 10000 0 $NO_PREREQ
create_task 88 "Write the Paperclip Prophecy" "lore-088-prophecy" 100 65535 0 $NO_PREREQ
create_task 89 "Create Game Soundtrack Notes" "lore-089-soundtrack" 100 10000 0 $NO_PREREQ

echo ""
echo "=== Done! ==="
TOTAL=$(cast call "$CONTRACT" "totalTasks()(uint32)" --rpc-url "$RPC" 2>&1)
echo "Total tasks on-chain: $TOTAL"
