use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};

pub const LEARNING_STEP_UNITS: &[&str] = &["s", "m", "h", "d"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlgorithmFSRS {
    #[serde(rename = "type")]
    pub algorithm_type: String,
    pub retention: f64,
    pub weights: String,
    pub is_fuzz_enabled: bool,
    pub learning_steps: Vec<(i64, String)>,
    pub relearning_steps: Vec<(i64, String)>,
    pub maximum_interval: i64,
}

impl AlgorithmFSRS {
    pub fn validate(&self) -> Result<(), AppError> {
        // Retention
        if self.retention < 70.0 || self.retention > 99.0 {
            return Err(AppError::new(error_codes::VALIDATION_ALGORITHM_FSRS_RETENTION, None));
        }

        // Learning steps
        for (amount, unit) in &self.learning_steps {
            if *amount <= 0 {
                return Err(AppError::new(
                    error_codes::VALIDATION_ALGORITHM_FSRS_LEARNING_STEPS_AMOUNT,
                    None,
                ));
            }
            if !LEARNING_STEP_UNITS.contains(&unit.as_str()) {
                return Err(AppError::new(
                    error_codes::VALIDATION_ALGORITHM_FSRS_LEARNING_STEPS_UNIT,
                    None,
                ));
            }
        }

        // Relearning steps
        for (amount, unit) in &self.relearning_steps {
            if *amount <= 0 {
                return Err(AppError::new(
                    error_codes::VALIDATION_ALGORITHM_FSRS_RELEARNING_STEPS_AMOUNT,
                    None,
                ));
            }
            if !LEARNING_STEP_UNITS.contains(&unit.as_str()) {
                return Err(AppError::new(
                    error_codes::VALIDATION_ALGORITHM_FSRS_RELEARNING_STEPS_UNIT,
                    None,
                ));
            }
        }

        // Maximum interval
        if self.maximum_interval <= 0 {
            return Err(AppError::new(
                error_codes::VALIDATION_ALGORITHM_FSRS_MAXIMUM_INTERVAL,
                None,
            ));
        }

        // Weights: FSRS-6 format (21 items)
        let weight_parts: Vec<&str> = self.weights.split(',').collect();
        if weight_parts.len() != 21 {
            return Err(AppError::new(error_codes::VALIDATION_ALGORITHM_FSRS_WEIGHTS, None));
        }

        for part in weight_parts.iter() {
            if part.trim().parse::<f64>().is_err() {
                return Err(AppError::new(error_codes::VALIDATION_ALGORITHM_FSRS_WEIGHTS, None));
            }
        }

        Ok(())
    }
}
