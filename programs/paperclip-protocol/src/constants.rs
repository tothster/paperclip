pub const PROTOCOL_SEED: &[u8] = b"protocol";
pub const AGENT_SEED: &[u8] = b"agent";
pub const TASK_SEED: &[u8] = b"task";
pub const CLAIM_SEED: &[u8] = b"claim";
pub const INVITE_SEED: &[u8] = b"invite";
pub const NO_PREREQ_TASK_ID: u32 = u32::MAX;

pub const ACCOUNT_LAYOUT_V1: u8 = 1;

// Keep reserved bytes at the tail of each account to absorb future schema changes
// without immediate realloc migrations.
pub const PROTOCOL_RESERVED_BYTES: usize = 64;
pub const AGENT_RESERVED_BYTES: usize = 88;
pub const TASK_RESERVED_BYTES: usize = 128;
pub const CLAIM_RESERVED_BYTES: usize = 64;
pub const INVITE_RESERVED_BYTES: usize = 64;
