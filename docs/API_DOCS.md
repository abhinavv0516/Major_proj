# API Documentation

The backend exposes RESTful APIs documented automatically via Swagger.
When the FastAPI server is running, navigate to `http://localhost:8000/docs`.

## Base URL
`/api`

## Endpoints

### Auth
- `POST /auth/register`: Register a new user.
- `POST /auth/login`: Authenticate and receive a JWT Bearer token.
- `GET /auth/me`: Get the current authenticated user details.

### Transactions
- `GET /transactions/`: Retrieve a list of transactions (supports pagination via `skip` and `limit`).
- `POST /transactions/`: Submit a new transaction. The API will pass it through the ML model, predict fraud probability, save it to the DB, and return the result.
- `POST /transactions/predict`: Evaluate a transaction without saving it to the database.

### Analytics
- `GET /analytics/`: Retrieve total numbers, legitimate vs. fraudulent counts, and fraud percentage.
- `GET /analytics/metrics`: Retrieve the ML model's evaluation metrics (Accuracy, Precision, Recall, F1, ROC-AUC) saved during training.
