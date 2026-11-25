# TrendMiners — Results brief

Updated 25 November 2026. This is a project results summary, not the final research paper.

## Supplied experiment outputs

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

Original dataset release, acquisition/collection dates, translation provenance, original training notebook and validation settings, confirmed Google Maps ground truth, cross-platform experiments, final paper and GitHub URL. The proposal's 19,958-row candidate differs from the inspected archive.
