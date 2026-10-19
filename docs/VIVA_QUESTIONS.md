# VIVA Questions and Answers

**Q1: What is the primary challenge in Fraud Detection?**
*A1:* The biggest challenge is class imbalance. In a real-world scenario, less than 1% of transactions are fraudulent. If a model predicts "Not Fraud" every time, it will have 99% accuracy but fail completely at its job.

**Q2: How did you handle this class imbalance?**
*A2:* Two ways, compared under cross-validation: class weighting (XGBoost's `scale_pos_weight` = legit/fraud ratio) and SMOTE oversampling. SMOTE is applied *inside* each training fold through an imbalanced-learn pipeline, never before splitting, because oversampling before the split leaks synthetic copies of test frauds into training and inflates results. The variant with the better mean cross-validated PR-AUC goes to production.

**Q3: Why XGBoost?**
*A3:* We didn't assume it: Logistic Regression and Random Forest are trained and cross-validated on the same folds, and all models are scored on the same out-of-time holdout (see the Model & Validation page). Gradient-boosted trees handle non-linear interactions in tabular data well, train fast on 280k rows, and give exact per-decision explanations through TreeSHAP, which the API returns for every transaction.

**Q4: What metrics did you use to evaluate your model?**
*A4:* Accuracy is misleading at a 0.17% fraud rate, so the headline metric is PR-AUC (average precision), with precision, recall and F1 at the operating threshold, 95% bootstrap confidence intervals, calibration (Brier score) and the share of fraud *value* caught. ROC-AUC is reported too, but it looks good even for weak models on imbalanced data.

**Q5: What is the architecture of your system?**
*A5:* It's a decoupled architecture. The frontend is built with React.js for a responsive UI. The backend is FastAPI with async SQLAlchemy (PostgreSQL in production, SQLite locally), split into routes (HTTP only), services (scoring, analytics, evaluation) and an ML layer that only loads and runs the model. The model is trained offline by `ml-model/train.py`, loaded once at startup, and results are pushed to the dashboard over Server-Sent Events.

**Q6: What is JWT and why use it?**
*A6:* JWT stands for JSON Web Token. It is used for securely transmitting information between the client and server as a JSON object. I used it for stateless authentication, meaning the server doesn't need to keep a session store; the token itself contains the user's identity and expiration time.

**Q7: How would you scale this system for millions of transactions per second?**
*A7:* It already has the building blocks: `POST /api/transactions/async` pushes to a Redis Stream consumed by any number of workers in one consumer group (`docker compose up --scale worker=N`), batch scoring is vectorised (thousands of rows per call), and the database uses a connection pool. `scripts/load_test.py` measures throughput and p95 latency. Beyond that: Kafka instead of Redis Streams, several API replicas behind a load balancer, and a feature store for real-time aggregates.

**Q8: How do you know your results aren't inflated?**
*A8:* The holdout is the last 20% of transactions in time and is used exactly once. Scaling and SMOTE are fitted inside training folds only, the threshold is chosen on out-of-fold predictions, duplicates are removed before splitting, and a shuffled-label control must score near the fraud rate (the report shows both numbers side by side; a gap would reveal leakage).

**Q9: How is the decision threshold chosen?**
*A9:* From out-of-fold cross-validation predictions, as the threshold with the best F1 (or the lowest one that reaches a target precision). It's stored in `model_card.json` and can be overridden with `FRAUD_THRESHOLD`. The Model page's threshold tuner shows the precision/recall/alert-volume trade-off at every threshold.

**Q10: How does the model explain a decision?**
*A10:* XGBoost's built-in TreeSHAP gives each feature's exact contribution (in log-odds) to that transaction's score; contributions plus a bias term sum to the model output. The UI shows the top contributions in red (towards fraud) and green (towards legitimate).

**Q11: What happens after an alert?**
*A11:* It lands in the review queue. An analyst opens it, sees the explanation and audit trail, and confirms it as fraud or clears it. Reviews are stored, logged, and used as ground truth for the live precision/recall shown on the dashboard.
