import pandas as pd
import numpy as np
import os

# Generate a synthetic dataset similar to the Kaggle European Credit Card Fraud dataset
# Columns: Time, V1-V28, Amount, Class

np.random.seed(42)

n_samples = 5000
n_features = 28

# Generate Time
time = np.random.uniform(0, 172792, n_samples)

# Generate V1-V28
v_features = np.random.randn(n_samples, n_features)

# Generate Amount
amount = np.random.exponential(scale=100, size=n_samples)

# Generate Class (highly imbalanced: 1% fraud)
is_fraud = np.random.choice([0, 1], size=n_samples, p=[0.99, 0.01])

# Make the features slightly different for fraud to ensure the model learns something
fraud_indices = np.where(is_fraud == 1)[0]
v_features[fraud_indices, :5] += np.random.normal(loc=2.0, scale=1.0, size=(len(fraud_indices), 5))

# Create DataFrame
columns = ['Time'] + [f'V{i}' for i in range(1, 29)] + ['Amount', 'Class']
data = np.column_stack((time, v_features, amount, is_fraud))
df = pd.DataFrame(data, columns=columns)

df['Class'] = df['Class'].astype(int)

# Ensure directory exists
os.makedirs('dataset', exist_ok=True)

# Save to CSV
df.to_csv('dataset/sample_creditcard.csv', index=False)
print("Synthetic sample data generated and saved to dataset/sample_creditcard.csv")
