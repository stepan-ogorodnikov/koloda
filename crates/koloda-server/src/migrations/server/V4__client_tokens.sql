-- WHY: enrollment tokens are minted by the client. The server stores only the hash, and a retry proves it by
-- sending the token again. Creation rows live 10 minutes, so dropping them loses nothing a client can still redeem
-- (crates/koloda-sync-proto/PROTOCOL.md, Devices).

DROP TABLE space_creations;

CREATE TABLE space_creations (
    nonce blob PRIMARY KEY,
    space_id blob NOT NULL,
    device_id blob NOT NULL,
    token_hash blob NOT NULL,
    epoch blob NOT NULL,
    expires_at integer NOT NULL
);

ALTER TABLE pairings DROP COLUMN claim_token;
