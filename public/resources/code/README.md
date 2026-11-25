# TrendMiners experiment audit and hybrid comparison

This folder supplies a new documented implementation. It does not recover or reproduce the missing original training notebook. Never load the archive's joblib/pickle files to run this experiment.

## Completed locally

`audit_project.py` runs using Python's standard library. It checks rating labels, prediction row order, blank and repeated texts, normalized train/test text overlap, selected LR metrics, and a training-majority baseline. It writes aggregate results without publishing review text.

The completed audit found zero original-text train/test matches, but 47 cleaned-English texts shared across splits (348 training rows and 117 test rows). There are 17 blank training texts and 2 blank test texts. Saved prediction row order matches the test CSV. Majority-class performance is 63.92% accuracy and 0.2600 Macro-F1; selected LR is 55.61% and 0.4501. These are verified calculations on existing predictions, not a new training run.

The local environment lacks NumPy, SciPy, and scikit-learn. The Python hybrid script has been syntax-checked, and dependency-free grouping, labeling, audit, and notebook checks pass. The Python/Colab training implementation has not been executed. The Colab notebook contains no executed output or invented results.

## Completed dependency-free exploratory run

`prepare_local_data.py` and `run_local_hybrid.js` ran locally on the supplied archive. This is a separate new JavaScript implementation, not the scikit-learn notebook and not a reproduction of the original code. It uses weighted multinomial logistic regression with fixed-budget SGD, and full-batch Lloyd K-Means with one seeded k-means++ initialization.

The new run retained 31,561 development rows after removing 17 blank training rows, 348 training rows overlapping test text, and 68 repeated cleaned-text/label pairs. A seeded random holdout of normalized English-text groups produced 25,245 fit rows and 6,316 validation rows. Both arms tried the same three regularization strengths; K=16 and 25 optimizer epochs were fixed in advance. The complete 7,999-row historical test set was retained.

Ordinary LR: accuracy 0.5626953, Macro-F1 0.4537351. LR plus K-Means distances: accuracy 0.5571946, Macro-F1 0.4489544. Difference in Macro-F1: -0.0047806. There was no improvement in this single run. No statistical significance, convergence, optimal K, or platform transfer is claimed. Fixed test results were previously inspected, so this is exploratory.

Saved predictions and complete settings are in `experiments/outputs/local_hybrid/`. Aggregate website downloads are `public/results/exploratory_hybrid.json` and `.csv`. Private working translations under `experiments/work/` must not be uploaded to the public website.

To rerun the dependency-free implementation from the project root with `Latest_Update.zip` present:

```powershell
python experiments/audit_project.py
python experiments/prepare_local_data.py
node experiments/run_local_hybrid.js
```

Python 3.11+ and Node.js are needed for this route. Preserve completed output directories before starting a distinct new run; do not repeatedly tune settings against the historical test set. The downloadable code bundle contains source files only; the input archive and private working reviews are not included.

From the project folder:

```powershell
python experiments/audit_project.py --archive Latest_Update.zip
```

## Hybrid experiment

Install requirements in your Python environment, or use the accompanying Colab notebook:

```powershell
python -m pip install -r experiments/requirements.txt
python experiments/run_hybrid.py --archive Latest_Update.zip
```

The script compares ordinary TF-IDF + LR and TF-IDF + K-Means distances + LR. Both arms use balanced weights and three validation trials for the same C values. K=16 is prespecified, not selected using test outcomes. Alternative K values must be planned before inspecting corresponding test scores; do not repeatedly choose K from final test performance.

The script removes blank training texts, training texts overlapping any evaluation text, and repeated cleaned-text/label pairs. Original/translated text groups remain together in the validation split. Contradictory-label translation groups are retained within one split rather than assigned invented labels. The full test set, including two blank-text rows in the supplied archive, is retained and counted.

TF-IDF, K-Means and distance scaling are fitted on the training portion for validation. After selecting C from validation Macro-F1, they are refitted on the development data and applied once to the test data. Predictions, complete metrics, selected settings, versions, input checksum, and split indices are exported. Convergence failures stop the experiment.

This is an exploratory rerun because the supplied test outcomes were already inspected. Arrange a new untouched holdout or nested evaluation for stronger final evidence. Repeated English translations may reflect translation collapse, common short phrases, or duplicated source material; overlap alone does not establish why it occurred.

Outputs appear in `experiments/outputs/hybrid_rerun/`. Existing completed runs cannot be overwritten; select a new `--output` directory for another prespecified run. A completed run exports `experiment.json`, `metrics.csv`, and prediction arrays. Do not rename these as verified website findings before reviewing them.

## Cross-platform extension

First obtain genuine source/target records and collection information. The unlabeled 6,203 reviews cannot provide accuracy without independently obtained ground truth. Do not use model predictions as evaluation labels.

A labeled target CSV needs `review_body`, `review_clean_en`, and `star_rating` columns. Use the same documented translation/cleaning process for both platforms. Ratings are sentiment proxies, not human sentiment annotations. The target is never used for fitting, C selection, or threshold tuning; matching source-training texts are excluded.

```powershell
python experiments/run_hybrid.py --archive Latest_Update.zip --target-csv google_maps_labeled.csv --target-name "Google Maps Thailand" --output experiments/outputs/wongnai_to_google
```

For the reverse direction, provide separate Google Maps training/test CSVs and a Wongnai target CSV. Reserve these splits before modeling:

```powershell
python experiments/run_hybrid.py --train-csv google_train.csv --test-csv google_test.csv --source-name "Google Maps Thailand" --target-csv wongnai_target.csv --target-name "Wongnai" --output experiments/outputs/google_to_wongnai
```

Final sources, collection dates, language filters, source revision, translation engine/version, class distributions, and sample-size controls must be documented. No Google Maps source or new transfer result is supplied by this package.

## Implementation references

- https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html
- https://scikit-learn.org/stable/modules/generated/sklearn.feature_extraction.text.TfidfVectorizer.html
- https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.StratifiedGroupKFold.html
