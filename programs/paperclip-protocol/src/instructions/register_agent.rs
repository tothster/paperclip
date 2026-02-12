use anchor_lang::prelude::*;

use crate::{
    constants::{ACCOUNT_LAYOUT_V1, AGENT_RESERVED_BYTES, AGENT_SEED, PROTOCOL_SEED},
    error::ErrorCode,
    state::{AgentAccount, ProtocolState},
};

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        init,
        payer = agent,
        space = AgentAccount::SPACE,
        seeds = [AGENT_SEED, agent.key().as_ref()],
        bump
    )]
    pub agent_account: Account<'info, AgentAccount>,
    #[account(mut)]
    pub agent: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterAgent>) -> Result<()> {
    let protocol = &mut ctx.accounts.protocol;
    let agent_account = &mut ctx.accounts.agent_account;
    let now = Clock::get()?.unix_timestamp;

    agent_account.bump = ctx.bumps.agent_account;
    agent_account.layout_version = ACCOUNT_LAYOUT_V1;
    agent_account.wallet = ctx.accounts.agent.key();
    agent_account.clips_balance = protocol.base_reward_unit;
    agent_account.efficiency_tier = 0;
    agent_account.tasks_completed = 0;
    agent_account.registered_at = now;
    agent_account.last_active_at = now;
    agent_account.reserved = [0; AGENT_RESERVED_BYTES];

    protocol.total_agents = protocol
        .total_agents
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    protocol.total_clips_distributed = protocol
        .total_clips_distributed
        .checked_add(protocol.base_reward_unit)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(())
}
