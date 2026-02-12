use anchor_lang::prelude::*;

use crate::{
    constants::{ACCOUNT_LAYOUT_V1, AGENT_RESERVED_BYTES, AGENT_SEED, INVITE_SEED, PROTOCOL_SEED},
    error::ErrorCode,
    state::{AgentAccount, InviteRecord, ProtocolState},
};

#[derive(Accounts)]
pub struct RegisterAgentWithInvite<'info> {
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
    #[account(
        mut,
        seeds = [AGENT_SEED, inviter_agent.wallet.as_ref()],
        bump = inviter_agent.bump
    )]
    pub inviter_agent: Account<'info, AgentAccount>,
    #[account(
        mut,
        seeds = [INVITE_SEED, inviter_agent.wallet.as_ref()],
        bump = invite_record.bump
    )]
    pub invite_record: Account<'info, InviteRecord>,
    #[account(mut)]
    pub agent: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterAgentWithInvite>, invite_code: [u8; 32]) -> Result<()> {
    let protocol = &mut ctx.accounts.protocol;
    let agent_account = &mut ctx.accounts.agent_account;
    let inviter_agent = &mut ctx.accounts.inviter_agent;
    let invite_record = &mut ctx.accounts.invite_record;
    let now = Clock::get()?.unix_timestamp;

    require!(
        inviter_agent.wallet != ctx.accounts.agent.key(),
        ErrorCode::SelfReferralNotAllowed
    );
    require!(invite_record.is_active, ErrorCode::InviteInactive);
    require_keys_eq!(
        invite_record.inviter_wallet,
        inviter_agent.wallet,
        ErrorCode::InvalidInviteCode
    );
    require!(
        invite_code == inviter_agent.wallet.to_bytes(),
        ErrorCode::InvalidInviteCode
    );
    require!(
        invite_record.invite_code == invite_code,
        ErrorCode::InvalidInviteCode
    );

    let invitee_reward = protocol
        .base_reward_unit
        .checked_mul(3)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(2)
        .ok_or(ErrorCode::MathOverflow)?;
    let inviter_bonus = protocol.base_reward_unit / 2;

    agent_account.bump = ctx.bumps.agent_account;
    agent_account.layout_version = ACCOUNT_LAYOUT_V1;
    agent_account.wallet = ctx.accounts.agent.key();
    agent_account.clips_balance = invitee_reward;
    agent_account.efficiency_tier = 0;
    agent_account.tasks_completed = 0;
    agent_account.registered_at = now;
    agent_account.last_active_at = now;
    agent_account.invites_sent = 0;
    agent_account.invites_redeemed = 1;
    agent_account.invited_by = inviter_agent.wallet;
    agent_account.reserved = [0; AGENT_RESERVED_BYTES];

    inviter_agent.clips_balance = inviter_agent
        .clips_balance
        .checked_add(inviter_bonus)
        .ok_or(ErrorCode::MathOverflow)?;
    inviter_agent.invites_sent = inviter_agent
        .invites_sent
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    inviter_agent.last_active_at = now;

    invite_record.invites_redeemed = invite_record
        .invites_redeemed
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    protocol.total_agents = protocol
        .total_agents
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    protocol.total_clips_distributed = protocol
        .total_clips_distributed
        .checked_add(invitee_reward)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_add(inviter_bonus)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(())
}
