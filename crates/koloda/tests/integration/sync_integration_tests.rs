use koloda::repo::sync;
use uuid::Uuid;

use crate::common::test_db;

#[test]
fn enrollment_records_one_device_and_refuses_a_second() {
    let db = test_db();
    assert_eq!(sync::enrolled_device(&db).unwrap(), None);

    let device = Uuid::now_v7();
    sync::enroll_device(&db, device).unwrap();
    assert_eq!(sync::enrolled_device(&db).unwrap(), Some(device));

    let second = sync::enroll_device(&db, Uuid::now_v7());
    assert_eq!(second.unwrap_err().code, "db.add");
    assert_eq!(
        sync::enrolled_device(&db).unwrap(),
        Some(device),
        "a second enrollment must not replace the device"
    );
}
