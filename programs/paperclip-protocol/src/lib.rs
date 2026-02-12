pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("Fehg9nbFCRnrZAuaW6tiqnegbHpHgizV9bvakhAWix6v");

#[program]
pub mod paperclip_protocol {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, base_reward_unit: u64) -> Result<()> {
        initialize::handler(ctx, base_reward_unit)
    }

    pub fn register_agent(ctx: Context<RegisterAgent>) -> Result<()> {
        register_agent::handler(ctx)
    }

    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: u32,
        title: [u8; 32],
        content_cid: [u8; 64],
        reward_clips: u64,
        max_claims: u16,
        min_tier: u8,
        required_task_id: u32,
    ) -> Result<()> {
        create_task::handler(
            ctx,
            task_id,
            title,
            content_cid,
            reward_clips,
            max_claims,
            min_tier,
            required_task_id,
        )
    }

    pub fn submit_proof(
        ctx: Context<SubmitProof>,
        task_id: u32,
        proof_cid: [u8; 64],
    ) -> Result<()> {
        submit_proof::handler(ctx, task_id, proof_cid)
    }
}
