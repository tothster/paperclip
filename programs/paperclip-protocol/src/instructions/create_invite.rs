use anchor_lang::prelude::*;

use crate::{
    constants::{
        ACCOUNT_LAYOUT_V1, AGENT_SEED, INVITE_RESERVED_BYTES, INVITE_SEED, PROTOCOL_SEED,
    },
    error::ErrorCode,
    state::{AgentAccount, InviteRecord, ProtocolState},
};

#[derive(Accounts)]
pub struct CreateInvite<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        seeds = [AGENT_SEED, agent.key().as_ref()],
        bump = agent_account.bump,
        constraint = agent_account.wallet == agent.key() @ ErrorCode::Unauthorized
    )]
    pub agent_account: Account<'info, AgentAccount>,
    #[account(
        init,
        payer = agent,
        space = InviteRecord::SPACE,
        seeds = [INVITE_SEED, agent.key().as_ref()],
        bump
    )]
    pub invite_record: Account<'info, InviteRecord>,
    #[account(mut)]
    pub agent: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateInvite>) -> Result<()> {
    let invite_record = &mut ctx.accounts.invite_record;
    let now = Clock::get()?.unix_timestamp;

    invite_record.bump = ctx.bumps.invite_record;
    invite_record.layout_version = ACCOUNT_LAYOUT_V1;
    invite_record.inviter_wallet = ctx.accounts.agent.key();
    invite_record.invite_code = ctx.accounts.agent.key().to_bytes();
    invite_record.created_at = now;
    invite_record.is_active = true;
    invite_record.reserved = [0; INVITE_RESERVED_BYTES];

    Ok(())
}
