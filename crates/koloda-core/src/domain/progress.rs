//! Shared FSRS progress-field bounds used by cards and reviews.
//!
//! Callers pass entity-specific error codes so UI namespaces
//! (`validation.cards.progress.*` vs `validation.reviews.*`) stay distinct.

use crate::app::error::AppError;
use crate::domain::cards::CardState;

pub const DIFFICULTY_MIN: f64 = 0.0;
pub const DIFFICULTY_MAX: f64 = 10.0;

pub fn validate_state(state: i32, code: &str) -> Result<(), AppError> {
    if !CardState::is_valid(state) {
        return Err(AppError::new(
            code,
            Some(format!(
                "State must be between {} and {}, got {}",
                CardState::MIN,
                CardState::MAX,
                state
            )),
        ));
    }
    Ok(())
}

pub fn validate_stability(stability: f64, code: &str) -> Result<(), AppError> {
    if stability < 0.0 {
        return Err(AppError::new(
            code,
            Some(format!("Stability must be non-negative, got {}", stability)),
        ));
    }
    Ok(())
}

pub fn validate_difficulty(difficulty: f64, code: &str) -> Result<(), AppError> {
    if !(DIFFICULTY_MIN..=DIFFICULTY_MAX).contains(&difficulty) {
        return Err(AppError::new(
            code,
            Some(format!(
                "Difficulty must be between {} and {}, got {}",
                DIFFICULTY_MIN, DIFFICULTY_MAX, difficulty
            )),
        ));
    }
    Ok(())
}

pub fn validate_scheduled_days(days: i32, code: &str) -> Result<(), AppError> {
    if days < 0 {
        return Err(AppError::new(
            code,
            Some(format!("Scheduled days must be non-negative, got {}", days)),
        ));
    }
    Ok(())
}

pub fn validate_learning_steps(steps: i32, code: &str) -> Result<(), AppError> {
    if steps < 0 {
        return Err(AppError::new(
            code,
            Some(format!("Learning steps must be non-negative, got {}", steps)),
        ));
    }
    Ok(())
}

pub fn validate_reps(reps: i32, code: &str) -> Result<(), AppError> {
    if reps < 0 {
        return Err(AppError::new(
            code,
            Some(format!("Reps must be non-negative, got {}", reps)),
        ));
    }
    Ok(())
}

pub fn validate_lapses(lapses: i32, code: &str) -> Result<(), AppError> {
    if lapses < 0 {
        return Err(AppError::new(
            code,
            Some(format!("Lapses must be non-negative, got {}", lapses)),
        ));
    }
    Ok(())
}
