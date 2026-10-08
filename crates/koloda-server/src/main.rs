//! `koloda-server` command line: `init` creates a data directory, `serve` runs the server on one and collects
//! garbage every hour, `backup` copies a running server, `restore` puts a backup back as a new generation, and
//! `spaces` and `pair` list spaces and issue a pairing code beside a running `serve`, `quota` sets a space's size
//! quota, `drop-envelope` removes one damaged envelope from a space's log, and `write-schema` raises a kind's write
//! schema.

use std::io::{self, Write};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use clap::{Parser, Subcommand};
use koloda_server::backup;
use koloda_server::clock::{Clock, SystemClock};
use koloda_server::data_dir::{self, DataDirLock};
use koloda_server::quota::{Storage, DEFAULT_MIN_FREE_DISK, DEFAULT_RESERVE_DISK};
use koloda_server::restore::{self, RestoreOptions};
use koloda_server::router;
use koloda_server::server::Server;
use koloda_sync_proto::registry::{Kind, Lane};
use koloda_sync_proto::transport::RestoreMode;
use uuid::Uuid;

const COLLECT_EVERY: Duration = Duration::from_secs(60 * 60);
const DAY_MS: u64 = 24 * 60 * 60 * 1000;

#[derive(Parser)]
#[command(name = "koloda-server", version, about = "Koloda sync server")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Create a data directory and print its setup token.
    Init {
        #[arg(long)]
        data_dir: PathBuf,
    },
    /// Copy the running server into an empty directory, with a manifest that `restore` checks.
    Backup {
        #[arg(long)]
        data_dir: PathBuf,
        out: PathBuf,
    },
    /// Restore a backup as a new generation; stop `serve` first.
    Restore {
        #[arg(long)]
        data_dir: PathBuf,
        backup: PathBuf,
        /// Devices discard local data and re-download the backup, instead of re-pushing what it lacks.
        #[arg(long)]
        authoritative: bool,
        /// Revoke every restored device, so each pairs again.
        #[arg(long)]
        rotate_tokens: bool,
        /// Restore without asking.
        #[arg(long)]
        yes: bool,
    },
    /// List the spaces with their device counts.
    Spaces {
        #[arg(long)]
        data_dir: PathBuf,
    },
    /// Print a pairing code for a space, as the setup token issues one.
    Pair {
        #[arg(long)]
        data_dir: PathBuf,
        space: Uuid,
    },
    /// Remove one damaged envelope from a space's log, so devices held at it pass it.
    DropEnvelope {
        #[arg(long)]
        data_dir: PathBuf,
        space: Uuid,
        /// `hot` or `cold`, as the device's hold reports it.
        lane: String,
        seq: u64,
        /// Drop without asking.
        #[arg(long)]
        yes: bool,
    },
    /// Set a space's size quota in bytes, or `none`; over it, devices' growing writes wait.
    Quota {
        #[arg(long)]
        data_dir: PathBuf,
        space: Uuid,
        bytes: String,
    },
    /// Raise a kind's write schema by one version, once every active device of the space has advertised it.
    WriteSchema {
        #[arg(long)]
        data_dir: PathBuf,
        space: Uuid,
        kind: String,
        schema: u32,
    },
    /// Serve plain HTTP; put a TLS reverse proxy in front of it.
    Serve {
        #[arg(long)]
        data_dir: PathBuf,
        #[arg(long, default_value = "127.0.0.1:8080")]
        listen: SocketAddr,
        /// Below this many free bytes on disk, growing writes wait as if every space were over its quota.
        #[arg(long, default_value_t = DEFAULT_MIN_FREE_DISK)]
        min_free_disk: u64,
        /// Below this many free bytes on disk, every push is refused.
        #[arg(long, default_value_t = DEFAULT_RESERVE_DISK)]
        reserve_disk: u64,
    },
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("koloda-server: {message}");
            ExitCode::FAILURE
        }
    }
}

fn run(cli: Cli) -> Result<(), String> {
    match cli.command {
        Command::Init { data_dir } => {
            let token = data_dir::init(&data_dir, SystemClock.now_ms()).map_err(|error| error.to_string())?;
            println!("Setup token: {token}");
            println!("Store it now; it is not shown again.");
            Ok(())
        }
        Command::Backup { data_dir, out } => {
            let manifest = backup::backup(&data_dir, &out, SystemClock.now_ms()).map_err(|error| error.to_string())?;
            println!(
                "Backed up {} space(s) from generation {} to {}",
                manifest.spaces.len(),
                manifest.generation,
                out.display()
            );
            Ok(())
        }
        Command::Restore {
            data_dir,
            backup,
            authoritative,
            rotate_tokens,
            yes,
        } => {
            let options = RestoreOptions {
                mode: if authoritative {
                    RestoreMode::Authoritative
                } else {
                    RestoreMode::Heal
                },
                is_rotating_tokens: rotate_tokens,
            };
            restore(&data_dir, &backup, options, yes)
        }
        Command::Spaces { data_dir } => {
            let server = Server::open(&data_dir, Arc::new(SystemClock)).map_err(|error| error.to_string())?;
            let spaces = server.spaces().map_err(|error| error.to_string())?;
            for space in spaces.spaces {
                println!(
                    "{}  {}  {} device(s)",
                    Uuid::from_bytes(space.id),
                    space.name,
                    space.device_count
                );
            }
            Ok(())
        }
        Command::Pair { data_dir, space } => {
            let server = Server::open(&data_dir, Arc::new(SystemClock)).map_err(|error| error.to_string())?;
            let pairing = server.issue_pairing(space).map_err(|error| error.to_string())?;
            let minutes = pairing.expires_at.saturating_sub(SystemClock.now_ms()) / 60_000;
            println!("Pairing code: {}", pairing.code);
            println!("It works once, for {minutes} minutes.");
            Ok(())
        }
        Command::DropEnvelope {
            data_dir,
            space,
            lane,
            seq,
            yes,
        } => {
            let lane = Lane::from_wire(&lane).map_err(|error| error.to_string())?;
            drop_envelope(&data_dir, space, lane, seq, yes)
        }
        Command::Quota { data_dir, space, bytes } => {
            let quota = match bytes.as_str() {
                "none" => None,
                bytes => Some(
                    bytes
                        .parse::<u64>()
                        .map_err(|error| format!("`{bytes}` is not a byte count or `none`: {error}"))?,
                ),
            };
            let server = Server::open(&data_dir, Arc::new(SystemClock)).map_err(|error| error.to_string())?;
            server.set_quota(space, quota).map_err(|error| error.to_string())?;
            match quota {
                Some(bytes) => println!("Space {space} may hold {bytes} bytes."),
                None => println!("Space {space} has no quota."),
            }
            Ok(())
        }
        Command::WriteSchema {
            data_dir,
            space,
            kind,
            schema,
        } => {
            let kind = Kind::from_wire(&kind).map_err(|error| error.to_string())?;
            let server = Server::open(&data_dir, Arc::new(SystemClock)).map_err(|error| error.to_string())?;
            server
                .raise_write_schema(space, kind, schema)
                .map_err(|error| error.to_string())?;
            println!("Space {space} accepts {} at schema {schema}.", kind.as_wire());
            Ok(())
        }
        Command::Serve {
            data_dir,
            listen,
            min_free_disk,
            reserve_disk,
        } => serve(
            data_dir,
            listen,
            Storage {
                min_free_disk,
                reserve_disk,
                ..Storage::default()
            },
        ),
    }
}

fn drop_envelope(data_dir: &Path, space: Uuid, lane: Lane, seq: u64, is_confirmed: bool) -> Result<(), String> {
    let server = Server::open(data_dir, Arc::new(SystemClock)).map_err(|error| error.to_string())?;
    let dropping = server
        .describe_drop(space, lane, seq)
        .map_err(|error| error.to_string())?;
    let group = if dropping.group.is_empty() {
        "tombstone"
    } else {
        dropping.group.as_str()
    };
    println!(
        "{} seq {}: {} {} ({group})",
        lane.as_wire(),
        seq,
        dropping.kind,
        dropping.id
    );
    if dropping.group == "create" {
        println!(
            "Every device deletes it, with {} card(s) and {} review(s).",
            dropping.cards, dropping.reviews
        );
    } else if dropping.group.is_empty() {
        println!("The server writes the delete again in its place.");
    } else {
        println!("Devices keep what they hold; a new device sees this group as the entity was created.");
    }
    if !is_confirmed && !confirm("Drop this envelope? [y/N] ")? {
        println!("Nothing was dropped.");
        return Ok(());
    }
    server
        .drop_envelope(space, &dropping)
        .map_err(|error| error.to_string())?;
    println!("Dropped.");
    Ok(())
}

fn restore(data_dir: &Path, backup: &Path, options: RestoreOptions, is_confirmed: bool) -> Result<(), String> {
    let now = SystemClock.now_ms();
    let prepared = restore::prepare(data_dir, backup, options, now).map_err(|error| error.to_string())?;
    println!("Devices after the restore:");
    for device in prepared.devices() {
        let days = now.saturating_sub(device.last_seen) / DAY_MS;
        let revoked = if device.is_revoked { ", revoked" } else { "" };
        println!(
            "  {} ({}) in {}: last seen {days} day(s) before the restore{revoked}",
            device.name, device.platform, device.space_name
        );
    }
    if !is_confirmed && !confirm("Restore this backup? [y/N] ")? {
        prepared.abort().map_err(|error| error.to_string())?;
        println!("Nothing was restored.");
        return Ok(());
    }
    let epochs = prepared.epochs().to_vec();
    let generation = prepared.commit().map_err(|error| error.to_string())?;
    println!("Restored as generation {generation}.");
    for (space, epoch) in epochs {
        println!("  space {space}: epoch {epoch}");
    }
    Ok(())
}

fn confirm(question: &str) -> Result<bool, String> {
    print!("{question}");
    io::stdout().flush().map_err(|error| error.to_string())?;
    let mut answer = String::new();
    io::stdin().read_line(&mut answer).map_err(|error| error.to_string())?;
    Ok(matches!(answer.trim().to_lowercase().as_str(), "y" | "yes"))
}

fn serve(data_dir: PathBuf, listen: SocketAddr, storage: Storage) -> Result<(), String> {
    let _lock = DataDirLock::acquire(&data_dir).map_err(|error| error.to_string())?;
    let server = Server::open_with(&data_dir, Arc::new(SystemClock), storage).map_err(|error| error.to_string())?;
    let runtime = tokio::runtime::Runtime::new().map_err(|error| error.to_string())?;
    runtime.block_on(async move {
        let listener = tokio::net::TcpListener::bind(listen)
            .await
            .map_err(|error| format!("cannot listen on {listen}: {error}"))?;
        eprintln!("koloda-server: listening on {listen}");
        let server = Arc::new(server);
        tokio::spawn(collect_garbage(Arc::clone(&server)));
        axum::serve(
            listener,
            router(server).into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(shutdown())
        .await
        .map_err(|error| error.to_string())
    })
}

async fn collect_garbage(server: Arc<Server>) {
    let mut interval = tokio::time::interval(COLLECT_EVERY);
    loop {
        interval.tick().await;
        let server = Arc::clone(&server);
        match tokio::task::spawn_blocking(move || server.collect_garbage()).await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => eprintln!("koloda-server: collection failed: {error:?}"),
            Err(error) => eprintln!("koloda-server: collection failed: {error}"),
        }
    }
}

async fn shutdown() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        eprintln!("koloda-server: cannot listen for Ctrl+C, stopping: {error}");
    }
}
