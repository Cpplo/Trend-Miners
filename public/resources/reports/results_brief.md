# TrendMiners — Results brief

Updated 25 November 2026. This is a project results summary, not the final research paper.

## Final update: direct Thai and Google Maps

- Google Maps cleaned export: 6,527 reviews across 496 distinct restaurant names.
- Stars 1 / 2 / 3 / 4 / 5: 348 / 196 / 255 / 617 / 5,111. Three-class labels checked against stars.
- Thai 2,744; mixed Thai/English 506; English 2,950; other/emoji-only 327.
- Direct-Thai Soft-Voting Ensemble: three-class accuracy 72.67%, Macro-F1 0.6393, macro AUC 0.8412. Highest three-class Macro-F1 among four exported models.
- Separate binary ensemble: accuracy 96.39%, Macro-F1 0.8748, ROC AUC 0.9736.
- Google Maps external three-class Thai/mixed subset (3,250): accuracy 87.72%, Macro-F1 0.6296, macro AUC 0.9153.
- English subset (2,950): accuracy 76.64%, Macro-F1 0.5079, macro AUC 0.8124.
- 327 other/emoji-only reviews are outside the two reported external subsets.
- New scores are reported JSON metrics; underlying prediction arrays and training code are not supplied for these evaluations. Exact model identity for external testing, source-training direction, split protocol, collection dates, restaurant URLs, and original Apify dataset URL remain undocumented. Reverse transfer is not reported.
- Binary scores describe a separate task; no claim of a controlled gain over the older translated-English experiment is made.

## Earlier translated-English experiment outputs

- Labeled reviews: 39,993; training: 31,994; test: 7,999.
- Unlabeled reviews: 6,203; no ground-truth accuracy is claimed for their predicted labels.
- Selected artifact: balanced Logistic Regression, F2 unigram + bigram TF-IDF.
- Test accuracy: 55.61%; Macro-F1: 0.4501.
- Training-majority baseline: 63.92% accuracy; 0.2600 Macro-F1.
- Three-class mapping: 1–2 stars Negative; 3 Neutral; 4–5 Positive.

See model_feature_comparison.csv for all nine model-feature runs and imbalance_ablation.csv for the strategy exports. SMOTE also changes the representation to MiniLM, and the threshold-tuning protocol is unverified.

## Data quality

The aggregate audit found no normalized original-text train/test overlap, but 47 cleaned-English texts shared across splits, affecting 348 training and 117 test rows. There are 17 blank cleaned-English training fields and 2 test fields. Saved prediction order matches the supplied test CSV. Translation collapse or common phrases may explain some matching translations; this does not establish the original training procedure.

## Separate exploratory hybrid experiment

A new dependency-free JavaScript implementation was run separately from the supplied outputs. Ordinary LR: 0.562695 accuracy, 0.453735 Macro-F1. LR + K-Means distances: 0.557195 accuracy, 0.448954 Macro-F1. Difference in Macro-F1: -0.004781. No improvement occurred in this single exploratory run.

K=16, seed 42, balanced weights, grouped validation holdout, and 25 SGD epochs were fixed settings. Overlapping/blank training texts and repeated text-label pairs were excluded. Historical test results were already inspected. This is not a reproduction of the missing original notebook, and no convergence or significance claim is made.

## Still required

Original dataset release, acquisition/collection dates, translation provenance, original training notebook and validation settings, Google Maps collection documentation, external evaluation protocol, reverse-direction experiments, final paper and GitHub URL. The proposal's 19,958-row candidate differs from the inspected archive.
