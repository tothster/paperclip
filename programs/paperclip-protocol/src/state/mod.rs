use anchor_lang::prelude::*;

use crate::constants::{
    AGENT_RESERVED_BYTES, CLAIM_RESERVED_BYTES, INVITE_RESERVED_BYTES, PROTOCOL_RESERVED_BYTES,
    TASK_RESERVED_BYTES,
};

#[account]
pub struct ProtocolState {
    pub bump: u8,
    pub layout_version: u8,
    pub authority: Pubkey,
    pub base_reward_unit: u64,
    pub total_agents: u32,
    pub total_tasks: u32,
    pub total_clips_distributed: u64,
    pub paused: bool,
    pub reserved: [u8; PROTOCOL_RESERVED_BYTES],
}

impl ProtocolState {
    pub const SPACE: usize = 8 + 1 + 1 + 32 + 8 + 4 + 4 + 8 + 1 + PROTOCOL_RESERVED_BYTES;
}

#[account]
pub struct AgentAccount {
    pub bump: u8,
    pub layout_version: u8,
    pub wallet: Pubkey,
    pub clips_balance: u64,
    pub efficiency_tier: u8,
    pub tasks_completed: u32,
    pub registered_at: i64,
    pub last_active_at: i64,
    pub invites_sent: u32,
    pub invites_redeemed: u32,
    pub invited_by: Pubkey,
    pub reserved: [u8; AGENT_RESERVED_BYTES],
}

impl AgentAccount {
    pub const SPACE: usize =
        8 + 1 + 1 + 32 + 8 + 1 + 4 + 8 + 8 + 4 + 4 + 32 + AGENT_RESERVED_BYTES;
}

#[account]
pub struct TaskRecord {
    pub bump: u8,
    pub layout_version: u8,
    pub task_id: u32,
    pub creator: Pubkey,
    pub title: [u8; 32],
    pub content_cid: [u8; 64],
    pub reward_clips: u64,
    pub max_claims: u16,
    pub current_claims: u16,
    pub is_active: bool,
    pub created_at: i64,
    pub min_tier: u8,
    pub required_task_id: u32,
    pub reserved: [u8; TASK_RESERVED_BYTES],
}

impl TaskRecord {
    pub const SPACE: usize =
        8 + 1 + 1 + 4 + 32 + 32 + 64 + 8 + 2 + 2 + 1 + 8 + 1 + 4 + TASK_RESERVED_BYTES;
}

#[account]
pub struct ClaimRecord {
    pub bump: u8,
    pub layout_version: u8,
    pub task_id: u32,
    pub agent: Pubkey,
    pub proof_cid: [u8; 64],
    pub clips_awarded: u64,
    pub completed_at: i64,
    pub reserved: [u8; CLAIM_RESERVED_BYTES],
}

impl ClaimRecord {
    pub const SPACE: usize = 8 + 1 + 1 + 4 + 32 + 64 + 8 + 8 + CLAIM_RESERVED_BYTES;
}

#[account]
pub struct InviteRecord {
    pub bump: u8,
    pub layout_version: u8,
    pub inviter_wallet: Pubkey,
    pub invite_code: [u8; 32],
    pub invites_redeemed: u32,
    pub created_at: i64,
    pub is_active: bool,
    pub reserved: [u8; INVITE_RESERVED_BYTES],
}

impl InviteRecord {
    pub const SPACE: usize =
        8 + 1 + 1 + 32 + 32 + 4 + 8 + 1 + INVITE_RESERVED_BYTES;
}
