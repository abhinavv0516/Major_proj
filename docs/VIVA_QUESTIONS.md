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

**Q12: What are your final numbers?**
*A12:* On the out-of-time holdout (56,746 later transactions, 74 fraud), scored once: PR-AUC 0.807 (95% CI 0.72–0.88), ROC-AUC 0.990, precision 0.93, recall 0.74, F1 0.83. That is 55 frauds caught, 19 missed and 4 false alarms, about one alert per 1,000 transactions. Cross-validated PR-AUC was 0.811 ± 0.015, so the holdout agrees with CV.

**Q13: Random Forest has a slightly higher holdout PR-AUC (0.813). Why not use it?**
*A13:* Because the holdout is not allowed to choose the model; if we picked whichever won on the holdout, the holdout would stop being an unbiased test. Selection uses cross-validation, where the tuned XGBoost was best and most stable (0.811 ± 0.015 vs 0.789 ± 0.032). The 0.006 gap on the holdout is well inside the confidence interval (0.72–0.88) with only 74 fraud cases. XGBoost also has much better ROC-AUC (0.990 vs 0.969) and exact TreeSHAP explanations.

**Q14: Why time-series cross-validation instead of stratified k-fold?**
*A14:* We tried both. Stratified CV shuffles time, so the model validates on transactions from before ones it trained on; the model it selected scored 0.757 PR-AUC on the out-of-time holdout. Forward-chaining CV always trains on earlier data and validates on the next block, like deployment, and the model it selected scored 0.807. The CV estimate (0.811) also matched the holdout much better.

**Q15: Why is recall only 74%?**
*A15:* It's a trade-off chosen by the threshold. At 0.70 we get 93% precision; lowering it catches more fraud at the cost of more false alarms (the threshold tuner on the Model page shows the curve). Some frauds look exactly like normal transactions in these 30 anonymised features; in production more features (device, merchant history, velocity) would raise recall. The threshold can be changed with `FRAUD_THRESHOLD` without retraining.

**Q16: Why did SMOTE not help?**
*A16:* XGBoost with class weighting already handles imbalance by up-weighting fraud in the loss. SMOTE adds synthetic frauds interpolated between real ones, which can blur the boundary in a 30-dimensional PCA space and produced more false alarms (precision 0.46 vs 0.64 at 0.5). We report it rather than hide it: a negative result measured correctly is still a result.
