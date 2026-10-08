use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use koloda_server::tls::{Certificates, TlsListener};
use rcgen::{BasicConstraints, CertificateParams, CertifiedIssuer, IsCa, KeyPair};
use rustls::pki_types::ServerName;
use rustls::{ClientConfig, RootCertStore};
use tempfile::TempDir;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;

use crate::common::Harness;

type Authority = CertifiedIssuer<'static, KeyPair>;

fn authority() -> Authority {
    let mut params = CertificateParams::new(Vec::<String>::new()).expect("authority parameters");
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    CertifiedIssuer::self_signed(params, KeyPair::generate().expect("authority key")).expect("authority certificate")
}

/// Writes a certificate for `localhost` that `authority` signed, and its key, as PEM files in `dir`.
fn write_pair(dir: &Path, authority: &Authority) -> (PathBuf, PathBuf) {
    let key = KeyPair::generate().expect("server key");
    let cert = CertificateParams::new(vec!["localhost".to_string()])
        .expect("server parameters")
        .signed_by(&key, authority)
        .expect("server certificate");
    let (cert_path, key_path) = (dir.join("cert.pem"), dir.join("key.pem"));
    std::fs::write(&cert_path, cert.pem()).expect("write the certificate");
    std::fs::write(&key_path, key.serialize_pem()).expect("write the key");
    (cert_path, key_path)
}

async fn serve_tls(harness: &Harness, certificates: Arc<Certificates>) -> SocketAddr {
    let tcp = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind a loopback port");
    let address = tcp.local_addr().expect("the bound address");
    let router = harness.router.clone();
    tokio::spawn(async move { axum::serve(TlsListener::new(tcp, certificates), router).await });
    address
}

// WHY: shorter than the server's 10-second handshake timeout, so a listener that waited out a stalled client before
// serving the next one fails here, and a listener that never serves it fails rather than hangs.
const WAIT: Duration = Duration::from_secs(5);

/// Sends `GET /v1/spaces` over TLS to `localhost`, trusting only `authority`, and returns the status line.
async fn status_line(address: SocketAddr, authority: &Authority) -> Result<String, std::io::Error> {
    tokio::time::timeout(WAIT, request(address, authority))
        .await
        .map_err(|_elapsed| std::io::Error::other("the server answered nothing in time"))?
}

async fn request(address: SocketAddr, authority: &Authority) -> Result<String, std::io::Error> {
    let mut roots = RootCertStore::empty();
    roots.add(authority.der().clone()).expect("a trusted authority");
    let config = ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .expect("protocol versions")
        .with_root_certificates(roots)
        .with_no_client_auth();
    let tcp = TcpStream::connect(address).await?;
    let name = ServerName::try_from("localhost").expect("a server name");
    let mut tls = TlsConnector::from(Arc::new(config)).connect(name, tcp).await?;
    tls.write_all(b"GET /v1/spaces HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .await?;
    let mut reply = Vec::new();
    tls.read_to_end(&mut reply).await?;
    let reply = String::from_utf8_lossy(&reply).to_string();
    Ok(reply.lines().next().unwrap_or_default().to_string())
}

#[tokio::test]
async fn the_server_answers_over_tls_with_its_certificate_files() {
    let harness = Harness::new();
    let dir = TempDir::new().expect("certificate directory");
    let ca = authority();
    let (cert, key) = write_pair(dir.path(), &ca);
    let address = serve_tls(
        &harness,
        Arc::new(Certificates::load(&cert, &key).expect("the pair loads")),
    )
    .await;

    let status = status_line(address, &ca).await.expect("the handshake succeeds");

    assert_eq!(
        status, "HTTP/1.1 401 Unauthorized",
        "a setup-token call without the token"
    );
}

#[tokio::test]
async fn changed_files_take_over_and_a_broken_pair_keeps_the_old_one() {
    let harness = Harness::new();
    let dir = TempDir::new().expect("certificate directory");
    let (first, second) = (authority(), authority());
    let (cert, key) = write_pair(dir.path(), &first);
    let certificates = Arc::new(Certificates::load(&cert, &key).expect("the pair loads"));
    let address = serve_tls(&harness, Arc::clone(&certificates)).await;

    assert!(
        !certificates.reload().expect("the same files read"),
        "unchanged files change nothing"
    );
    write_pair(dir.path(), &second);
    assert!(certificates.reload().expect("the renewed pair loads"));
    let renewed = status_line(address, &second).await;
    let stale = status_line(address, &first).await;
    std::fs::write(&key, "not a key").expect("break the key");
    let broken = certificates.reload();
    let kept = status_line(address, &second).await;

    assert!(renewed.is_ok(), "the renewed certificate is presented: {renewed:?}");
    assert!(stale.is_err(), "the replaced certificate is not");
    assert!(broken.is_err(), "a key that does not load is refused");
    assert!(kept.is_ok(), "the last good pair stays: {kept:?}");
}

#[tokio::test]
async fn a_client_that_stalls_its_handshake_holds_up_no_other() {
    let harness = Harness::new();
    let dir = TempDir::new().expect("certificate directory");
    let ca = authority();
    let (cert, key) = write_pair(dir.path(), &ca);
    let address = serve_tls(
        &harness,
        Arc::new(Certificates::load(&cert, &key).expect("the pair loads")),
    )
    .await;

    let _stalled = TcpStream::connect(address)
        .await
        .expect("a connection that sends nothing");
    let status = status_line(address, &ca)
        .await
        .expect("the second client is served in time");

    assert_eq!(status, "HTTP/1.1 401 Unauthorized");
}

#[tokio::test]
async fn a_failed_handshake_holds_up_no_later_client() {
    let harness = Harness::new();
    let dir = TempDir::new().expect("certificate directory");
    let (ca, stranger) = (authority(), authority());
    let (cert, key) = write_pair(dir.path(), &ca);
    let address = serve_tls(
        &harness,
        Arc::new(Certificates::load(&cert, &key).expect("the pair loads")),
    )
    .await;

    // A failed handshake and the next connection can reach the listener together, so the pair repeats.
    for _ in 0..10 {
        let refused = status_line(address, &stranger).await;
        let served = status_line(address, &ca).await;

        assert!(
            refused.is_err(),
            "a client that trusts another authority fails its handshake"
        );
        assert!(served.is_ok(), "the next client is served: {served:?}");
    }
}

#[test]
fn serve_needs_exactly_one_of_tls_and_plain_http() {
    let dir = TempDir::new().expect("data directory");
    let data_dir = dir.path().to_str().expect("a UTF-8 path");
    let cases = [
        ("neither", vec![]),
        (
            "both",
            vec!["--tls-cert", "cert.pem", "--tls-key", "key.pem", "--insecure-http"],
        ),
        ("a certificate without its key", vec!["--tls-cert", "cert.pem"]),
    ];
    for (name, flags) in cases {
        let output = Command::new(env!("CARGO_BIN_EXE_koloda-server"))
            .args(["serve", "--data-dir", data_dir])
            .args(&flags)
            .output()
            .expect("the binary runs");
        assert_eq!(
            output.status.code(),
            Some(2),
            "{name}: a usage error, before anything is served"
        );
    }
}
