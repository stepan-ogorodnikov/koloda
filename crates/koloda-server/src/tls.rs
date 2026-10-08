//! TLS for `serve`: certificates read from PEM files and read again when they change, and a listener that completes
//! each handshake off its accept loop, so a client that stalls holds up no other.

use std::fmt;
use std::io;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use axum::serve::Listener;
use rustls::pki_types::pem::PemObject;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::ServerConfig;
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinSet;
use tokio_rustls::server::TlsStream;
use tokio_rustls::TlsAcceptor;

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
const ACCEPT_RETRY: Duration = Duration::from_secs(1);

#[derive(Debug)]
pub struct TlsError(String);

impl fmt::Display for TlsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for TlsError {}

/// The certificate chain and key `serve` presents, as last read from their files.
pub struct Certificates {
    cert: PathBuf,
    key: PathBuf,
    config: RwLock<Arc<ServerConfig>>,
    /// The file contents behind `config`, so a reload that reads the same bytes changes nothing.
    loaded: Mutex<(Vec<u8>, Vec<u8>)>,
}

impl Certificates {
    pub fn load(cert: &Path, key: &Path) -> Result<Certificates, TlsError> {
        let (cert_pem, key_pem) = read_pair(cert, key)?;
        let config = server_config(&cert_pem, &key_pem)?;
        Ok(Certificates {
            cert: cert.to_path_buf(),
            key: key.to_path_buf(),
            config: RwLock::new(Arc::new(config)),
            loaded: Mutex::new((cert_pem, key_pem)),
        })
    }

    /// Reads both files again and presents the pair from the next handshake on, if it changed; returns whether it
    /// did. A pair that does not load leaves the old one in place.
    pub fn reload(&self) -> Result<bool, TlsError> {
        let (cert_pem, key_pem) = read_pair(&self.cert, &self.key)?;
        let mut loaded = self.loaded.lock().map_err(|error| TlsError(error.to_string()))?;
        if loaded.0 == cert_pem && loaded.1 == key_pem {
            return Ok(false);
        }
        let config = server_config(&cert_pem, &key_pem)?;
        *self.config.write().map_err(|error| TlsError(error.to_string()))? = Arc::new(config);
        *loaded = (cert_pem, key_pem);
        Ok(true)
    }

    fn acceptor(&self) -> Result<TlsAcceptor, TlsError> {
        let config = self.config.read().map_err(|error| TlsError(error.to_string()))?;
        Ok(TlsAcceptor::from(Arc::clone(&config)))
    }
}

fn read_pair(cert: &Path, key: &Path) -> Result<(Vec<u8>, Vec<u8>), TlsError> {
    let read = |path: &Path| std::fs::read(path).map_err(|error| TlsError(format!("{}: {error}", path.display())));
    Ok((read(cert)?, read(key)?))
}

fn server_config(cert_pem: &[u8], key_pem: &[u8]) -> Result<ServerConfig, TlsError> {
    let chain = CertificateDer::pem_slice_iter(cert_pem)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| TlsError(format!("certificate: {error}")))?;
    if chain.is_empty() {
        return Err(TlsError("the certificate file holds no certificate".to_string()));
    }
    let key = PrivateKeyDer::from_pem_slice(key_pem).map_err(|error| TlsError(format!("key: {error}")))?;
    // INVARIANT: the provider is named, never the process default: a binary that links rustls with a second provider,
    // as tests that link reqwest do, has no default.
    let mut config = ServerConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .map_err(|error| TlsError(error.to_string()))?
        .with_no_client_auth()
        .with_single_cert(chain, key)
        .map_err(|error| TlsError(error.to_string()))?;
    // WHY: the server speaks HTTP/1.1 only, so it must never agree to h2.
    config.alpn_protocols = vec![b"http/1.1".to_vec()];
    Ok(config)
}

/// Accepts TCP connections and hands each one on once its TLS handshake completes.
pub struct TlsListener {
    tcp: TcpListener,
    certificates: Arc<Certificates>,
    handshakes: JoinSet<Option<(TlsStream<TcpStream>, SocketAddr)>>,
}

impl TlsListener {
    pub fn new(tcp: TcpListener, certificates: Arc<Certificates>) -> TlsListener {
        TlsListener {
            tcp,
            certificates,
            handshakes: JoinSet::new(),
        }
    }
}

impl Listener for TlsListener {
    type Io = TlsStream<TcpStream>;
    type Addr = SocketAddr;

    async fn accept(&mut self) -> (Self::Io, Self::Addr) {
        loop {
            tokio::select! {
                accepted = self.tcp.accept() => match accepted {
                    Ok((stream, peer)) => match self.certificates.acceptor() {
                        Ok(acceptor) => {
                            // WHY: a failed or stalled handshake ends with its own connection; there is nothing to
                            // report to a client that never finished one.
                            self.handshakes.spawn(async move {
                                match tokio::time::timeout(HANDSHAKE_TIMEOUT, acceptor.accept(stream)).await {
                                    Ok(Ok(tls)) => Some((tls, peer)),
                                    Ok(Err(_)) | Err(_) => None,
                                }
                            });
                        }
                        Err(error) => eprintln!("koloda-server: cannot read the certificates: {error}"),
                    },
                    // WHY: as axum's own listener does, an aborted connection is skipped, and anything else, such as
                    // running out of file descriptors, waits a moment instead of spinning.
                    Err(error) if is_connection_error(&error) => {}
                    Err(error) => {
                        eprintln!("koloda-server: accept failed: {error}");
                        tokio::time::sleep(ACCEPT_RETRY).await;
                    }
                },
                Some(Ok(Some(handshaken))) = self.handshakes.join_next() => return handshaken,
            }
        }
    }

    fn local_addr(&self) -> io::Result<Self::Addr> {
        self.tcp.local_addr()
    }
}

fn is_connection_error(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::ConnectionRefused | io::ErrorKind::ConnectionAborted | io::ErrorKind::ConnectionReset
    )
}
