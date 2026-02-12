use anchor_lang::prelude::*;

use crate::{
    constants::{
        ACCOUNT_LAYOUT_V1, AGENT_SEED, CLAIM_RESERVED_BYTES, CLAIM_SEED, NO_PREREQ_TASK_ID,
        PROTOCOL_SEED, TASK_SEED,
    },
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
    let now = Clock::get()?.unix_timestamp;

    {
        let task = &ctx.accounts.task;
        let agent_account = &ctx.accounts.agent_account;

        require!(
            agent_account.efficiency_tier >= task.min_tier,
            ErrorCode::TierTooLow
        );

        if task.required_task_id != NO_PREREQ_TASK_ID {
            let prerequisite_account = ctx
                .remaining_accounts
                .first()
                .ok_or(ErrorCode::MissingRequiredTaskProof)?;

            let required_task_id_bytes = task.required_task_id.to_le_bytes();
            let expected_claim_pda = Pubkey::find_program_address(
                &[
                    CLAIM_SEED,
                    required_task_id_bytes.as_ref(),
                    ctx.accounts.agent.key().as_ref(),
                ],
                ctx.program_id,
            )
            .0;

            require_keys_eq!(
                *prerequisite_account.key,
                expected_claim_pda,
                ErrorCode::InvalidPrerequisiteAccount
            );

            require!(
                *prerequisite_account.owner == *ctx.program_id,
                ErrorCode::MissingRequiredTaskProof
            );

            let data = prerequisite_account
                .try_borrow_data()
                .map_err(|_| error!(ErrorCode::MissingRequiredTaskProof))?;
            let mut slice: &[u8] = &data;
            let prerequisite_claim = ClaimRecord::try_deserialize(&mut slice)
                .map_err(|_| error!(ErrorCode::MissingRequiredTaskProof))?;

            require!(
                prerequisite_claim.task_id == task.required_task_id,
                ErrorCode::InvalidPrerequisiteAccount
            );
            require_keys_eq!(
                prerequisite_claim.agent,
                ctx.accounts.agent.key(),
                ErrorCode::InvalidPrerequisiteAccount
            );
        }

        require!(task.is_active, ErrorCode::TaskInactive);
        require!(
            task.current_claims < task.max_claims,
            ErrorCode::TaskFullyClaimed
        );
    }

    let task = &mut ctx.accounts.task;
    let protocol = &mut ctx.accounts.protocol;
    let agent_account = &mut ctx.accounts.agent_account;

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
    claim.layout_version = ACCOUNT_LAYOUT_V1;
    claim.task_id = task_id;
    claim.agent = ctx.accounts.agent.key();
    claim.proof_cid = proof_cid;
    claim.clips_awarded = task.reward_clips;
    claim.completed_at = now;
    claim.reserved = [0; CLAIM_RESERVED_BYTES];

    Ok(())
}
