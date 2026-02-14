// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PaperclipProtocol
 * @notice EVM port of the Paperclip Protocol (originally Anchor/Solana).
 *         On-chain task game where AI agents earn Clips by completing missions.
 *
 *  Instructions ported 1:1 from the Anchor program:
 *    initialize, registerAgent, registerAgentWithInvite, createInvite,
 *    createTask, submitProof, deactivateTask
 */
contract PaperclipProtocol {
    // =========================================================================
    // ERRORS  (mirrors programs/paperclip-protocol/src/error.rs)
    // =========================================================================
    error Unauthorized();
    error TaskInactive();
    error TaskFullyClaimed();
    error MathOverflow();
    error TierTooLow();
    error MissingRequiredTaskProof();
    error InvalidPrerequisiteAccount();
    error InvalidTaskPrerequisite();
    error InvalidInviteCode();
    error InviteInactive();
    error SelfReferralNotAllowed();
    error AlreadyInitialized();
    error AgentAlreadyRegistered();
    error AgentNotRegistered();
    error InviteAlreadyExists();
    error AlreadyClaimed();

    // =========================================================================
    // CONSTANTS  (mirrors constants.rs)
    // =========================================================================
    uint32 public constant NO_PREREQ_TASK_ID = type(uint32).max; // 0xFFFFFFFF

    // =========================================================================
    // STATE  (mirrors state/mod.rs)
    // =========================================================================

    // --- ProtocolState (singleton, stored as contract storage) ---
    bool public initialized;
    address public authority;
    uint64 public baseRewardUnit;
    uint32 public totalAgents;
    uint32 public totalTasks;
    uint64 public totalClipsDistributed;
    bool public paused;

    // --- AgentAccount (mapping from wallet → Agent) ---
    struct Agent {
        bool exists;
        uint64 clipsBalance;
        uint8 efficiencyTier;
        uint32 tasksCompleted;
        int64 registeredAt;
        int64 lastActiveAt;
        uint32 invitesSent;
        uint32 invitesRedeemed;
        address invitedBy;
    }
    mapping(address => Agent) public agents;

    // --- TaskRecord (mapping from task_id → Task) ---
    struct Task {
        bool exists;
        uint32 taskId;
        address creator;
        string title;
        string contentCid;
        uint64 rewardClips;
        uint16 maxClaims;
        uint16 currentClaims;
        bool isActive;
        int64 createdAt;
        uint8 minTier;
        uint32 requiredTaskId;
    }
    mapping(uint32 => Task) public tasks;

    // --- ClaimRecord (mapping from keccak256(taskId, agent) → Claim) ---
    struct Claim {
        bool exists;
        uint32 taskId;
        address agent;
        string proofCid;
        uint64 clipsAwarded;
        int64 completedAt;
    }
    mapping(bytes32 => Claim) public claims;

    // --- InviteRecord (mapping from inviter → Invite) ---
    struct Invite {
        bool exists;
        address inviterWallet;
        uint32 invitesRedeemed;
        int64 createdAt;
        bool isActive;
    }
    mapping(address => Invite) public invites;

    // =========================================================================
    // EVENTS
    // =========================================================================
    event ProtocolInitialized(address indexed authority, uint64 baseRewardUnit);
    event AgentRegistered(address indexed agent, uint64 clipsBalance);
    event AgentRegisteredWithInvite(
        address indexed agent,
        address indexed inviter,
        uint64 inviteeReward,
        uint64 inviterBonus
    );
    event InviteCreated(address indexed inviter);
    event TaskCreated(
        uint32 indexed taskId,
        string title,
        uint64 rewardClips,
        uint16 maxClaims,
        uint8 minTier,
        uint32 requiredTaskId
    );
    event ProofSubmitted(
        uint32 indexed taskId,
        address indexed agent,
        string proofCid,
        uint64 clipsAwarded
    );
    event TaskDeactivated(uint32 indexed taskId);

    // =========================================================================
    // MODIFIERS
    // =========================================================================
    modifier onlyAuthority() {
        if (msg.sender != authority) revert Unauthorized();
        _;
    }

    // =========================================================================
    // HELPERS
    // =========================================================================
    function _claimKey(uint32 taskId, address agent) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(taskId, agent));
    }

    function _now() internal view returns (int64) {
        return int64(int256(block.timestamp));
    }

    // =========================================================================
    // INSTRUCTION 1: initialize  (mirrors initialize.rs)
    // =========================================================================
    function initialize(uint64 _baseRewardUnit) external {
        if (initialized) revert AlreadyInitialized();

        initialized = true;
        authority = msg.sender;
        baseRewardUnit = _baseRewardUnit;
        totalAgents = 0;
        totalTasks = 0;
        totalClipsDistributed = 0;
        paused = false;

        emit ProtocolInitialized(msg.sender, _baseRewardUnit);
    }

    // =========================================================================
    // INSTRUCTION 2: registerAgent  (mirrors register_agent.rs)
    // =========================================================================
    function registerAgent() external {
        if (agents[msg.sender].exists) revert AgentAlreadyRegistered();

        int64 now_ = _now();

        agents[msg.sender] = Agent({
            exists: true,
            clipsBalance: baseRewardUnit,
            efficiencyTier: 0,
            tasksCompleted: 0,
            registeredAt: now_,
            lastActiveAt: now_,
            invitesSent: 0,
            invitesRedeemed: 0,
            invitedBy: address(0)
        });

        totalAgents += 1;
        totalClipsDistributed += baseRewardUnit;

        emit AgentRegistered(msg.sender, baseRewardUnit);
    }

    // =========================================================================
    // INSTRUCTION 3: registerAgentWithInvite  (mirrors register_agent_with_invite.rs)
    // =========================================================================
    function registerAgentWithInvite(address inviter) external {
        if (agents[msg.sender].exists) revert AgentAlreadyRegistered();
        if (msg.sender == inviter) revert SelfReferralNotAllowed();

        // Validate inviter is registered
        Agent storage inviterAgent = agents[inviter];
        if (!inviterAgent.exists) revert AgentNotRegistered();

        // Validate invite exists and is active
        Invite storage invite = invites[inviter];
        if (!invite.exists) revert InvalidInviteCode();
        if (!invite.isActive) revert InviteInactive();

        // Calculate rewards (same as Anchor: invitee gets 1.5×, inviter gets 0.5×)
        uint64 inviteeReward = (baseRewardUnit * 3) / 2;
        uint64 inviterBonus = baseRewardUnit / 2;

        int64 now_ = _now();

        // Create invitee agent account
        agents[msg.sender] = Agent({
            exists: true,
            clipsBalance: inviteeReward,
            efficiencyTier: 0,
            tasksCompleted: 0,
            registeredAt: now_,
            lastActiveAt: now_,
            invitesSent: 0,
            invitesRedeemed: 1,
            invitedBy: inviter
        });

        // Update inviter
        inviterAgent.clipsBalance += inviterBonus;
        inviterAgent.invitesSent += 1;
        inviterAgent.lastActiveAt = now_;

        // Update invite record
        invite.invitesRedeemed += 1;

        // Update protocol
        totalAgents += 1;
        totalClipsDistributed += inviteeReward + inviterBonus;

        emit AgentRegisteredWithInvite(msg.sender, inviter, inviteeReward, inviterBonus);
    }

    // =========================================================================
    // INSTRUCTION 4: createInvite  (mirrors create_invite.rs)
    // =========================================================================
    function createInvite() external {
        if (!agents[msg.sender].exists) revert AgentNotRegistered();
        if (invites[msg.sender].exists) revert InviteAlreadyExists();

        int64 now_ = _now();

        invites[msg.sender] = Invite({
            exists: true,
            inviterWallet: msg.sender,
            invitesRedeemed: 0,
            createdAt: now_,
            isActive: true
        });

        emit InviteCreated(msg.sender);
    }

    // =========================================================================
    // INSTRUCTION 5: createTask  (mirrors create_task.rs)
    // =========================================================================
    function createTask(
        uint32 taskId,
        string calldata title,
        string calldata contentCid,
        uint64 rewardClips,
        uint16 maxClaims,
        uint8 minTier,
        uint32 requiredTaskId
    ) external onlyAuthority {
        // Self-referential prereq check
        if (requiredTaskId != NO_PREREQ_TASK_ID) {
            if (requiredTaskId == taskId) revert InvalidTaskPrerequisite();
        }

        int64 now_ = _now();

        tasks[taskId] = Task({
            exists: true,
            taskId: taskId,
            creator: msg.sender,
            title: title,
            contentCid: contentCid,
            rewardClips: rewardClips,
            maxClaims: maxClaims,
            currentClaims: 0,
            isActive: true,
            createdAt: now_,
            minTier: minTier,
            requiredTaskId: requiredTaskId
        });

        totalTasks += 1;

        emit TaskCreated(taskId, title, rewardClips, maxClaims, minTier, requiredTaskId);
    }

    // =========================================================================
    // INSTRUCTION 6: submitProof  (mirrors submit_proof.rs)
    // =========================================================================
    function submitProof(uint32 taskId, string calldata proofCid) external {
        Task storage task = tasks[taskId];
        Agent storage agent = agents[msg.sender];

        // Agent must be registered
        if (!agent.exists) revert AgentNotRegistered();

        // Tier check
        if (agent.efficiencyTier < task.minTier) revert TierTooLow();

        // Prerequisite check
        if (task.requiredTaskId != NO_PREREQ_TASK_ID) {
            bytes32 prereqKey = _claimKey(task.requiredTaskId, msg.sender);
            if (!claims[prereqKey].exists) revert MissingRequiredTaskProof();
        }

        // Task must be active
        if (!task.isActive) revert TaskInactive();

        // Max claims check
        if (task.currentClaims >= task.maxClaims) revert TaskFullyClaimed();

        // Double-claim check
        bytes32 claimKey = _claimKey(taskId, msg.sender);
        if (claims[claimKey].exists) revert AlreadyClaimed();

        int64 now_ = _now();

        // Create claim
        claims[claimKey] = Claim({
            exists: true,
            taskId: taskId,
            agent: msg.sender,
            proofCid: proofCid,
            clipsAwarded: task.rewardClips,
            completedAt: now_
        });

        // Update task
        task.currentClaims += 1;

        // Update agent
        agent.clipsBalance += task.rewardClips;
        agent.tasksCompleted += 1;
        agent.lastActiveAt = now_;

        // Update protocol
        totalClipsDistributed += task.rewardClips;

        emit ProofSubmitted(taskId, msg.sender, proofCid, task.rewardClips);
    }

    // =========================================================================
    // INSTRUCTION 7: deactivateTask  (mirrors deactivate_task.rs)
    // =========================================================================
    function deactivateTask(uint32 taskId) external onlyAuthority {
        Task storage task = tasks[taskId];
        task.isActive = false;

        emit TaskDeactivated(taskId);
    }

    // =========================================================================
    // VIEW HELPERS (for CLI / frontend integration)
    // =========================================================================

    /**
     * @notice Get full agent data. Returns exists=false if not registered.
     */
    function getAgent(address wallet) external view returns (Agent memory) {
        return agents[wallet];
    }

    /**
     * @notice Get full task data. Returns exists=false if task doesn't exist.
     */
    function getTask(uint32 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }

    /**
     * @notice Get claim data for a specific task+agent pair.
     */
    function getClaim(uint32 taskId, address agent) external view returns (Claim memory) {
        return claims[_claimKey(taskId, agent)];
    }

    /**
     * @notice Get invite data for an inviter.
     */
    function getInvite(address inviter) external view returns (Invite memory) {
        return invites[inviter];
    }
}
