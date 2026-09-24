//! Gateway QC classifier seam tests (Unit 7.2, hand-sim-6n92).
//!
//! Random stub: uniform WHITE/GREEN/BLUE, ~20% `intact == false`.
//! Seeded mock: replays fixed sequence deterministically (used by 7.4 E2E).

use gateway::domain::GearColor;
use gateway::qc_classifier::{
    Classification, QcClassifier, RandomQcClassifier, SeededQcClassifier, enrich_spawn_payload,
};

fn classify_n<C: QcClassifier>(classifier: &mut C, n: usize) -> Vec<Classification> {
    (0..n).map(|_| classifier.classify()).collect()
}

#[test]
fn seeded_mock_replays_fixed_sequence_deterministically() {
    let seq = vec![
        (GearColor::White, true),
        (GearColor::Green, true),
        (GearColor::Blue, false),
    ];
    let mut classifier = SeededQcClassifier::new(seq);
    assert_eq!(
        classify_n(&mut classifier, 7),
        vec![
            (GearColor::White, true),
            (GearColor::Green, true),
            (GearColor::Blue, false),
            (GearColor::White, true),
            (GearColor::Green, true),
            (GearColor::Blue, false),
            (GearColor::White, true),
        ]
    );
}

#[test]
fn same_seed_same_sequence() {
    let a = classify_n(&mut RandomQcClassifier::seeded(7), 100);
    let b = classify_n(&mut RandomQcClassifier::seeded(7), 100);
    assert_eq!(a, b);
}

#[test]
fn random_stub_distributes_colors_evenly() {
    let draws = classify_n(&mut RandomQcClassifier::seeded(42), 3000);
    for color in [GearColor::White, GearColor::Green, GearColor::Blue] {
        let count = draws.iter().filter(|(c, _)| *c == color).count();
        assert!(
            (900..=1100).contains(&count),
            "{color:?} count {count} outside 900..=1100"
        );
    }
}

#[test]
fn random_stub_intact_false_rate_near_20_percent() {
    let draws = classify_n(&mut RandomQcClassifier::seeded(42), 2000);
    let unsound = draws.iter().filter(|(_, intact)| !intact).count();
    assert!(
        (320..=480).contains(&unsound),
        "unsound count {unsound} outside 320..=480 (16-24%)"
    );
}

#[test]
fn enrich_writes_color_and_intact_keys() {
    let blind =
        serde_json::json!({"x": 0.45, "y": -0.1, "z": 0.0, "object_type": "GEAR"});
    let enriched = enrich_spawn_payload(blind, (GearColor::Green, false));
    assert_eq!(
        enriched["color"],
        serde_json::Value::String("GREEN".to_string())
    );
    assert_eq!(enriched["intact"], serde_json::Value::Bool(false));
    assert!((enriched["x"].as_f64().unwrap_or(0.0) - 0.45).abs() < 1e-12);
}
