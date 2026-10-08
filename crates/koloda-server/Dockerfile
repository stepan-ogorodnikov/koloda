# The sync server as a static binary in a distroless image, running as a user that is not root.
# Build from the repository root: docker build -f crates/koloda-server/Dockerfile -t koloda-server .

# INVARIANT: the tag matches `rust-toolchain.toml`, which stays out of the context so rustup installs nothing here.
FROM rust:1.98.1-alpine AS build
RUN apk add --no-cache gcc musl-dev
WORKDIR /src
COPY . .
# WHY: on Alpine, Rust targets musl and links statically, so the binary needs no libc in the final image.
RUN cargo build --release --locked -p koloda-server \
    && cp target/release/koloda-server /koloda-server
# WHY: Docker gives a new named volume the owner of the directory it mounts over, and the final image has no shell to
# create one, so the data directory is made here, owned by distroless's `nonroot` user.
RUN mkdir /data && chown 65532:65532 /data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /koloda-server /usr/local/bin/koloda-server
COPY --from=build --chown=65532:65532 /data /data
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/koloda-server"]
# Plain HTTP for a TLS proxy on the same network, as `deploy/compose.example.yaml` puts Caddy in front.
CMD ["serve", "--data-dir", "/data", "--insecure-http", "--listen", "0.0.0.0:8080"]
