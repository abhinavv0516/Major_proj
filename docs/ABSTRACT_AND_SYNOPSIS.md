# Abstract

The rapid digitization of financial services has led to a massive surge in online transactions, concurrently giving rise to sophisticated credit card fraud. Detecting these fraudulent transactions in real-time is a critical challenge due to the extreme class imbalance in financial datasets, where fraudulent transactions represent a minute fraction of the overall volume. This project presents a robust, end-to-end Machine Learning based Fraud Detection System designed to address these challenges. The system employs the Synthetic Minority Over-sampling Technique (SMOTE) to effectively balance the dataset, followed by the application of an optimized Random Forest classifier to accurately distinguish between legitimate and fraudulent transactions. To demonstrate real-world applicability, the trained model is integrated into a modern web application featuring a high-performance FastAPI backend and a responsive React.js frontend. The resulting system not only processes and predicts transaction legitimacy with minimal latency but also provides an interactive dashboard for financial analysts to monitor real-time analytics, model performance metrics, and transaction logs. 

# Synopsis

## 1. Introduction
With the exponential growth of e-commerce, credit card fraud causes billions of dollars in losses annually. Traditional rule-based fraud detection systems are increasingly ineffective against evolving fraudulent patterns. Machine learning offers a dynamic approach to learn and identify these patterns from historical transaction data.

## 2. Objective
To develop a highly accurate, real-time machine learning system capable of detecting fraudulent online transactions, while addressing the inherent problem of class imbalance, and to deploy this model via a full-stack web application for practical monitoring.

## 3. Methodology
- **Data Preprocessing:** Standard scaling of 'Time' and 'Amount' features from the Kaggle European Credit Card dataset.
- **Handling Imbalance:** Implementation of SMOTE to synthesize minority class (fraud) instances, creating a balanced training environment.
- **Model Training:** Comparative analysis of Logistic Regression, Decision Tree, and Random Forest. Random Forest is selected for its superior Precision-Recall trade-off and F1-score.
- **System Deployment:** Development of REST APIs using FastAPI to serve the model. Construction of a React.js dashboard utilizing Tailwind CSS and Recharts for intuitive data visualization and transaction simulation.

## 4. Key Features
- High-accuracy ML prediction engine.
- Secure, role-based JWT authentication.
- Real-time simulation and classification of transactions.
- Interactive, graphical dashboard displaying ROC-AUC, F1-scores, and live transaction statistics.

## 5. Conclusion
The project successfully bridges the gap between theoretical machine learning models and practical software engineering, resulting in a production-ready prototype that efficiently mitigates the risk of online financial fraud.
