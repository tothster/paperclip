use anchor_lang::prelude::*;

use crate::{
    constants::{NO_PREREQ_TASK_ID, PROTOCOL_SEED, TASK_SEED},
    error::ErrorCode,
    state::{ProtocolState, TaskRecord},
};

#[derive(Accounts)]
#[instruction(task_id: u32)]
pub struct CreateTask<'info> {
    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        constraint = protocol.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub protocol: Account<'info, ProtocolState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = TaskRecord::SPACE,
        seeds = [TASK_SEED, task_id.to_le_bytes().as_ref()],
        bump
    )]
    pub task: Account<'info, TaskRecord>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateTask>,
    task_id: u32,
    title: [u8; 32],
    content_cid: [u8; 64],
    reward_clips: u64,
    max_claims: u16,
    min_tier: u8,
    required_task_id: u32,
) -> Result<()> {
    let task = &mut ctx.accounts.task;
    let protocol = &mut ctx.accounts.protocol;
    let now = Clock::get()?.unix_timestamp;

    if required_task_id != NO_PREREQ_TASK_ID {
        require!(
            required_task_id != task_id,
            ErrorCode::InvalidTaskPrerequisite
        );
    }

    task.bump = ctx.bumps.task;
    task.task_id = task_id;
    task.creator = ctx.accounts.authority.key();
    task.title = title;
    task.content_cid = content_cid;
    task.reward_clips = reward_clips;
    task.max_claims = max_claims;
    task.current_claims = 0;
    task.is_active = true;
    task.created_at = now;
    task.min_tier = min_tier;
    task.required_task_id = required_task_id;

    protocol.total_tasks = protocol
        .total_tasks
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(())
}
