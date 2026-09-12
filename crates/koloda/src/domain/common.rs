use crate::app::error::{error_codes, AppError};

pub const TITLE_MIN_LENGTH: usize = 1;
pub const TITLE_MAX_LENGTH: usize = 255;

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
    // WHY: Count UTF-16 units, not UTF-8 bytes — the TS zod mirrors limit by JS
    // `.length` (UTF-16 units), so astral chars like emoji count 2 here, same as on web.
    let length = title.encode_utf16().count();

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
