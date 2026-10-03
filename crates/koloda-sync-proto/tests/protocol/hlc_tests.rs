use koloda_sync_proto::hlc::{
    check_not_ahead_of_server, is_skew_paused, DeviceId, Hlc, HlcClock, HlcError, Stamp, SKEW_TOLERANCE_MS,
};

fn hlc(wall_ms: u64, counter: u16) -> Hlc {
    Hlc::new(wall_ms, counter).expect("test stamp fits in 48 bits")
}

#[test]
fn layout_is_wall_millis_above_a_16_bit_counter() {
    // Wire contract: the raw value travels in every envelope header.
    assert_eq!(hlc(1_700_000_000_000, 7).raw(), (1_700_000_000_000 << 16) | 7);
    assert_eq!(Hlc::from_raw((42 << 16) | 3), hlc(42, 3));
    assert_eq!(Hlc::new(1 << 48, 0), Err(HlcError::WallOutOfRange { wall_ms: 1 << 48 }));
}

#[test]
fn tick_never_goes_backwards_when_the_wall_clock_stalls_or_rewinds() {
    let mut clock = HlcClock::default();
    let cases = [
        (1_000, hlc(1_000, 0)),
        (1_000, hlc(1_000, 1)),
        (900, hlc(1_000, 2)),
        (1_001, hlc(1_001, 0)),
        (0, hlc(1_001, 1)),
    ];
    for (now_ms, expected) in cases {
        assert_eq!(clock.tick(now_ms), Ok(expected), "tick at {now_ms}");
    }
}

#[test]
fn counter_overflow_advances_the_wall_part_one_millisecond() {
    let mut clock = HlcClock {
        last: hlc(5_000, u16::MAX),
    };
    assert_eq!(clock.tick(5_000), Ok(hlc(5_001, 0)));
}

#[test]
fn a_local_write_beats_any_stamp_it_observed_even_from_ahead() {
    let mut clock = HlcClock::default();
    clock.tick(1_000).unwrap();

    let remote_from_ahead = hlc(9_000_000, 4);
    clock.observe(remote_from_ahead);
    assert!(clock.tick(1_001).unwrap() > remote_from_ahead);

    clock.observe(hlc(10, 0));
    assert_eq!(
        clock.last,
        hlc(9_000_000, 5),
        "an older stamp must not move the clock back"
    );
}

#[test]
fn stamps_order_by_hlc_then_by_device() {
    let low_device = DeviceId([1; 16]);
    let high_device = DeviceId([2; 16]);
    let tied_low = Stamp {
        hlc: hlc(1_000, 0),
        device: low_device,
    };
    let tied_high = Stamp {
        hlc: hlc(1_000, 0),
        device: high_device,
    };
    let later_low = Stamp {
        hlc: hlc(1_000, 1),
        device: low_device,
    };
    assert!(tied_low < tied_high, "equal HLC breaks on device bytes");
    assert!(tied_high < later_low, "a later HLC wins whatever the device");
}

#[test]
fn client_pauses_only_when_skew_exceeds_five_minutes() {
    let server_now = 1_700_000_000_000;
    let cases = [
        (server_now + SKEW_TOLERANCE_MS, false),
        (server_now + SKEW_TOLERANCE_MS + 1, true),
        (server_now - SKEW_TOLERANCE_MS, false),
        (server_now - SKEW_TOLERANCE_MS - 1, true),
    ];
    for (local_now, expected) in cases {
        assert_eq!(is_skew_paused(local_now, server_now), expected, "local {local_now}");
    }
}

#[test]
fn server_rejects_a_wall_part_more_than_five_minutes_ahead() {
    let server_now = 1_700_000_000_000;
    assert_eq!(
        check_not_ahead_of_server(hlc(server_now + SKEW_TOLERANCE_MS, u16::MAX), server_now),
        Ok(())
    );
    assert_eq!(
        check_not_ahead_of_server(hlc(server_now + SKEW_TOLERANCE_MS + 1, 0), server_now),
        Err(HlcError::TooFarAhead {
            wall_ms: server_now + SKEW_TOLERANCE_MS + 1,
            server_now_ms: server_now,
        })
    );
}
