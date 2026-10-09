//! A timer the test moves by hand and an event sink the test reads, so runner tests never sleep.

use std::ops::RangeInclusive;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use koloda_sync::runner::{Event, EventSink, Sleeping, Timer};
use tokio::sync::Notify;

/// The runner's poll intervals, coalescing window, and events socket waits, pinned here as the waits the tests expect.
pub const POLL: Duration = Duration::from_secs(60);
pub const POLL_LISTENING: Duration = Duration::from_secs(5 * 60);
pub const COALESCE: Duration = Duration::from_millis(300);
/// The socket waits this long for a frame while it is open, so a sleep of it shows the socket is open.
pub const SILENT_FOR: Duration = Duration::from_secs(75);
pub const FIRST_RETRY: Duration = Duration::from_secs(1);

/// How long a test waits for the runner to reach a state before it fails.
const PATIENCE: Duration = Duration::from_secs(20);

#[derive(Clone, Default)]
pub struct ManualTimer(Arc<TimerInner>);

#[derive(Default)]
struct TimerInner {
    state: Mutex<TimerState>,
    changed: Condvar,
    wake: Notify,
}

#[derive(Default)]
struct TimerState {
    now: Duration,
    /// The durations of the sleeps the runner is in now.
    sleeping: Vec<Duration>,
}

/// Takes its sleep off the list when the runner stops waiting, whether it elapsed or a trigger won.
struct SleepGuard {
    inner: Arc<TimerInner>,
    duration: Duration,
}

impl Drop for SleepGuard {
    fn drop(&mut self) {
        let mut state = self.inner.state.lock().expect("timer lock");
        if let Some(position) = state.sleeping.iter().position(|slept| *slept == self.duration) {
            state.sleeping.remove(position);
        }
        self.inner.changed.notify_all();
    }
}

impl Timer for ManualTimer {
    fn sleep(&self, duration: Duration) -> Sleeping {
        let inner = Arc::clone(&self.0);
        let deadline = {
            let mut state = inner.state.lock().expect("timer lock");
            state.sleeping.push(duration);
            inner.changed.notify_all();
            state.now + duration
        };
        let guard = SleepGuard {
            inner: Arc::clone(&inner),
            duration,
        };
        Box::pin(async move {
            let _guard = guard;
            loop {
                let woken = inner.wake.notified();
                tokio::pin!(woken);
                woken.as_mut().enable();
                if inner.state.lock().expect("timer lock").now >= deadline {
                    return;
                }
                woken.await;
            }
        })
    }
}

impl ManualTimer {
    pub fn advance(&self, by: Duration) {
        self.0.state.lock().expect("timer lock").now += by;
        self.0.wake.notify_waiters();
    }

    /// Blocks until the runner waits in a sleep of `duration`.
    pub fn wait_for_sleep(&self, duration: Duration) {
        self.wait_for_any_sleep(&[duration]);
    }

    /// Blocks until the runner waits in a sleep within `range`, and returns its duration.
    pub fn wait_for_sleep_within(&self, range: RangeInclusive<Duration>) -> Duration {
        let give_up = Instant::now() + PATIENCE;
        let mut state = self.0.state.lock().expect("timer lock");
        loop {
            if let Some(slept) = state.sleeping.iter().find(|slept| range.contains(*slept)) {
                return *slept;
            }
            let left = give_up.saturating_duration_since(Instant::now());
            assert!(!left.is_zero(), "the runner never slept within {range:?}");
            state = self.0.changed.wait_timeout(state, left).expect("timer lock").0;
        }
    }

    /// Blocks until the runner waits in a sleep of one of `durations`.
    pub fn wait_for_any_sleep(&self, durations: &[Duration]) {
        let give_up = Instant::now() + PATIENCE;
        let mut state = self.0.state.lock().expect("timer lock");
        while !durations.iter().any(|duration| state.sleeping.contains(duration)) {
            let left = give_up.saturating_duration_since(Instant::now());
            assert!(!left.is_zero(), "the runner never slept for any of {durations:?}");
            state = self.0.changed.wait_timeout(state, left).expect("timer lock").0;
        }
    }
}

pub struct ChannelSink(Mutex<Sender<Event>>);

impl EventSink for ChannelSink {
    fn send(&self, event: Event) {
        let _sent = self.0.lock().expect("sink lock").send(event).is_ok();
    }
}

pub fn channel_sink() -> (Arc<ChannelSink>, Receiver<Event>) {
    let (sender, receiver) = channel();
    (Arc::new(ChannelSink(Mutex::new(sender))), receiver)
}

/// Reads events until one matches, or fails after a while.
pub fn wait_for(events: &Receiver<Event>, matches: impl Fn(&Event) -> bool) -> Event {
    loop {
        let event = events.recv_timeout(PATIENCE).expect("the runner sends the event");
        if matches(&event) {
            return event;
        }
    }
}
