//! `koloda-server` command line: `init` creates a data directory, `serve` runs the server on one and collects
//! garbage every hour, and `backup` copies a running server.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use clap::{Parser, Subcommand};
use koloda_server::backup;
use koloda_server::clock::{Clock, SystemClock};
use koloda_server::data_dir::{self, DataDirLock};
use koloda_server::router;
use koloda_server::server::Server;

const COLLECT_EVERY: Duration = Duration::from_secs(60 * 60);

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
    /// Serve plain HTTP; put a TLS reverse proxy in front of it.
    Serve {
        #[arg(long)]
        data_dir: PathBuf,
        #[arg(long, default_value = "127.0.0.1:8080")]
        listen: SocketAddr,
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
        Command::Serve { data_dir, listen } => serve(data_dir, listen),
    }
}

fn serve(data_dir: PathBuf, listen: SocketAddr) -> Result<(), String> {
    let _lock = DataDirLock::acquire(&data_dir).map_err(|error| error.to_string())?;
    let server = Server::open(&data_dir, Arc::new(SystemClock)).map_err(|error| error.to_string())?;
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
