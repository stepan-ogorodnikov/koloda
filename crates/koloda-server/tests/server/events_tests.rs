use std::net::SocketAddr;
use std::time::Duration;

use axum::http::header::AUTHORIZATION;
use axum::http::{Method, StatusCode};
use futures_util::{SinkExt, StreamExt};
use koloda_sync_proto::payload::SCHEMA;
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{encode_schemas, Empty, Enrollment, ErrorCode, Heads, EPOCH_HEADER, SCHEMAS_HEADER};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};
use uuid::Uuid;

use crate::common::{stamp, uuid, write, Harness};

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

// WHY: a bound on how long a broken test waits for a frame, not an ordering; every frame here is already due.
const WAIT: Duration = Duration::from_secs(10);

fn events_path(device: &Enrollment) -> String {
    format!("/v1/spaces/{}/events", uuid(device.space_id))
}

/// Serves the harness's router on a loopback port, as `serve` does, so sockets can upgrade.
async fn listen(harness: &Harness) -> SocketAddr {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind a loopback port");
    let address = listener.local_addr().expect("the bound address");
    let router = harness.router.clone();
    tokio::spawn(async move { axum::serve(listener, router).await });
    address
}

async fn connect(address: SocketAddr, device: &Enrollment) -> Socket {
    let mut request = format!("ws://{address}{}", events_path(device))
        .into_client_request()
        .expect("a WebSocket request");
    let headers = request.headers_mut();
    let bearer = format!("Bearer {}", device.token);
    headers.insert(AUTHORIZATION, bearer.parse().expect("a header value"));
    let epoch = Uuid::from_bytes(device.epoch).to_string();
    headers.insert(EPOCH_HEADER, epoch.parse().expect("a header value"));
    headers.insert(
        SCHEMAS_HEADER,
        encode_schemas(|_| SCHEMA).parse().expect("a header value"),
    );
    let (socket, _) = tokio_tungstenite::connect_async(request)
        .await
        .expect("the server accepts the upgrade");
    socket
}

/// The next heads the server sends; `None` once the server closed the socket, or sent something else.
async fn next_heads(socket: &mut Socket) -> Option<Heads> {
    loop {
        let message = tokio::time::timeout(WAIT, socket.next())
            .await
            .expect("the server sends a frame in time");
        match message {
            Some(Ok(Message::Binary(bytes))) => {
                return Some(ciborium::from_reader(bytes.as_ref()).expect("heads are CBOR"));
            }
            Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
            Some(Ok(_) | Err(_)) | None => return None,
        }
    }
}

#[tokio::test]
async fn a_socket_gets_the_heads_then_every_push_that_moves_them() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    harness
        .push(
            &home,
            vec![(1, write(Kind::Algorithms, "first", Group::Create, stamp(1, 0, 1)))],
        )
        .await
        .ok();
    let address = listen(&harness).await;

    let mut socket = connect(address, &phone).await;
    let first = next_heads(&mut socket).await;
    harness
        .push(
            &home,
            vec![(2, write(Kind::Algorithms, "second", Group::Create, stamp(2, 0, 1)))],
        )
        .await
        .ok();
    let pushed = next_heads(&mut socket).await;

    let meta = harness.device_meta(&home).await;
    assert_eq!(
        first,
        Some(Heads {
            head_hot: 1,
            head_cold: 0
        }),
        "a new socket first gets the heads as they are"
    );
    assert_eq!(
        pushed,
        Some(Heads {
            head_hot: meta.head_hot,
            head_cold: meta.head_cold
        }),
        "a push by another device sends the heads it moved"
    );
    assert_eq!(meta.head_hot, 2);
}

#[tokio::test]
async fn a_push_that_moves_no_head_sends_nothing() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let create = write(Kind::Algorithms, "first", Group::Create, stamp(1, 0, 1));
    harness.push(&home, vec![(1, create.clone())]).await.ok();
    let address = listen(&harness).await;
    let mut socket = connect(address, &phone).await;
    next_heads(&mut socket).await;

    // A second create of the same entity is stale and takes no seq.
    harness.push(&phone, vec![(1, create)]).await.ok();
    harness
        .push(
            &home,
            vec![(2, write(Kind::Algorithms, "second", Group::Create, stamp(2, 0, 1)))],
        )
        .await
        .ok();

    assert_eq!(
        next_heads(&mut socket).await.map(|heads| heads.head_hot),
        Some(2),
        "the stale push sent nothing, so the next frame is the later push's"
    );
}

#[tokio::test]
async fn an_upgrade_is_refused_like_any_device_call() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let laptop = harness.pair(&home, "Laptop").await;
    harness
        .call(
            Method::DELETE,
            format!("/v1/spaces/{}/devices/{}", uuid(home.space_id), uuid(laptop.device_id)),
        )
        .token(&home.token)
        .send::<Empty>()
        .await
        .ok();

    let cases = [
        (
            "an unknown token",
            harness.get(events_path(&home)).token(&"0".repeat(64)),
            (StatusCode::UNAUTHORIZED, ErrorCode::UnknownDevice),
        ),
        (
            "a revoked device",
            harness.get(events_path(&laptop)).token(&laptop.token),
            (StatusCode::UNAUTHORIZED, ErrorCode::Revoked),
        ),
        (
            "another epoch",
            harness
                .get(events_path(&phone))
                .token(&phone.token)
                .epoch(Uuid::new_v4()),
            (StatusCode::CONFLICT, ErrorCode::EpochChanged),
        ),
        // WHY: the in-process router cannot upgrade a connection, so an authorized call here is not an upgrade.
        (
            "a request that is not an upgrade",
            harness.get(events_path(&phone)).token(&phone.token),
            (StatusCode::BAD_REQUEST, ErrorCode::BadRequest),
        ),
    ];
    for (name, call, expected) in cases {
        assert_eq!(call.send::<Empty>().await.error(), expected, "{name}");
    }
}

#[tokio::test]
async fn a_second_socket_of_a_device_closes_the_first() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let address = listen(&harness).await;
    let mut older = connect(address, &phone).await;
    next_heads(&mut older).await;

    let mut newer = connect(address, &phone).await;
    next_heads(&mut newer).await;
    harness
        .push(
            &home,
            vec![(1, write(Kind::Algorithms, "first", Group::Create, stamp(1, 0, 1)))],
        )
        .await
        .ok();

    assert_eq!(next_heads(&mut older).await, None, "the older socket closed");
    assert_eq!(
        next_heads(&mut newer).await.map(|heads| heads.head_hot),
        Some(1),
        "the newer socket keeps getting heads"
    );
}

#[tokio::test]
async fn revoking_a_device_closes_its_socket() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let phone = harness.pair(&home, "Phone").await;
    let address = listen(&harness).await;
    let mut socket = connect(address, &phone).await;
    next_heads(&mut socket).await;

    harness
        .call(
            Method::DELETE,
            format!("/v1/spaces/{}/devices/{}", uuid(home.space_id), uuid(phone.device_id)),
        )
        .token(&home.token)
        .send::<Empty>()
        .await
        .ok();

    assert_eq!(next_heads(&mut socket).await, None);
}

#[tokio::test]
async fn a_socket_that_sends_data_is_closed() {
    let harness = Harness::new();
    let home = harness.create_space("Home").await;
    let address = listen(&harness).await;
    let mut socket = connect(address, &home).await;
    next_heads(&mut socket).await;

    socket
        .send(Message::Binary(vec![1].into()))
        .await
        .expect("the frame goes out");

    assert_eq!(next_heads(&mut socket).await, None);
}
