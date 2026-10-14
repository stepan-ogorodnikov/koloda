//! The events socket: while the runner runs, one socket per enrolled file, whose nudges start a cycle when another
//! device moved the lane heads (`crates/koloda-sync-proto/PROTOCOL.md` §Events, §Cycle).

use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use koloda::repo::sync::sync_state;
use koloda_sync_proto::transport::Heads;
use tokio::sync::watch;

use crate::engine::{Session, Shared};
use crate::runner::{Timer, POLL};
use crate::status::Stop;
use crate::transport::{Delivery, Method, Opened};

const FIRST_RETRY: Duration = Duration::from_secs(1);
// WHY: the server pings every 30 seconds, so a socket silent past two pings is gone even if the connection has not
// noticed, as after the machine slept.
const SILENT_FOR: Duration = Duration::from_secs(75);

/// How one try at the socket ended.
enum Listened {
    /// The socket opened, then closed; `has_lasted` once it delivered a frame past its first.
    Closed { has_lasted: bool },
    /// The server answered the upgrade with an error reply.
    Refused,
    /// No connection, or no complete answer to the upgrade.
    Unreachable,
    /// The file's session changed, so the socket names the wrong device, token, or epoch.
    Retargeted,
}

impl Shared {
    /// Keeps the socket open for the session the last cycle left, reconnecting after a close or an error.
    pub(crate) async fn listen_forever(self: Arc<Self>, timer: Arc<dyn Timer>) {
        let mut target = self.listen_target.subscribe();
        let mut retry = FIRST_RETRY;
        // WHY: a refusal starts one cycle, which applies a restore or detaches; while the server keeps refusing for
        // another reason, retries alone must not start a cycle each.
        let mut is_refusal_reported = false;
        loop {
            let Some(session) = target.borrow_and_update().clone() else {
                if target.changed().await.is_err() {
                    return;
                }
                continue;
            };
            match self.listen(&session, &mut target, timer.as_ref()).await {
                Listened::Retargeted => {
                    retry = FIRST_RETRY;
                    is_refusal_reported = false;
                    continue;
                }
                Listened::Closed { has_lasted } => {
                    // WHY: a socket closed at once, by a proxy that closes upgrades or by another engine on the same
                    // device id, keeps doubling the wait; it would otherwise reconnect, and start a cycle, every
                    // second (PROTOCOL.md, Events).
                    if has_lasted {
                        retry = FIRST_RETRY;
                    }
                    is_refusal_reported = false;
                }
                Listened::Refused => {
                    if !is_refusal_reported {
                        is_refusal_reported = true;
                        self.triggers.fire(false);
                    }
                }
                Listened::Unreachable => {}
            }
            let waited = timer.sleep(retry);
            tokio::select! {
                () = waited => retry = (retry * 2).min(POLL),
                changed = target.changed() => {
                    if changed.is_err() {
                        return;
                    }
                    retry = FIRST_RETRY;
                    is_refusal_reported = false;
                }
            }
        }
    }

    async fn listen(
        self: &Arc<Self>,
        session: &Session,
        target: &mut watch::Receiver<Option<Session>>,
        timer: &dyn Timer,
    ) -> Listened {
        let request = self.device_client(session).request(
            Method::Get,
            &format!("/v1/spaces/{}/events", session.space),
            Some(&session.token),
        );
        let opened = tokio::select! {
            opened = self.transport.listen(request) => opened,
            _ = target.changed() => return Listened::Retargeted,
        };
        let mut events = match opened {
            Ok(Opened::Socket(events)) => events,
            Ok(Opened::Refused(_)) => return Listened::Refused,
            Err(_) => return Listened::Unreachable,
        };
        self.is_listening.store(true, Ordering::SeqCst);
        // WHY: the server sends the heads as every socket's first frame, so only a later one, a ping every 30 seconds
        // or a nudge, shows that the socket lasted.
        let mut frames = 0;
        let listened = loop {
            let silence = timer.sleep(SILENT_FOR);
            tokio::select! {
                delivery = events.next() => {
                    if delivery.is_some() {
                        frames += 1;
                    }
                    match delivery {
                        Some(Delivery::Heads(heads)) => {
                            // WHY: a run state that cannot be read costs at most one more cycle.
                            if self.note_nudge(heads).unwrap_or(true) {
                                self.triggers.fire(false);
                            }
                        }
                        Some(Delivery::Alive) => {}
                        None => break Listened::Closed { has_lasted: frames > 1 },
                    }
                }
                () = silence => break Listened::Closed { has_lasted: frames > 1 },
                _ = target.changed() => break Listened::Retargeted,
            }
        };
        self.is_listening.store(false, Ordering::SeqCst);
        // WHY: the runner may be waiting out the longer poll it picked while the socket was up; a cycle now has it
        // poll at the shorter interval from here on.
        if matches!(listened, Listened::Closed { .. }) {
            self.triggers.fire(false);
        }
        listened
    }

    /// Points the socket at the file's session once a cycle ends: none while the file is not enrolled, detached,
    /// waiting for Add or Replace, or holding an authoritative restore, since such a file sends nothing. None either
    /// after a cycle the server stopped as an unknown device, which makes no call of its own (PROTOCOL.md, Devices).
    pub(crate) async fn retarget(self: &Arc<Self>) {
        if self.listen_target.receiver_count() == 0 {
            return;
        }
        // WHY: a sync state that cannot be read keeps the socket closed; the next cycle reads it again.
        let is_quiet = self
            .blocking(|shared| sync_state(&shared.db))
            .await
            .map_or(true, |state| {
                state.is_none_or(|state| state.is_import_pending || state.is_restore_held)
            });
        let is_stopped = self.run_state().is_ok_and(|run| run.stop == Some(Stop::UnknownDevice));
        let target = if is_quiet || is_stopped {
            None
        } else {
            self.session().await.ok()
        };
        self.listen_target.send_if_modified(|current| {
            let is_changed = *current != target;
            *current = target;
            is_changed
        });
    }

    /// Closes the socket at once, as when the file detaches, rather than at the end of the next cycle.
    pub(crate) fn stop_listening(&self) {
        self.listen_target.send_if_modified(|current| current.take().is_some());
    }
}

/// Whether `heads` are past the last heads a reply reported, or no reply reported any yet.
pub(crate) fn is_past(heads: Heads, seen: Option<(u64, u64)>) -> bool {
    seen.is_none_or(|(hot, cold)| heads.head_hot > hot || heads.head_cold > cold)
}
