use crate::app::error::{error_codes, AppError};

pub const TITLE_MIN_LENGTH: usize = 1;
pub const TITLE_MAX_LENGTH: usize = 255;

pub fn validate_title(title: &str) -> Result<(), AppError> {
    if title.len() < TITLE_MIN_LENGTH {
        return Err(AppError::new(
            error_codes::VALIDATION_COMMON_TITLE_TOO_SHORT,
            Some(format!("Min length: {}", TITLE_MIN_LENGTH)),
        ));
    }

    if title.len() > TITLE_MAX_LENGTH {
        return Err(AppError::new(
            error_codes::VALIDATION_COMMON_TITLE_TOO_LONG,
            Some(format!("Max length: {}", TITLE_MAX_LENGTH)),
        ));
    }

    Ok(())
}
