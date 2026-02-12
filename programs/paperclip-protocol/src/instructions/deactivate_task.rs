use anchor_lang::prelude::*;

use crate::{
    constants::{PROTOCOL_SEED, TASK_SEED},
    error::ErrorCode,
    state::{ProtocolState, TaskRecord},
};

#[derive(Accounts)]
#[instruction(task_id: u32)]
pub struct DeactivateTask<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        constraint = protocol.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        mut,
        seeds = [TASK_SEED, task_id.to_le_bytes().as_ref()],
        bump = task.bump
    )]
    pub task: Account<'info, TaskRecord>,
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<DeactivateTask>, _task_id: u32) -> Result<()> {
    let task = &mut ctx.accounts.task;
    task.is_active = false;
    Ok(())
}
