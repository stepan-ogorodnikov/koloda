//! The background runner: one cycle at a time on triggers, a poll, and backoff after errors, with events to the host
//! and bounded ticks (`crates/koloda-sync-proto/PROTOCOL.md` §Cycle).

use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use koloda_sync_proto::registry::Kind;
use tokio::sync::Notify;

use crate::engine::Shared;
use crate::error::SyncError;
use crate::status::Status;

/// Local writes within this window share one cycle.
const COALESCE: Duration = Duration::from_millis(300);
/// The poll while the events socket is down, and the longest wait after errors.
pub(crate) const POLL: Duration = Duration::from_secs(60);
// WHY: while the socket is up, every push by another device starts a cycle; this poll covers heads that move without a
// push, such as an operator's `drop-envelope`.
const POLL_LISTENING: Duration = Duration::from_secs(5 * 60);
const FIRST_BACKOFF: Duration = Duration::from_secs(1);

pub type Sleeping = Pin<Box<dyn Future<Output = ()> + Send>>;

/// Waits for the runner. Tests drive it by hand, so no test sleeps.
pub trait Timer: Send + Sync {
    fn sleep(&self, duration: Duration) -> Sleeping;
}

pub struct TokioTimer;

impl Timer for TokioTimer {
    fn sleep(&self, duration: Duration) -> Sleeping {
        Box::pin(tokio::time::sleep(duration))
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Event {
    /// Product rows of these kinds changed, so the host refreshes what shows them.
    Changed {
        kinds: Vec<Kind>,
    },
    Status(Status),
    Error(String),
    /// These images arrived from the server, so the host shows them where cards link them.
    AttachmentsFetched {
        ids: Vec<String>,
    },
}

/// Receives events on the engine's runtime thread; it must not block.
pub trait EventSink: Send + Sync {
    fn send(&self, event: Event);
}

/// Limits on one `tick`: wall time, and bytes of envelope pages received and attachment bodies sent or received.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Budget {
    pub wall: Duration,
    pub body_bytes: usize,
}

/// What a tick did; a tick that ran out of budget leaves the rest for the next one, which resumes from the cursors.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Ticked {
    pub changed: Vec<Kind>,
    pub is_done: bool,
}

/// What is left of a tick's budget.
pub(crate) struct Spending {
    deadline: Instant,
    body_bytes: usize,
}

impl Spending {
    pub(crate) fn new(budget: Budget) -> Spending {
        Spending {
            deadline: Instant::now() + budget.wall,
            body_bytes: budget.body_bytes,
        }
    }

    pub(crate) fn check(&self) -> Result<(), SyncError> {
        if self.body_bytes == 0 {
            return Err(SyncError::BudgetSpent);
        }
        self.check_time()
    }

    pub(crate) fn check_time(&self) -> Result<(), SyncError> {
        if Instant::now() >= self.deadline {
            return Err(SyncError::BudgetSpent);
        }
        Ok(())
    }

    pub(crate) fn spend(&mut self, body_bytes: usize) {
        self.body_bytes = self.body_bytes.saturating_sub(body_bytes);
    }
}

/// Triggers since the runner last looked. A trigger during a cycle bumps the generation past what the cycle saw, so
/// exactly one more cycle follows however many triggers arrived.
#[derive(Default)]
pub(crate) struct Triggers {
    generation: AtomicU64,
    is_local: AtomicBool,
    notify: Notify,
}

impl Triggers {
    pub(crate) fn generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    pub(crate) fn fire(&self, is_local: bool) {
        if is_local {
            self.is_local.store(true, Ordering::SeqCst);
        }
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.notify.notify_one();
    }

    /// Returns once a trigger arrived after `seen`, or `duration` elapsed.
    async fn wait(&self, seen: u64, timer: &dyn Timer, duration: Duration) {
        // INVARIANT: the sleep starts only once no trigger is waiting, so a runner that sleeps is idle.
        if self.generation.load(Ordering::SeqCst) != seen {
            return;
        }
        let sleep = timer.sleep(duration);
        tokio::pin!(sleep);
        loop {
            if self.generation.load(Ordering::SeqCst) != seen {
                return;
            }
            // WHY: a permit left by a trigger the last cycle already covered wakes this once; the loop checks the
            // generation again instead of running a cycle for it.
            tokio::select! {
                () = self.notify.notified() => {}
                () = &mut sleep => return,
            }
        }
    }
}

impl Shared {
    pub(crate) async fn run_forever(self: Arc<Self>, timer: Arc<dyn Timer>) {
        let mut seen = self.triggers.generation.load(Ordering::SeqCst);
        let mut wait = Duration::ZERO;
        let mut backoff = FIRST_BACKOFF;
        loop {
            if !wait.is_zero() {
                self.triggers.wait(seen, timer.as_ref(), wait).await;
            }
            if self.triggers.is_local.swap(false, Ordering::SeqCst) {
                timer.sleep(COALESCE).await;
            }
            seen = self.triggers.generation.load(Ordering::SeqCst);
            let (_, result) = self.run_cycle(None).await;
            wait = match result {
                Ok(()) | Err(SyncError::BudgetSpent) => {
                    backoff = FIRST_BACKOFF;
                    if self.is_listening.load(Ordering::SeqCst) {
                        POLL_LISTENING
                    } else {
                        POLL
                    }
                }
                Err(_) => {
                    let after = backoff;
                    backoff = (backoff * 2).min(POLL);
                    after
                }
            };
        }
    }
}
