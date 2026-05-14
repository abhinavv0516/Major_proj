# Machine Learning Based Fraud Detection System

This repository contains a full-stack, end-to-end Machine Learning based Fraud Detection System for online financial transactions. It is designed as a final year engineering project, featuring a React (Vite) frontend, a FastAPI backend, and an ML pipeline using Scikit-Learn.

## Project Architecture
- **Frontend:** React.js, Tailwind CSS, Recharts, Vite.
- **Backend:** Python, FastAPI, SQLAlchemy, SQLite (Ready for MySQL).
- **ML Engine:** Python, Scikit-learn, Random Forest, SMOTE.

## Folder Structure
- `dataset/`: Contains scripts to generate the synthetic credit card fraud dataset.
- `ml-model/`: Machine learning pipeline scripts (`train.py`, `evaluate.py`) and saved models.
- `backend/`: FastAPI application, database models, and API endpoints.
- `frontend/`: React Vite application with modern, responsive UI.
- `docs/`: Extensive project documentation for final year submissions.

## Getting Started
Please refer to `docs/INSTALLATION.md` for complete step-by-step instructions on setting up and running the project locally.

## Features
- **Secure Authentication:** JWT-based login/registration.
- **Real-Time Dashboard:** Analytics, fraud percentages, and transaction distributions.
- **ML Predictions:** Integration of Random Forest model to predict fraud probability in real time.
- **Simulations:** Ability to generate and simulate random transactions to observe the system's behavior.
