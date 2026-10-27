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
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction};

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
    // WHY: progress goes to a plain `(current, total)` callback, not the NAPI function, so tests can run the host
    // without a JS environment; `lib.rs` wraps the `ThreadsafeFunction`.
    pub fn run(
        &self,
        request_id: &str,
        algorithm_id: &str,
        progress: &OptimizationProgress,
        on_progress: impl Fn(usize, usize),
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
                        on_progress(current, total);
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

#[cfg(test)]
mod tests {
    use koloda::domain::algorithms::InsertAlgorithmData;
    use serde_json::json;

    use super::*;

    fn host_with_algorithm() -> (OptimizerHost, String) {
        let db = Database::in_memory().expect("in-memory database opens");
        let data: InsertAlgorithmData = serde_json::from_value(json!({
            "title": "Preset",
            "content": {
                "type": "fsrs",
                "retention": 90,
                "weights": "0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, \
                            1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542",
                "isFuzzEnabled": true,
                "learningSteps": [[1, "m"]],
                "relearningSteps": [[10, "m"]],
                "maximumInterval": 36500,
            },
        }))
        .expect("valid algorithm");
        let algorithm = repo::algorithms::add_algorithm(&db, data).expect("algorithm adds");
        (OptimizerHost::new(db), algorithm.id)
    }

    #[test]
    fn a_run_cancelled_while_queued_resolves_cancelled() {
        let (host, algorithm_id) = host_with_algorithm();
        let first = host.register("first");
        let queued = host.register("queued");

        // The first run still holds the optimizer thread when the cancel for the queued one arrives.
        host.cancel("queued");
        let outcome = host
            .run("queued", &algorithm_id, &queued, |_, _| {})
            .expect("a cancelled run is not an error");
        let first_outcome = host
            .run("first", &algorithm_id, &first, |_, _| {})
            .expect("the first run ends");

        assert_eq!(outcome, OptimizationOutcome::Cancelled);
        assert!(
            matches!(first_outcome, OptimizationOutcome::NotEnoughData { .. }),
            "the other run is not cancelled: {first_outcome:?}"
        );
    }

    #[test]
    fn a_finished_run_is_forgotten() {
        let (host, algorithm_id) = host_with_algorithm();
        let progress = host.register("done");

        host.run("done", &algorithm_id, &progress, |_, _| {})
            .expect("the run ends");

        assert!(host.lock_runs().is_empty(), "a finished run leaves no entry");
        host.cancel("done");
        host.cancel("unknown");
        assert!(host.lock_runs().is_empty());
    }
}
