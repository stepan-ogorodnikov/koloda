use koloda::app::error::error_codes;
use koloda::repo::optimizer::get_optimization_input;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template, insert_review_row};
use crate::common::{fsrs_algorithm_content, test_db};

#[test]
fn input_reads_saved_parameters_and_unignored_reviews_of_the_algorithms_decks() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "Optimized");
    let other_algorithm_id = add_algorithm(&db, "Other");
    let template_id = add_template(&db, "Basic");
    let first_deck = add_deck(&db, &algorithm_id, &template_id, "First");
    let second_deck = add_deck(&db, &algorithm_id, &template_id, "Second");
    let other_deck = add_deck(&db, &other_algorithm_id, &template_id, "Other");
    let first_card = add_card(&db, &first_deck, &template_id, "one");
    let second_card = add_card(&db, &second_deck, &template_id, "two");
    let other_card = add_card(&db, &other_deck, &template_id, "three");

    insert_review_row(&db, &first_card, 0, 0, 1_000);
    insert_review_row(&db, &first_card, 1, 1, 2_000);
    insert_review_row(&db, &second_card, 0, 0, 3_000);
    insert_review_row(&db, &other_card, 0, 0, 4_000);

    let input = get_optimization_input(&db, &algorithm_id).expect("input should load");

    assert_eq!(input.content, fsrs_algorithm_content());
    let mut read: Vec<(String, i32, i64)> = input
        .reviews
        .into_iter()
        .map(|review| (review.card_id, review.state, review.created_at))
        .collect();
    read.sort_by_key(|(_, _, created_at)| *created_at);
    assert_eq!(
        read,
        vec![(first_card, 0, 1_000), (second_card, 0, 3_000)],
        "ignored and other decks' reviews stay out"
    );
}

#[test]
fn input_for_a_missing_algorithm_is_not_found() {
    let db = test_db();

    let error = get_optimization_input(&db, "missing").expect_err("a missing algorithm has no input");

    assert_eq!(error.code, error_codes::NOT_FOUND_ALGORITHMS_OPTIMIZE_ALGORITHM);
}
