use anchor_lang::prelude::*;

use crate::{
    constants::{AGENT_SEED, CLAIM_SEED, PROTOCOL_SEED, TASK_SEED},
    error::ErrorCode,
    state::{AgentAccount, ClaimRecord, ProtocolState, TaskRecord},
};

#[derive(Accounts)]
#[instruction(task_id: u32)]
pub struct SubmitProof<'info> {
    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        mut,
        seeds = [TASK_SEED, task_id.to_le_bytes().as_ref()],
        bump = task.bump
    )]
    pub task: Account<'info, TaskRecord>,
    #[account(
        mut,
        seeds = [AGENT_SEED, agent.key().as_ref()],
        bump = agent_account.bump
    )]
    pub agent_account: Account<'info, AgentAccount>,
    #[account(
        init,
        payer = agent,
        space = ClaimRecord::SPACE,
        seeds = [CLAIM_SEED, task_id.to_le_bytes().as_ref(), agent.key().as_ref()],
        bump
    )]
    pub claim: Account<'info, ClaimRecord>,
    #[account(mut)]
    pub agent: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SubmitProof>, task_id: u32, proof_cid: [u8; 64]) -> Result<()> {
    let task = &mut ctx.accounts.task;
    let protocol = &mut ctx.accounts.protocol;
    let agent_account = &mut ctx.accounts.agent_account;
    let now = Clock::get()?.unix_timestamp;

    require!(task.is_active, ErrorCode::TaskInactive);
    require!(
        task.current_claims < task.max_claims,
        ErrorCode::TaskFullyClaimed
    );

    task.current_claims = task
        .current_claims
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    agent_account.clips_balance = agent_account
        .clips_balance
        .checked_add(task.reward_clips)
        .ok_or(ErrorCode::MathOverflow)?;
    agent_account.tasks_completed = agent_account
        .tasks_completed
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    agent_account.last_active_at = now;

    protocol.total_clips_distributed = protocol
        .total_clips_distributed
        .checked_add(task.reward_clips)
        .ok_or(ErrorCode::MathOverflow)?;

    let claim = &mut ctx.accounts.claim;
    claim.bump = ctx.bumps.claim;
    claim.task_id = task_id;
    claim.agent = ctx.accounts.agent.key();
    claim.proof_cid = proof_cid;
    claim.clips_awarded = task.reward_clips;
    claim.completed_at = now;

    Ok(())
}
