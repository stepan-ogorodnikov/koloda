use std::sync::mpsc::channel;
use std::sync::Arc;

use koloda::app::init::seed_db;
use koloda::domain::attachments::SweepAttachmentsData;
use koloda::domain::cards::{CardContentField, UpdateCardData, UpdateCardValues};
use koloda::repo::attachments::{get_attachment_bytes, sweep_attachments};
use koloda::repo::cards::update_card;
use koloda_sync::pairing::ImportMode;
use koloda_sync::runner::{Budget, Event};
use koloda_sync::transport::Method;
use koloda_sync_proto::transport::ErrorCode;

use crate::common::{error_reply, Device, Fault, Space, TestServer, SERVER_URL};
use crate::fixtures::{links, seed_data, seed_settings, Library, BACK, FRONT};
use crate::runner_support::{channel_sink, wait_for, ManualTimer};

const ATTACHMENTS: &str = "/attachments/";
const DAY_MS: u64 = 24 * 60 * 60 * 1000;

impl Device {
    fn image(&self, id: &str) -> Option<Vec<u8>> {
        get_attachment_bytes(&self.db, id).expect("attachment bytes read")
    }

    /// Requests to attachment paths with `method`, faulted ones included.
    fn transfers(&self, method: Method) -> usize {
        self.transport
            .sent()
            .iter()
            .filter(|request| request.method == method && request.url.contains(ATTACHMENTS))
            .count()
    }

    fn queued(&self) -> (usize, usize) {
        let status = self.engine.status().expect("status reads");
        (status.uploads, status.fetches)
    }
}

/// A library on the device, and a card in it linking `count` new images of `len` bytes.
struct Linked {
    library: Library,
    card: String,
    images: Vec<String>,
}

fn card_with_images(device: &Device, count: u64, len: usize) -> Linked {
    let library = device.library();
    let images: Vec<String> = (0..count).map(|seed| device.add_image(seed, len)).collect();
    let linked: Vec<&str> = images.iter().map(String::as_str).collect();
    let card = device.add_card(&library.deck, &library.template, &links(&linked));
    Linked { library, card, images }
}

#[test]
fn an_image_inserted_on_one_device_arrives_on_another() {
    let space = Space::new();
    let a = &space.device;
    let images = card_with_images(a, 1, 2_000).images;
    a.engine.sync_now().expect("A syncs");
    let b = space.server.join(a);
    let (sink, events) = channel_sink();

    b.engine
        .start_runner(sink, Arc::new(ManualTimer::default()))
        .expect("the runner starts");
    let event = wait_for(&events, |event| matches!(event, Event::AttachmentsFetched { .. }));

    assert_eq!(event, Event::AttachmentsFetched { ids: images.clone() });
    assert_eq!(b.image(&images[0]), a.image(&images[0]));
    assert_eq!(a.transfers(Method::Put), 1, "A uploads the image once");
    assert_eq!(a.queued(), (0, 0));
}

#[test]
fn an_image_in_a_card_written_before_enrollment_reaches_a_joiner() {
    let mut images = Vec::new();
    let space = Space::with(|device| images = card_with_images(device, 1, 2_000).images);
    space.device.engine.sync_now().expect("the creator backfills");
    let b = space.server.join(&space.device);

    b.engine.sync_now().expect("B bootstraps");

    assert_eq!(b.image(&images[0]), space.device.image(&images[0]));
}

#[test]
fn a_re_bootstrap_fetches_the_images_of_the_cards_it_brings() {
    let space = Space::new();
    let a = &space.device;
    a.engine.sync_now().expect("A syncs");
    let b = space.server.join(a);
    b.engine.sync_now().expect("B syncs");
    let a_id = a.state().expect("A is enrolled").device_id;
    space.server.backdate(a_id, 91 * DAY_MS);
    let images = card_with_images(&b, 1, 2_000).images;
    b.engine.sync_now().expect("B pushes the card and uploads its image");

    a.engine.sync_now().expect("A re-bootstraps");

    let opened = a
        .transport
        .sent()
        .iter()
        .any(|request| request.url.ends_with("/bootstrap"));
    assert!(opened, "A came back through a re-bootstrap");
    assert_eq!(
        a.image(&images[0]),
        b.image(&images[0]),
        "the snapshot queued the fetch"
    );
    assert_eq!(a.queued(), (0, 0));
}

#[test]
fn an_image_in_a_used_file_reaches_the_space_through_add() {
    let server = TestServer::new();
    let a = server.device();
    a.engine
        .create_space(SERVER_URL, &server.setup_token, "Study", "Laptop")
        .expect("A creates the space");
    let b = server.device();
    seed_db(&b.db, seed_data(100)).expect("B starts fresh");
    let images = card_with_images(&b, 1, 2_000).images;
    let code = a.engine.issue_pairing(None).expect("a code is issued").code;
    b.engine
        .join(SERVER_URL, &code, "Phone", seed_settings())
        .expect("B claims the code");

    b.engine.import(ImportMode::Add).expect("B adds its rows");
    b.engine.sync_now().expect("B syncs");
    a.engine.sync_now().expect("A pulls B's rows");

    assert_eq!(a.image(&images[0]), b.image(&images[0]));
}

#[test]
fn an_image_both_devices_hold_moves_once() {
    let space = Space::new();
    let a = &space.device;
    let Linked { library, images, .. } = card_with_images(a, 1, 2_000);
    a.engine.sync_now().expect("A syncs");
    let b = space.server.join(a);
    assert_eq!(b.add_image(0, 2_000), images[0], "B inserted the same file");

    b.engine.sync_now().expect("B bootstraps");
    b.add_card(&library.deck, &library.template, &links(&[&images[0]]));
    b.engine.sync_now().expect("B pushes its card");

    assert_eq!(a.transfers(Method::Put), 1);
    assert_eq!(b.transfers(Method::Put), 0, "the server already holds B's image");
    assert_eq!(b.transfers(Method::Get), 0, "B already holds A's image");
}

#[test]
fn a_device_that_pulls_before_the_upload_fetches_after_its_backoff() {
    let space = Space::new();
    let a = &space.device;
    let images = card_with_images(a, 1, 2_000).images;
    a.transport.fault_when(
        Method::Put,
        ATTACHMENTS,
        Fault::Reply(error_reply(500, ErrorCode::Internal)),
    );
    let refused = a.engine.sync_now();
    let deferred = a.queued();
    let b = space.server.join(a);

    b.engine.sync_now().expect("B syncs");
    let waiting = (b.image(&images[0]), b.queued());
    a.execute("UPDATE sync_attachment_queue SET next_attempt_at = 0");
    a.engine.sync_now().expect("A uploads");
    b.engine.sync_now().expect("B syncs before its backoff ends");
    let before_backoff = b.image(&images[0]);
    b.execute("UPDATE sync_attachment_queue SET next_attempt_at = 0");
    b.engine.sync_now().expect("B syncs after its backoff");

    assert!(refused.is_ok(), "a server fault on an upload does not stop the cycle");
    assert_eq!(deferred, (1, 0), "the upload waits out its backoff");
    assert_eq!(waiting, (None, (0, 1)), "B's fetch waits");
    assert_eq!(a.queued(), (0, 0));
    assert_eq!(before_backoff, None);
    assert_eq!(b.image(&images[0]), a.image(&images[0]));
    assert_eq!(b.transfers(Method::Get), 2);
}

#[test]
fn an_image_the_server_fails_on_waits_and_the_others_arrive_that_cycle() {
    let space = Space::new();
    let a = &space.device;
    let images = card_with_images(a, 3, 2_000).images;
    a.engine.sync_now().expect("A syncs");
    let b = space.server.join(a);
    b.transport.fault_when(
        Method::Get,
        ATTACHMENTS,
        Fault::Reply(error_reply(500, ErrorCode::Internal)),
    );

    b.engine.sync_now().expect("B's cycle goes on past the failed fetch");

    let arrived = images.iter().filter(|id| b.image(id).is_some()).count();
    assert_eq!(arrived, 2, "the other images arrive that cycle");
    assert_eq!(b.queued(), (0, 1), "the failed fetch waits for its retry");
    b.execute("UPDATE sync_attachment_queue SET next_attempt_at = 0");
    b.engine.sync_now().expect("B syncs after the backoff");
    assert!(images.iter().all(|id| b.image(id).is_some()));
}

#[test]
fn an_image_swept_before_its_upload_is_never_sent() {
    let space = Space::new();
    let a = &space.device;
    let card = card_with_images(a, 1, 2_000).card;
    a.transport.fault_when(
        Method::Put,
        ATTACHMENTS,
        Fault::Reply(error_reply(500, ErrorCode::Internal)),
    );
    a.engine.sync_now().expect("the upload waits out its backoff");
    update_card(
        &a.db,
        UpdateCardData {
            id: card,
            values: UpdateCardValues {
                content: [FRONT, BACK]
                    .map(|field| {
                        (
                            field.to_string(),
                            CardContentField {
                                text: "no image".to_string(),
                            },
                        )
                    })
                    .into(),
            },
        },
    )
    .expect("the image leaves the card");
    sweep_attachments(
        &a.db,
        SweepAttachmentsData {
            created_before: i64::MAX,
        },
    )
    .expect("the sweep runs");
    a.execute("UPDATE sync_attachment_queue SET next_attempt_at = 0");

    a.engine.sync_now().expect("A syncs");

    assert_eq!(a.transfers(Method::Put), 1, "only the refused upload was sent");
    assert_eq!(a.queued(), (0, 0));
}

#[test]
fn a_trigger_during_transfers_hands_the_rest_to_the_next_cycle() {
    let space = Space::new();
    let a = &space.device;
    let images = card_with_images(a, 2, 2_000).images;
    a.engine.sync_now().expect("A syncs");
    let b = space.server.join(a);
    let (reached, on_reached) = channel();
    let (resume, on_resume) = channel::<()>();
    let mut is_first = true;
    b.transport.observe(move |request| {
        if is_first && request.method == Method::Get && request.url.contains(ATTACHMENTS) {
            is_first = false;
            reached.send(()).expect("the test listens");
            on_resume.recv().expect("the test resumes the fetch");
        }
    });
    let (sink, events) = channel_sink();

    b.engine
        .start_runner(sink, Arc::new(ManualTimer::default()))
        .expect("the runner starts");
    on_reached.recv().expect("B fetches its first image");
    b.engine.nudge();
    resume.send(()).expect("the fetch resumes");
    let first = wait_for(&events, |event| matches!(event, Event::AttachmentsFetched { .. }));
    let second = wait_for(&events, |event| matches!(event, Event::AttachmentsFetched { .. }));

    let mut fetched = Vec::new();
    for event in [first, second] {
        let ids = match event {
            Event::AttachmentsFetched { ids } => ids,
            _ => Vec::new(),
        };
        assert_eq!(ids.len(), 1, "each cycle fetches one image");
        fetched.extend(ids);
    }
    fetched.sort();
    let mut expected = images.clone();
    expected.sort();
    assert_eq!(
        fetched, expected,
        "the next cycle fetches the rest without waiting for the poll"
    );
}

#[test]
fn a_tick_stops_between_transfers_once_its_bytes_are_spent() {
    let space = Space::new();
    let a = &space.device;
    let images = card_with_images(a, 2, 8_000).images;
    a.engine.sync_now().expect("A syncs");
    let b = space.server.join(a);
    // WHY: a fetch with no reply after its retries ends the cycle's transfers, so both images wait for the ticks.
    for _ in 0..4 {
        b.transport.fault_when(Method::Get, ATTACHMENTS, Fault::LoseReply);
    }
    b.engine.sync_now().expect_err("B's first fetch gets no reply");

    let first = b
        .engine
        .tick(Budget {
            wall: std::time::Duration::from_secs(60),
            body_bytes: 6_000,
        })
        .expect("the tick runs");
    let held_after_first = images.iter().filter(|id| b.image(id).is_some()).count();
    let second = b
        .engine
        .tick(Budget {
            wall: std::time::Duration::from_secs(60),
            body_bytes: usize::MAX,
        })
        .expect("the tick runs");

    assert!(!first.is_done);
    assert_eq!(held_after_first, 1, "the second image waits for the next tick");
    assert!(second.is_done);
    assert!(images.iter().all(|id| b.image(id).is_some()));
}

#[test]
fn an_upload_the_space_has_no_room_for_waits_then_goes_once_the_space_has_room() {
    let space = Space::new();
    let a = &space.device;
    let server = space.server.server();
    server.set_quota(space.space_id(), Some(1)).expect("the quota is set");
    card_with_images(a, 1, 2_000);

    a.engine.sync_now().expect("the cycle ends without an error");
    assert_eq!(a.queued(), (1, 0), "the upload stays queued");
    a.engine.sync_now().expect("A syncs again");
    assert_eq!(a.transfers(Method::Put), 1, "the upload waits before it tries again");

    server.set_quota(space.space_id(), None).expect("the quota is lifted");
    a.engine.sync_now().expect("A syncs once the space has room");

    assert_eq!(a.queued(), (0, 0), "the upload goes without waiting out its backoff");
    assert_eq!(a.transfers(Method::Put), 2);
}
