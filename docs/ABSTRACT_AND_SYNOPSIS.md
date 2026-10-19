# Abstract

The rapid digitization of financial services has led to a surge in online card transactions and, with it, in card fraud. Detecting fraud in real time is hard because fraudulent transactions are an extremely small fraction of all traffic (0.17% in the benchmark used here), which makes accuracy a misleading measure and makes it easy to report inflated results. This project presents FraudX, an end-to-end fraud detection platform built and validated on the public ULB credit-card dataset of 284,807 European card transactions. A gradient-boosted tree model (XGBoost) is selected against Logistic Regression and Random Forest baselines using leak-free forward-chaining time-series cross-validation, in which scaling and SMOTE oversampling are fitted only inside training folds, tuned over a small hyper-parameter grid, and then evaluated once on an out-of-time holdout of later transactions. On that holdout the model reaches a PR-AUC of 0.807 (95% CI 0.72–0.88), precision 0.93 and recall 0.74, with 4 false alarms among 56,672 legitimate transactions. Results are reported as precision-recall AUC, precision and recall at an operating threshold chosen on out-of-fold predictions, bootstrap confidence intervals, calibration, and the share of fraud value caught, together with a shuffled-label check for data leakage. The model is served by an asynchronous FastAPI backend that scores, explains (TreeSHAP) and stores every transaction, streams results live to a React dashboard, supports batch scoring and a Redis-based worker queue for scale, and closes the loop with analyst reviews whose labels feed live precision and recall monitoring.

# Synopsis

## 1. Introduction
With the exponential growth of e-commerce, credit card fraud causes billions of dollars in losses annually. Traditional rule-based fraud detection systems are increasingly ineffective against evolving fraudulent patterns. Machine learning offers a dynamic approach to learn and identify these patterns from historical transaction data.

## 2. Objective
To develop a highly accurate, real-time machine learning system capable of detecting fraudulent online transactions, while addressing the inherent problem of class imbalance, and to deploy this model via a full-stack web application for practical monitoring.

## 3. Methodology
- **Data Preprocessing:** Standard scaling of 'Time' and 'Amount' features from the Kaggle European Credit Card dataset.
- **Handling Imbalance:** Implementation of SMOTE to synthesize minority class (fraud) instances, creating a balanced training environment.
- **Model Training:** Comparative analysis of Logistic Regression, Random Forest, XGBoost with class weights, XGBoost with SMOTE and a tuned XGBoost under time-series cross-validation. The tuned XGBoost is selected for the best and most stable cross-validated PR-AUC (0.811 ± 0.015).
- **System Deployment:** Development of REST APIs using FastAPI to serve the model. Construction of a React.js dashboard utilizing Tailwind CSS and Recharts for intuitive data visualization and transaction simulation.

## 4. Key Features
- High-accuracy ML prediction engine.
- Secure, role-based JWT authentication.
- Real-time simulation and classification of transactions.
- Interactive, graphical dashboard displaying ROC-AUC, F1-scores, and live transaction statistics.

## 5. Conclusion
The project successfully bridges the gap between theoretical machine learning models and practical software engineering, resulting in a production-ready prototype that efficiently mitigates the risk of online financial fraud.
