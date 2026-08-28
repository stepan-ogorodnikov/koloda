use crate::app::error::{error_codes, AppError};

pub const TITLE_MIN_LENGTH: usize = 1;
pub const TITLE_MAX_LENGTH: usize = 255;

pub fn validate_title(title: &str) -> Result<(), AppError> {
    // WHY: Count characters, not UTF-8 bytes, to match the TS zod mirrors that count
    // UTF-16 units — one per Cyrillic char, so Russian users get the full limit.
    // Intentional divergence on astral-plane chars: an emoji counts 1 here, 2 in UTF-16.
    let length = title.chars().count();

    if length < TITLE_MIN_LENGTH {
        return Err(AppError::new(
            error_codes::VALIDATION_COMMON_TITLE_TOO_SHORT,
            Some(format!("Min length: {}", TITLE_MIN_LENGTH)),
        ));
    }

    if length > TITLE_MAX_LENGTH {
        return Err(AppError::new(
            error_codes::VALIDATION_COMMON_TITLE_TOO_LONG,
            Some(format!("Max length: {}", TITLE_MAX_LENGTH)),
        ));
    }

    Ok(())
}
