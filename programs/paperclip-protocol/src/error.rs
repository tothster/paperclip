use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Task is not active")]
    TaskInactive,
    #[msg("Task is fully claimed")]
    TaskFullyClaimed,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Agent tier is too low for this task")]
    TierTooLow,
    #[msg("Required prerequisite task has not been completed")]
    MissingRequiredTaskProof,
    #[msg("Invalid prerequisite account provided")]
    InvalidPrerequisiteAccount,
    #[msg("Task cannot require itself as a prerequisite")]
    InvalidTaskPrerequisite,
    #[msg("Invalid invite code")]
    InvalidInviteCode,
    #[msg("Invite is inactive")]
    InviteInactive,
    #[msg("Self-referral is not allowed")]
    SelfReferralNotAllowed,
}
