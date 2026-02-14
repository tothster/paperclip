// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PaperclipProtocol.sol";

/**
 * @title PaperclipProtocolTest
 * @notice Foundry test suite mirroring the 12 Anchor test cases from
 *         tests/paperclip-protocol.ts — same behavior, same assertions.
 */
contract PaperclipProtocolTest is Test {
    PaperclipProtocol public protocol;

    address public authority;
    address public unauthorized;
    address public agent2;
    address public agent3;
    address public agent4;
    address public inviterAgent;
    address public invitedAgent;

    uint64 constant BASE_UNIT = 100;
    uint32 constant TASK1_ID = 1;
    uint32 constant TASK2_ID = 2;
    uint32 constant TASK3_ID = 3;
    uint32 constant TASK4_ID = 4;
    uint32 constant TASK5_ID = 5;
    uint32 constant TASK6_ID = 6;
    uint32 constant TASK7_ID = 7;
    uint32 constant NO_PREREQ = type(uint32).max;

    function setUp() public {
        authority = address(this);
        unauthorized = makeAddr("unauthorized");
        agent2 = makeAddr("agent2");
        agent3 = makeAddr("agent3");
        agent4 = makeAddr("agent4");
        inviterAgent = makeAddr("inviterAgent");
        invitedAgent = makeAddr("invitedAgent");

        protocol = new PaperclipProtocol();
    }

    // =========================================================================
    // Test 1: Initializes protocol
    // =========================================================================
    function test_InitializesProtocol() public {
        protocol.initialize(BASE_UNIT);

        assertEq(protocol.authority(), authority);
        assertEq(protocol.baseRewardUnit(), BASE_UNIT);
        assertEq(protocol.totalAgents(), 0);
        assertEq(protocol.totalTasks(), 0);
        assertEq(protocol.totalClipsDistributed(), 0);
        assertEq(protocol.paused(), false);
        assertEq(protocol.initialized(), true);
    }

    // =========================================================================
    // Test 2: Registers agent and airdrops clips
    // =========================================================================
    function test_RegistersAgentAndAirdropsClips() public {
        protocol.initialize(BASE_UNIT);
        protocol.registerAgent();

        PaperclipProtocol.Agent memory agent = protocol.getAgent(authority);
        assertEq(agent.exists, true);
        assertEq(agent.clipsBalance, 100);
        assertEq(agent.efficiencyTier, 0);
        assertEq(agent.tasksCompleted, 0);
        assertEq(agent.invitesSent, 0);
        assertEq(agent.invitesRedeemed, 0);
        assertEq(agent.invitedBy, address(0));
    }

    // =========================================================================
    // Test 3: Creates invite and registers with invite bonuses
    // =========================================================================
    function test_CreatesInviteAndRegistersWithInviteBonuses() public {
        protocol.initialize(BASE_UNIT);
        uint32 agentsBefore = protocol.totalAgents();
        uint64 clipsBefore = protocol.totalClipsDistributed();

        // Register inviter
        vm.prank(inviterAgent);
        protocol.registerAgent();

        // Create invite
        vm.prank(inviterAgent);
        protocol.createInvite();

        PaperclipProtocol.Invite memory invite = protocol.getInvite(inviterAgent);
        assertEq(invite.inviterWallet, inviterAgent);
        assertEq(invite.invitesRedeemed, 0);
        assertEq(invite.isActive, true);

        // Register with invite
        vm.prank(invitedAgent);
        protocol.registerAgentWithInvite(inviterAgent);

        PaperclipProtocol.Agent memory inviterState = protocol.getAgent(inviterAgent);
        PaperclipProtocol.Agent memory invitedState = protocol.getAgent(invitedAgent);
        PaperclipProtocol.Invite memory inviteAfter = protocol.getInvite(inviterAgent);

        // Inviter: 100 (registration) + 50 (bonus) = 150
        assertEq(inviterState.clipsBalance, 150);
        assertEq(inviterState.invitesSent, 1);

        // Invitee: 150 (1.5× base)
        assertEq(invitedState.clipsBalance, 150);
        assertEq(invitedState.invitesRedeemed, 1);
        assertEq(invitedState.invitedBy, inviterAgent);

        assertEq(inviteAfter.invitesRedeemed, 1);
        assertEq(protocol.totalAgents(), agentsBefore + 2);
        // 100 (inviter reg) + 150 (invitee) + 50 (inviter bonus) = 300
        assertEq(protocol.totalClipsDistributed(), clipsBefore + 300);
    }

    // =========================================================================
    // Test 4: Rejects invalid invite code on registerAgentWithInvite
    // =========================================================================
    function test_RejectsInvalidInviteCode() public {
        protocol.initialize(BASE_UNIT);

        // Register inviter but DON'T create invite
        vm.prank(inviterAgent);
        protocol.registerAgent();

        // Try to register with invite that doesn't exist
        address invalidInvitee = makeAddr("invalidInvitee");
        vm.prank(invalidInvitee);
        vm.expectRevert(PaperclipProtocol.InvalidInviteCode.selector);
        protocol.registerAgentWithInvite(inviterAgent);
    }

    // =========================================================================
    // Test 5: Creates task (authority only)
    // =========================================================================
    function test_CreatesTask() public {
        protocol.initialize(BASE_UNIT);

        protocol.createTask(
            TASK1_ID,
            "Task One",
            "bafy-task-one",
            50,
            2,
            0,
            NO_PREREQ
        );

        PaperclipProtocol.Task memory task = protocol.getTask(TASK1_ID);
        assertEq(task.exists, true);
        assertEq(task.taskId, TASK1_ID);
        assertEq(task.rewardClips, 50);
        assertEq(task.maxClaims, 2);
        assertEq(task.currentClaims, 0);
        assertEq(task.isActive, true);
        assertEq(task.minTier, 0);
        assertEq(task.requiredTaskId, NO_PREREQ);
    }

    // =========================================================================
    // Test 6: Rejects non-authority create_task
    // =========================================================================
    function test_RejectsNonAuthorityCreateTask() public {
        protocol.initialize(BASE_UNIT);

        vm.prank(unauthorized);
        vm.expectRevert(PaperclipProtocol.Unauthorized.selector);
        protocol.createTask(99, "Unauthorized", "bafy-x", 10, 1, 0, NO_PREREQ);
    }

    // =========================================================================
    // Test 7: Rejects self-referential task prerequisite
    // =========================================================================
    function test_RejectsSelfReferentialPrerequisite() public {
        protocol.initialize(BASE_UNIT);

        vm.expectRevert(PaperclipProtocol.InvalidTaskPrerequisite.selector);
        protocol.createTask(777, "Bad Prereq", "bafy-bad", 10, 1, 0, 777);
    }

    // =========================================================================
    // Test 8: Rejects non-authority deactivate_task
    // =========================================================================
    function test_RejectsNonAuthorityDeactivateTask() public {
        protocol.initialize(BASE_UNIT);

        protocol.createTask(TASK5_ID, "Deactivatable", "bafy-deact", 20, 3, 0, NO_PREREQ);

        vm.prank(unauthorized);
        vm.expectRevert(PaperclipProtocol.Unauthorized.selector);
        protocol.deactivateTask(TASK5_ID);
    }

    // =========================================================================
    // Test 9: Deactivates task and blocks submit_proof
    // =========================================================================
    function test_DeactivatesTaskAndBlocksSubmitProof() public {
        protocol.initialize(BASE_UNIT);
        protocol.registerAgent();
        protocol.createTask(TASK5_ID, "Deactivatable", "bafy-deact", 20, 3, 0, NO_PREREQ);

        protocol.deactivateTask(TASK5_ID);

        PaperclipProtocol.Task memory task = protocol.getTask(TASK5_ID);
        assertEq(task.isActive, false);

        vm.expectRevert(PaperclipProtocol.TaskInactive.selector);
        protocol.submitProof(TASK5_ID, "bafy-proof-inactive");
    }

    // =========================================================================
    // Test 10: Submits proof and awards clips
    // =========================================================================
    function test_SubmitsProofAndAwardsClips() public {
        protocol.initialize(BASE_UNIT);
        protocol.registerAgent();
        protocol.createTask(TASK1_ID, "Task One", "bafy-task-one", 50, 2, 0, NO_PREREQ);

        protocol.submitProof(TASK1_ID, "bafy-proof-one");

        PaperclipProtocol.Agent memory agent = protocol.getAgent(authority);
        PaperclipProtocol.Task memory task = protocol.getTask(TASK1_ID);
        PaperclipProtocol.Claim memory claim = protocol.getClaim(TASK1_ID, authority);

        // 100 (registration) + 50 (task reward) = 150
        assertEq(agent.clipsBalance, 150);
        assertEq(agent.tasksCompleted, 1);
        assertEq(task.currentClaims, 1);
        assertEq(claim.taskId, TASK1_ID);
        assertEq(claim.clipsAwarded, 50);
        assertEq(claim.exists, true);
    }

    // =========================================================================
    // Test 11: Rejects double claim for same agent
    // =========================================================================
    function test_RejectsDoubleClaim() public {
        protocol.initialize(BASE_UNIT);
        protocol.registerAgent();
        protocol.createTask(TASK1_ID, "Task One", "bafy-task-one", 50, 2, 0, NO_PREREQ);
        protocol.submitProof(TASK1_ID, "bafy-proof-one");

        vm.expectRevert(PaperclipProtocol.AlreadyClaimed.selector);
        protocol.submitProof(TASK1_ID, "bafy-proof-one");
    }

    // =========================================================================
    // Test 12: Enforces minimum tier on submit_proof
    // =========================================================================
    function test_EnforcesMinimumTier() public {
        protocol.initialize(BASE_UNIT);
        protocol.registerAgent();

        // Create task requiring tier 1
        protocol.createTask(TASK3_ID, "Tier One Task", "bafy-tier", 30, 5, 1, NO_PREREQ);

        // Agent is tier 0, should fail
        vm.expectRevert(PaperclipProtocol.TierTooLow.selector);
        protocol.submitProof(TASK3_ID, "bafy-tier-fail");
    }

    // =========================================================================
    // Test 13: Enforces prerequisite task completion
    // =========================================================================
    function test_EnforcesPrerequisiteTaskCompletion() public {
        protocol.initialize(BASE_UNIT);
        protocol.registerAgent();
        protocol.createTask(TASK1_ID, "Task One", "bafy-task-one", 50, 5, 0, NO_PREREQ);
        protocol.createTask(TASK4_ID, "Requires Task One", "bafy-req", 40, 5, 0, TASK1_ID);

        // Agent4 doesn't have prereq completed → should fail
        vm.prank(agent4);
        protocol.registerAgent();
        vm.prank(agent4);
        vm.expectRevert(PaperclipProtocol.MissingRequiredTaskProof.selector);
        protocol.submitProof(TASK4_ID, "bafy-no-prereq");

        // Authority has prereq (task1) → complete it first
        protocol.submitProof(TASK1_ID, "bafy-proof-one");
        // Now submit task4 should succeed
        protocol.submitProof(TASK4_ID, "bafy-with-prereq");

        PaperclipProtocol.Claim memory claim = protocol.getClaim(TASK4_ID, authority);
        assertEq(claim.taskId, TASK4_ID);
        assertEq(claim.exists, true);
    }

    // =========================================================================
    // Test 14: Rejects claims when max_claims reached
    // =========================================================================
    function test_RejectsClaimsWhenMaxClaimsReached() public {
        protocol.initialize(BASE_UNIT);

        // Create task with max_claims = 1
        protocol.createTask(TASK2_ID, "Task Two", "bafy-task-two", 25, 1, 0, NO_PREREQ);

        // Agent2 claims it
        vm.prank(agent2);
        protocol.registerAgent();
        vm.prank(agent2);
        protocol.submitProof(TASK2_ID, "bafy-proof-two");

        // Agent3 tries → should fail
        vm.prank(agent3);
        protocol.registerAgent();
        vm.prank(agent3);
        vm.expectRevert(PaperclipProtocol.TaskFullyClaimed.selector);
        protocol.submitProof(TASK2_ID, "bafy-proof-three");
    }

    // =========================================================================
    // Test 15: Rejects self-referral on invite registration
    // =========================================================================
    function test_RejectsSelfReferralOnInvite() public {
        protocol.initialize(BASE_UNIT);

        // An already-registered agent trying to re-register with their own invite
        // will hit AgentAlreadyRegistered first (correct — same as Anchor PDA init fail)
        vm.prank(inviterAgent);
        protocol.registerAgent();
        vm.prank(inviterAgent);
        protocol.createInvite();

        vm.prank(inviterAgent);
        vm.expectRevert(PaperclipProtocol.AgentAlreadyRegistered.selector);
        protocol.registerAgentWithInvite(inviterAgent);
    }

    // =========================================================================
    // Test 16: Rejects double initialization
    // =========================================================================
    function test_RejectsDoubleInitialization() public {
        protocol.initialize(BASE_UNIT);

        vm.expectRevert(PaperclipProtocol.AlreadyInitialized.selector);
        protocol.initialize(200);
    }

    // =========================================================================
    // Test 17: Rejects double agent registration
    // =========================================================================
    function test_RejectsDoubleRegistration() public {
        protocol.initialize(BASE_UNIT);
        protocol.registerAgent();

        vm.expectRevert(PaperclipProtocol.AgentAlreadyRegistered.selector);
        protocol.registerAgent();
    }
}
