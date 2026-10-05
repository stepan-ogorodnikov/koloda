use koloda::app::secrets::SecretStore;
use koloda::repo::sync::join::begin_import;
use koloda_sync::error::SyncError;
use koloda_sync::transport::Method;
use koloda_sync_proto::transport::{DeviceInfo, ErrorCode, SpaceList};
use uuid::Uuid;

use crate::common::{Device, Fault, TestServer, SERVER_URL};

fn create(server: &TestServer, device: &Device) -> Result<(), SyncError> {
    device
        .engine
        .create_space(SERVER_URL, &server.setup_token, "Study", "Laptop")
}

#[test]
fn creating_a_space_enrolls_the_file_as_its_creator() {
    let server = TestServer::new();
    let device = server.device();

    device
        .engine
        .create_space("https://sync.test/", &server.setup_token, "Study", "Laptop")
        .expect("space is created");

    let state = device.state().expect("the file is enrolled");
    assert_eq!(state.role, "creator");
    assert_eq!(
        state.server_url.as_deref(),
        Some(SERVER_URL),
        "the URL is stored without its trailing slash"
    );
    let token = device
        .secrets
        .get(&format!("sync.token.{}", state.device_id))
        .expect("the secret store reads")
        .expect("the token is stored under the device id");
    let (status, reply) = server.call::<DeviceInfo>(
        Method::Get,
        &format!("/v1/spaces/{}/devices/{}", state.space_id, state.device_id),
        &token,
    );
    assert_eq!(status, 200, "the stored token authenticates the enrolled device");
    assert_eq!(reply.meta.epoch, state.epoch, "the file stores the space's epoch");
}

#[test]
fn a_file_with_sync_state_is_refused_before_any_request() {
    let server = TestServer::new();
    let enrolled = server.device();
    create(&server, &enrolled).expect("space is created");
    let pending = server.device();
    begin_import(&pending.db, Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4(), SERVER_URL).expect("a claim is recorded");

    for (name, device) in [("enrolled", &enrolled), ("import pending", &pending)] {
        let sent = device.transport.sent().len();
        let result = create(&server, device);
        assert!(matches!(result, Err(SyncError::AlreadyEnrolled)), "{name}: {result:?}");
        assert_eq!(device.transport.sent().len(), sent, "{name}: nothing is sent");
    }
}

#[test]
fn a_wrong_setup_token_enrolls_nothing() {
    let server = TestServer::new();
    let device = server.device();

    let result = device.engine.create_space(SERVER_URL, "wrong", "Study", "Laptop");

    assert!(
        matches!(
            result,
            Err(SyncError::Server {
                status: 401,
                code: ErrorCode::Unauthorized,
                ..
            })
        ),
        "{result:?}"
    );
    assert!(device.state().is_none(), "the file is not enrolled");
    assert!(device.secrets.keys().is_empty(), "no token is stored");
}

#[test]
fn a_lost_reply_is_retried_into_the_same_space() {
    let server = TestServer::new();
    let device = server.device();
    device.transport.fault(Fault::LoseReply);

    create(&server, &device).expect("the retry creates the space");

    assert_eq!(device.transport.sent().len(), 2, "one lost reply, one retry");
    let (_, reply) = server.call::<SpaceList>(Method::Get, "/v1/spaces", &server.setup_token);
    let spaces = reply.ok.expect("the space list").spaces;
    let state = device.state().expect("the file is enrolled");
    assert_eq!(
        spaces.len(),
        1,
        "the retry reuses the nonce, so the server holds one space"
    );
    assert_eq!(spaces.first().map(|space| space.id), Some(*state.space_id.as_bytes()));
}
