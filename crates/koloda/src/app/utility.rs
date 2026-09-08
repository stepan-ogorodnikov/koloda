use crate::app::error::{error_codes, AppError};
use crate::domain::time::now_millis;

pub fn get_current_timestamp() -> Result<i64, AppError> {
    // WHY: persist paths must not write `created_at = 0`.
    now_millis().map_err(|e| AppError::new(error_codes::UNKNOWN, Some(format!("System clock error: {}", e))))
}

pub fn generate_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}
