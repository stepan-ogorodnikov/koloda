use koloda::domain::attachments::{sniff_image_mime, AddAttachmentData, ATTACHMENT_MAX_BYTES};

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

fn ftyp(major: &[u8; 4], compatible: &[&[u8; 4]]) -> Vec<u8> {
    let size = 16 + 4 * compatible.len();
    let mut bytes = (size as u32).to_be_bytes().to_vec();
    bytes.extend_from_slice(b"ftyp");
    bytes.extend_from_slice(major);
    bytes.extend_from_slice(&[0, 0, 0, 0]);
    for brand in compatible {
        bytes.extend_from_slice(*brand);
    }
    bytes
}

fn png_of_len(len: usize) -> Vec<u8> {
    let mut bytes = PNG_SIGNATURE.to_vec();
    bytes.resize(len, 0);
    bytes
}

fn add_data(bytes: Vec<u8>) -> AddAttachmentData {
    AddAttachmentData {
        bytes,
        width: None,
        height: None,
    }
}

#[test]
fn test_sniff_image_mime_by_magic_bytes() {
    let mut avif_brand_past_box = ftyp(b"mif1", &[b"miaf"]);
    avif_brand_past_box.extend_from_slice(b"avif");
    let mut truncated_box = ftyp(b"avif", &[]);
    truncated_box[3] = 64;

    let cases: Vec<(&str, Vec<u8>, Option<&str>)> = vec![
        ("png", png_of_len(16), Some("image/png")),
        ("jpeg", vec![0xff, 0xd8, 0xff, 0xe0], Some("image/jpeg")),
        ("gif87a", b"GIF87a\x01\x00".to_vec(), Some("image/gif")),
        ("gif89a", b"GIF89a\x01\x00".to_vec(), Some("image/gif")),
        ("webp", b"RIFF\x00\x00\x00\x00WEBPVP8 ".to_vec(), Some("image/webp")),
        (
            "avif major brand",
            ftyp(b"avif", &[b"mif1", b"miaf"]),
            Some("image/avif"),
        ),
        (
            "avis compatible brand",
            ftyp(b"mif1", &[b"miaf", b"avis"]),
            Some("image/avif"),
        ),
        ("heic", ftyp(b"heic", &[b"mif1", b"heic"]), None),
        ("avif brand past the ftyp box", avif_brand_past_box, None),
        ("ftyp box longer than the file", truncated_box, None),
        ("riff wave", b"RIFF\x00\x00\x00\x00WAVEfmt ".to_vec(), None),
        ("svg", b"<svg xmlns=\"http://www.w3.org/2000/svg\"/>".to_vec(), None),
        ("png signature cut short", PNG_SIGNATURE[..7].to_vec(), None),
        ("empty", Vec::new(), None),
    ];

    for (name, bytes, expected) in cases {
        assert_eq!(sniff_image_mime(&bytes), expected, "{name}");
    }
}

#[test]
fn test_add_attachment_size_cap() {
    let at_cap = add_data(png_of_len(ATTACHMENT_MAX_BYTES)).validate();
    assert_eq!(at_cap.expect("a cap-sized image must pass"), "image/png");

    let past_cap = add_data(png_of_len(ATTACHMENT_MAX_BYTES + 1)).validate();
    assert_eq!(
        past_cap.expect_err("one byte past the cap must fail").code,
        "validation.attachments.too-large"
    );
}

#[test]
fn test_add_attachment_unknown_format_fails_with_format_code() {
    let error = add_data(b"<svg/>".to_vec()).validate().expect_err("svg must fail");
    assert_eq!(error.code, "validation.attachments.format");
}
