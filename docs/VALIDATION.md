# Validation Methodology

How we show that the detector actually works, and that the numbers are not inflated.
All of this is produced by `python ml-model/train.py` and shown on the app's
**Model & Validation** page (`GET /api/analytics/validation`).

## 1. Data

**ULB Credit Card Fraud Detection dataset** (Machine Learning Group, Université Libre de Bruxelles,
with Worldline): 284,807 card transactions by European cardholders over two days in September
2013, of which 492 (0.172%) are fraud. Features: `Time` (seconds from the first transaction),
`Amount`, and `V1`–`V28` (PCA components; the original card features are confidential).
It is the most widely used public benchmark for card-fraud detection, which makes our results
comparable with published work. Get it with `python dataset/download_creditcard.py`
(OpenML dataset 1597, or Kaggle `mlg-ulb/creditcardfraud`).

Cleaning: exact duplicate rows are removed before splitting (the raw file contains about a
thousand), otherwise identical rows could land in both training and test sets.

The synthetic `sample_creditcard.csv` is for development only; the app shows a warning when
the loaded model was trained on it.

## 2. Protocol

| Step | What we do | Why |
|---|---|---|
| Holdout | Last 20% of transactions by `Time` are held out (**out-of-time**) | Fraud models are deployed on future traffic; a random split lets the model see the "future" |
| Model selection | 5-fold stratified cross-validation on the training part only | Mean ± std across folds shows stability, not one lucky split |
| Preprocessing | `StandardScaler` and SMOTE live **inside** each fold's pipeline | Resampling or scaling before splitting leaks test information — the most common flaw in published fraud papers |
| Baselines | Logistic Regression and Random Forest vs. XGBoost (class weights) and XGBoost + SMOTE | Shows the chosen model is better than simpler alternatives, not just "good" |
| Threshold | Chosen on **out-of-fold** predictions (best F1, or the lowest threshold meeting a target precision) | Tuning the threshold on the test set would inflate test precision/recall |
| Final test | Production model refit on the full training part, scored **once** on the holdout | The holdout is never used for any decision |

## 3. What is reported

- **PR-AUC (average precision)** — headline metric. With 0.17% fraud, a model that flags nothing
  has 99.8% accuracy, and ROC-AUC looks excellent for weak models; PR-AUC does not.
- **Precision, recall, F1 at the operating threshold**, plus the confusion matrix.
- **95% bootstrap confidence intervals** (1,000 resamples of the holdout) for PR-AUC, ROC-AUC,
  precision, recall and F1. With only ~100 fraud cases in the holdout, intervals matter.
- **Calibration** (reliability curve + Brier score): whether "80% fraud probability" means 80%.
- **Business view**: share of fraud *value* caught vs. missed, false alarms, alerts per 1,000 transactions.
- **Every candidate on the holdout**, so the CV ranking can be checked out-of-time.
- **Sanity checks**: 0 identical rows across splits; the same pipeline trained on *shuffled*
  labels must score a PR-AUC close to the fraud rate. If it scores higher, something leaks.
- **Global explanation**: mean |SHAP| per feature on the holdout.

## 4. Validation in the running system

- **Threshold tuner** — precision, recall and alert volume at every threshold on the holdout.
- **Simulation** replays held-out transactions with their true labels, so the dashboard shows
  live precision/recall/accuracy computed from real outcomes (caught / missed / false alarm).
- **Analyst reviews** add more labels over time (feedback loop), feeding the same live metrics.
- **Batch CSV upload** with a `Class` column reports precision and recall on any labelled file.
- **Per-decision explanations** (TreeSHAP) let a reviewer check *why* each alert was raised.

## 5. Reproduce

```bash
python dataset/download_creditcard.py
python ml-model/train.py                        # writes ml-model/validation_report.json
python ml-model/evaluate.py                     # re-scores the saved holdout
python ml-model/evaluate.py --data other.csv    # any labelled file with the same columns
```
Runs are seeded (`--seed`, default 42) and logged to MLflow when it is installed.

## References

1. A. Dal Pozzolo, O. Caelen, R. A. Johnson, G. Bontempi. *Calibrating Probability with
   Undersampling for Unbalanced Classification.* IEEE Symposium on Computational Intelligence
   and Data Mining (CIDM), 2015. — dataset.
2. *Data Leakage and Deceptive Performance: A Critical Examination of Credit Card Fraud
   Detection Methodologies.* arXiv:2506.02703, 2025. — leakage from resampling before splitting,
   lack of temporal validation.
3. T. Saito, M. Rehmsmeier. *The Precision-Recall Plot Is More Informative than the ROC Plot When
   Evaluating Binary Classifiers on Imbalanced Datasets.* PLoS ONE, 2015.
4. T. Chen, C. Guestrin. *XGBoost: A Scalable Tree Boosting System.* KDD, 2016.
5. N. V. Chawla et al. *SMOTE: Synthetic Minority Over-sampling Technique.* JAIR, 2002.
6. S. M. Lundberg, S.-I. Lee. *A Unified Approach to Interpreting Model Predictions.* NeurIPS, 2017;
   S. M. Lundberg et al. *From local explanations to global understanding with explainable AI for
   trees.* Nature Machine Intelligence, 2020. — SHAP / TreeSHAP.
