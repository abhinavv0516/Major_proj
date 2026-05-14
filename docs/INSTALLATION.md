# Installation Guide

Follow these steps to run the Fraud Detection System locally.

## Prerequisites
- Python 3.9+
- Node.js 18+
- Git

## 1. Clone the Repository
```bash
git clone https://github.com/abhinavv0516/Major_proj.git
cd Major_proj
```

## 2. Setup Python Environment (Backend & ML)
```bash
# Create virtual environment
python -m venv venv

# Activate it (Windows)
.\venv\Scripts\activate

# Install ML dependencies
pip install -r ml-model/requirements.txt

# Install Backend dependencies
pip install -r backend/requirements.txt
```

## 3. Run the ML Pipeline
```bash
# Generate the synthetic dataset
python dataset/generate_sample_data.py

# Train the models and save the Random Forest model
python ml-model/train.py
```

## 4. Run the Backend Server
```bash
# Start the FastAPI server on port 8000
uvicorn backend.main:app --reload
```
The API documentation will be available at `http://localhost:8000/docs`.

## 5. Setup & Run the Frontend
Open a new terminal window:
```bash
cd frontend

# Install Node dependencies
npm install

# Start the Vite development server
npm run dev
```

The frontend will be available at `http://localhost:5173`.
