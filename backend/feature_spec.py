"""
Feature contract shared by the API layer (schemas.py) and the ML layer (ml_service.py).

Kept in its own tiny module so the API never imports ML code just to know
the column names, and the ML code never imports Pydantic schemas.

Order matters: it must match the column order the scaler and model were fitted on
(see ml-model/train.py -> dataset/sample_creditcard.csv minus 'Class').
"""

FEATURE_COLUMNS: list[str] = ["Time", *[f"V{i}" for i in range(1, 29)], "Amount"]
