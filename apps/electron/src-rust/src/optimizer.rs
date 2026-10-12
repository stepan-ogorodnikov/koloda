//! FSRS weight optimization for the desktop (`docs/decisions/FSRS-OPTIMIZER.md`).
//!
//! Runs queue on a thread of their own: training takes seconds and must not hold up the database or sync threads.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

use koloda::app::db::Database;
use koloda::app::error::{error_codes, AppError};
use koloda::domain::optimizer::{
    new_progress, optimize, progress_counts, request_abort, OptimizationOutcome, OptimizationProgress,
};
use koloda::repo;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};

pub type ProgressCallback = ThreadsafeFunction<serde_json::Value, ErrorStrategy::Fatal>;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);

pub struct OptimizerHost {
    db: Database,
    runs: Mutex<HashMap<String, OptimizationProgress>>,
}

impl OptimizerHost {
    pub fn new(db: Database) -> OptimizerHost {
        OptimizerHost {
            db,
            runs: Mutex::new(HashMap::new()),
        }
    }

    // INVARIANT: called before the run is queued, so a cancel sent after the start call finds the run,
    // even while an earlier run still holds the thread.
    pub fn register(&self, request_id: &str) -> OptimizationProgress {
        let progress = new_progress();
        self.lock_runs().insert(request_id.to_string(), progress.clone());
        progress
    }

    pub fn cancel(&self, request_id: &str) {
        if let Some(progress) = self.lock_runs().get(request_id) {
            request_abort(progress);
        }
    }

    // WHY: reads through its own handle to the one connection, as the sync host does. A write still queued on the
    // database thread may land after this read: the run then misses that write's reviews, and applying refuses
    // weights whose parameters changed.
    pub fn run(
        &self,
        request_id: &str,
        algorithm_id: &str,
        progress: &OptimizationProgress,
        on_progress: &ProgressCallback,
    ) -> Result<OptimizationOutcome, AppError> {
        let outcome = repo::optimizer::get_optimization_input(&self.db, algorithm_id).and_then(|input| {
            thread::scope(|scope| {
                let training = scope.spawn(|| optimize(&input, progress));
                let mut reported = None;
                while !training.is_finished() {
                    thread::sleep(PROGRESS_INTERVAL);
                    let (current, total) = progress_counts(progress);
                    if total > 0 && reported != Some(current) {
                        reported = Some(current);
                        on_progress.call(
                            serde_json::json!({ "requestId": request_id, "current": current, "total": total }),
                            ThreadsafeFunctionCallMode::NonBlocking,
                        );
                    }
                }
                training.join().unwrap_or_else(|_| {
                    Err(AppError::new(
                        error_codes::ALGORITHMS_OPTIMIZER_FAILED,
                        Some("training panicked".to_string()),
                    ))
                })
            })
        });
        self.lock_runs().remove(request_id);
        outcome
    }

    fn lock_runs(&self) -> MutexGuard<'_, HashMap<String, OptimizationProgress>> {
        self.runs.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
