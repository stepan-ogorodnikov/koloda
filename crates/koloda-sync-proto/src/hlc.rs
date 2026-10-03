//! Hybrid logical clock and stamp order (`PROTOCOL.md` §Clocks and order).
//!
//! No clock source lives here: callers pass wall time in and persist `HlcClock` themselves.

use std::fmt;

const COUNTER_BITS: u32 = 16;
const MAX_WALL_MS: u64 = (1 << 48) - 1;

pub const SKEW_TOLERANCE_MS: u64 = 5 * 60 * 1000;

/// 48 bits of wall milliseconds above 16 bits of counter, so the raw `u64` order is the clock order.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Hlc(u64);

/// Raw UUID bytes of the device that minted a stamp. Ties between equal HLCs break on these bytes.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct DeviceId(pub [u8; 16]);

/// Total order of writes to one register. Field order matters: the derived `Ord` compares `hlc` first.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Stamp {
    pub hlc: Hlc,
    pub device: DeviceId,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct HlcClock {
    pub last: Hlc,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HlcError {
    WallOutOfRange { wall_ms: u64 },
    TooFarAhead { wall_ms: u64, server_now_ms: u64 },
}

impl Hlc {
    pub fn new(wall_ms: u64, counter: u16) -> Result<Hlc, HlcError> {
        if wall_ms > MAX_WALL_MS {
            return Err(HlcError::WallOutOfRange { wall_ms });
        }
        Ok(Hlc((wall_ms << COUNTER_BITS) | u64::from(counter)))
    }

    pub fn from_raw(raw: u64) -> Hlc {
        Hlc(raw)
    }

    pub fn raw(self) -> u64 {
        self.0
    }

    pub fn wall_ms(self) -> u64 {
        self.0 >> COUNTER_BITS
    }

    pub fn counter(self) -> u16 {
        // WHY: the mask keeps exactly the low 16 bits, so the narrowing cannot lose information.
        (self.0 & u64::from(u16::MAX)) as u16
    }
}

impl HlcClock {
    pub fn tick(&mut self, now_ms: u64) -> Result<Hlc, HlcError> {
        let last = self.last;
        let next = if now_ms > last.wall_ms() {
            Hlc::new(now_ms, 0)?
        } else if last.counter() == u16::MAX {
            // WHY: on counter overflow the wall part runs one millisecond ahead instead of failing the commit.
            Hlc::new(last.wall_ms() + 1, 0)?
        } else {
            Hlc::new(last.wall_ms(), last.counter() + 1)?
        };
        self.last = next;
        Ok(next)
    }

    // INVARIANT: adopt every applied stamp, however far ahead, so the next local write beats what it read.
    // The skew guards stop wrong clocks at the boundary instead.
    pub fn observe(&mut self, applied: Hlc) {
        self.last = self.last.max(applied);
    }
}

pub fn is_skew_paused(local_now_ms: u64, server_now_ms: u64) -> bool {
    local_now_ms.abs_diff(server_now_ms) > SKEW_TOLERANCE_MS
}

pub fn check_not_ahead_of_server(hlc: Hlc, server_now_ms: u64) -> Result<(), HlcError> {
    if hlc.wall_ms() > server_now_ms.saturating_add(SKEW_TOLERANCE_MS) {
        Err(HlcError::TooFarAhead {
            wall_ms: hlc.wall_ms(),
            server_now_ms,
        })
    } else {
        Ok(())
    }
}

impl fmt::Display for HlcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HlcError::WallOutOfRange { wall_ms } => write!(f, "wall time {wall_ms} does not fit in 48 bits"),
            HlcError::TooFarAhead { wall_ms, server_now_ms } => {
                write!(
                    f,
                    "stamp wall time {wall_ms} is more than 5 minutes ahead of server time {server_now_ms}"
                )
            }
        }
    }
}

impl std::error::Error for HlcError {}
