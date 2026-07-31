use crate::app::error::{error_codes, AppError};

pub fn get_current_timestamp() -> Result<i64, AppError> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .map_err(|e| AppError::new(error_codes::UNKNOWN, Some(format!("System clock error: {}", e))))
}

pub fn generate_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}
