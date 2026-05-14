# VIVA Questions and Answers

**Q1: What is the primary challenge in Fraud Detection?**
*A1:* The biggest challenge is class imbalance. In a real-world scenario, less than 1% of transactions are fraudulent. If a model predicts "Not Fraud" every time, it will have 99% accuracy but fail completely at its job.

**Q2: How did you handle this class imbalance?**
*A2:* I used SMOTE (Synthetic Minority Over-sampling Technique). Instead of just copying existing minority samples (which can lead to overfitting), SMOTE synthesizes new examples of the minority class by interpolating between existing minority instances.

**Q3: Why did you choose Random Forest over Logistic Regression?**
*A3:* Financial data often has complex, non-linear relationships. Random Forest is an ensemble method that builds multiple decision trees and merges them together. It is robust to overfitting, handles non-linear data well, and generally provides a higher F1-score and Area Under the Precision-Recall Curve compared to linear models like Logistic Regression.

**Q4: What metrics did you use to evaluate your model?**
*A4:* Since accuracy is misleading for imbalanced datasets, I focused on Precision, Recall, and the F1-Score. Recall is especially important here because false negatives (missing a fraudulent transaction) are much costlier than false positives (flagging a legit transaction). I also used the ROC-AUC score.

**Q5: What is the architecture of your system?**
*A5:* It's a decoupled architecture. The frontend is built with React.js for a responsive UI. The backend is built with FastAPI (Python) which serves RESTful APIs and handles the database (SQLite/MySQL via SQLAlchemy). The ML model was trained offline using Scikit-Learn and exported using Joblib, which is then loaded by the FastAPI server to serve real-time predictions.

**Q6: What is JWT and why use it?**
*A6:* JWT stands for JSON Web Token. It is used for securely transmitting information between the client and server as a JSON object. I used it for stateless authentication, meaning the server doesn't need to keep a session store; the token itself contains the user's identity and expiration time.

**Q7: How would you scale this system for millions of transactions per second?**
*A7:* I would introduce a message broker like Apache Kafka or RabbitMQ. The transactions would be pushed to a queue, and multiple worker nodes running the ML model would pull from the queue, evaluate them, and update the database asynchronously to ensure high throughput and low latency.
