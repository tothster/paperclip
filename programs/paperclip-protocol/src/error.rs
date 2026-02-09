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
}
