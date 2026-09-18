use crate::app::error::{error_codes, AppError};

pub const TITLE_MIN_LENGTH: usize = 1;
pub const TITLE_MAX_LENGTH: usize = 255;
pub const PROFILE_TITLE_MAX_LENGTH: usize = 128;

pub fn trim_title_value(title: &str) -> &str {
    title.trim()
}

pub fn normalize_required_title(title: &str) -> String {
    title.trim().to_string()
}

pub fn normalize_optional_title(title: Option<String>) -> Option<String> {
    title.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

// WHY: Twin of the zod `z.uuid()` validation (8-4-4-4-12 hex groups, case-insensitive).
// Hand-rolled instead of `uuid::Uuid::parse_str`, which also accepts braced/urn/hyphen-less
// forms the web validation rejects.
pub fn validate_uuid(value: &str, code: &'static str) -> Result<(), AppError> {
    const HYPHEN_SLOTS: [usize; 4] = [8, 13, 18, 23];
    let is_uuid = value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| {
            if HYPHEN_SLOTS.contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        });

    if is_uuid {
        Ok(())
    } else {
        Err(AppError::new(code, Some(format!("Invalid uuid: {value}"))))
    }
}

pub fn validate_title(title: &str) -> Result<(), AppError> {
    // WHY: Count UTF-16 units on the trimmed value, not UTF-8 bytes — the TS zod mirrors
    // limit by JS `.length` (UTF-16 units), so astral chars like emoji count 2 here, same as on web.
    let length = trim_title_value(title).encode_utf16().count();

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

pub fn validate_optional_profile_title(title: &Option<String>) -> Result<(), AppError> {
    let Some(title) = title else {
        return Ok(());
    };

    let trimmed = trim_title_value(title);
    if trimmed.is_empty() {
        return Ok(());
    }

    let length = trimmed.encode_utf16().count();
    if length > PROFILE_TITLE_MAX_LENGTH {
        return Err(AppError::new(error_codes::VALIDATION_COMMON_TITLE_TOO_LONG, None));
    }

    Ok(())
}
