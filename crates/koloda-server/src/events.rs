//! The events socket: a WebSocket that sends a space's lane heads when a device connects and whenever a push moves
//! them, so devices sync without waiting for a poll (`PROTOCOL.md` §Events). One socket per device.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::body::Bytes;
use axum::extract::ws::rejection::WebSocketUpgradeRejection;
use axum::extract::ws::{close_code, CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use koloda_sync_proto::transport::Heads;
use tokio::sync::{oneshot, watch};
use tokio::time::Instant;
use uuid::Uuid;

use crate::auth;
use crate::http::{authorize, ApiError};
use crate::log;
use crate::server::{lock, Server};

const PING_EVERY: Duration = Duration::from_secs(30);
const SILENT_FOR: Duration = Duration::from_secs(60);
// WHY: a device sends nothing but control frames, so anything larger is refused before it is buffered.
const MAX_MESSAGE_BYTES: usize = 1024;

/// The open socket of each device. Dropping a device's sender closes its socket, so a new socket of the same device,
/// or a revocation, closes the older one.
#[derive(Default)]
pub(crate) struct Sockets {
    next: u64,
    open: HashMap<Uuid, (u64, oneshot::Sender<()>)>,
}

impl Sockets {
    fn open(&mut self, device: Uuid) -> (u64, oneshot::Receiver<()>) {
        self.next += 1;
        let (sender, closed) = oneshot::channel();
        self.open.insert(device, (self.next, sender));
        (self.next, closed)
    }

    pub(crate) fn close(&mut self, device: Uuid) {
        self.open.remove(&device);
    }

    fn forget(&mut self, device: Uuid, generation: u64) {
        if self.open.get(&device).is_some_and(|(open, _)| *open == generation) {
            self.open.remove(&device);
        }
    }
}

/// A socket's place in `Sockets`, given up when the socket ends, unless a newer socket of the device took it.
struct Registration {
    server: Arc<Server>,
    device: Uuid,
    generation: u64,
}

impl Drop for Registration {
    fn drop(&mut self) {
        if let Ok(mut sockets) = self.server.sockets() {
            sockets.forget(self.device, self.generation);
        }
    }
}

struct Listening {
    first: Heads,
    heads: watch::Receiver<Heads>,
    closed: oneshot::Receiver<()>,
    registration: Registration,
}

pub(crate) async fn events(
    State(server): State<Arc<Server>>,
    Path(space): Path<String>,
    headers: HeaderMap,
    upgrade: Result<WebSocketUpgrade, WebSocketUpgradeRejection>,
) -> Response {
    let is_upgrade = upgrade.is_ok();
    let owner = Arc::clone(&server);
    let listening = authorize(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        // INVARIANT: a request that cannot become a socket is refused before it registers, so it never closes the
        // device's open socket.
        if !is_upgrade {
            return Err(ApiError::bad_request(
                "the events endpoint answers WebSocket upgrades only",
            ));
        }
        listen(&owner, caller.space, caller.id)
    })
    .await;
    let listening = match listening {
        Ok(listening) => listening,
        Err(response) => return *response,
    };
    match upgrade {
        Ok(upgrade) => upgrade
            .max_message_size(MAX_MESSAGE_BYTES)
            .max_frame_size(MAX_MESSAGE_BYTES)
            .on_upgrade(move |socket| serve(socket, listening)),
        // WHY: not reached, since a request that is not an upgrade was refused above.
        Err(rejection) => rejection.into_response(),
    }
}

fn listen(server: &Arc<Server>, space: Uuid, device: Uuid) -> Result<Listening, ApiError> {
    let db = server.space(space)?.ok_or_else(ApiError::unknown_space)?;
    // INVARIANT: the device subscribes before the heads are read, so a push that commits between the two is sent
    // rather than lost.
    let heads = db.heads.subscribe();
    let (head_hot, head_cold) = log::lane_heads(&*lock(&db.reader)?)?;
    let (generation, closed) = server.sockets()?.open(device);
    Ok(Listening {
        first: Heads { head_hot, head_cold },
        heads,
        closed,
        registration: Registration {
            server: Arc::clone(server),
            device,
            generation,
        },
    })
}

async fn serve(mut socket: WebSocket, listening: Listening) {
    let Listening {
        first,
        mut heads,
        mut closed,
        registration: _registration,
    } = listening;
    if send(&mut socket, first).await.is_err() {
        return;
    }
    let mut answered = Instant::now();
    let mut ping = tokio::time::interval_at(Instant::now() + PING_EVERY, PING_EVERY);
    loop {
        tokio::select! {
            _ = &mut closed => break,
            changed = heads.changed() => {
                if changed.is_err() {
                    break;
                }
                let latest = *heads.borrow_and_update();
                if send(&mut socket, latest).await.is_err() {
                    return;
                }
            }
            _ = ping.tick() => {
                if answered.elapsed() >= SILENT_FOR {
                    break;
                }
                if socket.send(Message::Ping(Bytes::new())).await.is_err() {
                    return;
                }
            }
            message = socket.recv() => match message {
                Some(Ok(Message::Pong(_) | Message::Ping(_))) => answered = Instant::now(),
                Some(Ok(Message::Text(_) | Message::Binary(_))) => {
                    close(socket, close_code::POLICY, "the events socket takes no messages").await;
                    return;
                }
                Some(Ok(Message::Close(_)) | Err(_)) | None => return,
            },
        }
    }
    close(socket, close_code::NORMAL, "").await;
}

async fn send(socket: &mut WebSocket, heads: Heads) -> Result<(), axum::Error> {
    let mut bytes = Vec::new();
    ciborium::into_writer(&heads, &mut bytes).map_err(axum::Error::new)?;
    socket.send(Message::Binary(bytes.into())).await
}

// WHY: the socket is going away either way, so a close frame that cannot be sent changes nothing.
async fn close(mut socket: WebSocket, code: u16, reason: &'static str) {
    socket
        .send(Message::Close(Some(CloseFrame {
            code,
            reason: reason.into(),
        })))
        .await
        .unwrap_or_default();
}
