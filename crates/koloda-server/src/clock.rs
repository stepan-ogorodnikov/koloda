//! Server time. Everything reads it through `Clock`, so tests drive expiry and the clock guard with a manual clock.

use std::time::{SystemTime, UNIX_EPOCH};

pub trait Clock: Send + Sync {
    fn now_ms(&self) -> u64;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        // WHY: a wall clock before 1970 reads as 0; the clock guard then refuses every stamp instead of panicking.
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
    }
}
