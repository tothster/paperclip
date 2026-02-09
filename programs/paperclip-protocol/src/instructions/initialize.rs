use anchor_lang::prelude::*;

use crate::{constants::PROTOCOL_SEED, state::ProtocolState};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = ProtocolState::SPACE,
        seeds = [PROTOCOL_SEED],
        bump
    )]
    pub protocol: Account<'info, ProtocolState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, base_reward_unit: u64) -> Result<()> {
    let protocol = &mut ctx.accounts.protocol;
    protocol.bump = ctx.bumps.protocol;
    protocol.authority = ctx.accounts.authority.key();
    protocol.base_reward_unit = base_reward_unit;
    protocol.total_agents = 0;
    protocol.total_tasks = 0;
    protocol.total_clips_distributed = 0;
    protocol.paused = false;
    Ok(())
}
