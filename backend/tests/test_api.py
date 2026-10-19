"""
End-to-end API test: startup (DB + demo user + model), login, scoring, storage, simulation,
review, analytics and the live-event broker — against a temporary SQLite database.
"""
import asyncio

import httpx

from backend.main import app
from backend.services.events import broker

SAMPLE = None  # filled from /api/predict/sample


def run(coro):
    return asyncio.run(coro)


async def _flow():
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            # health + auth
            health = (await c.get("/api/health")).json()
            assert health["model"]["loaded"], health

            assert (await c.get("/api/transactions/")).status_code == 401
            r = await c.post("/api/auth/login", data={"username": "demo@fraudx.dev", "password": "demo1234"})
            assert r.status_code == 200, r.text
            c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"

            # stateless scoring
            sample = (await c.get("/api/predict/sample", params={"label": "fraud"})).json()
            assert set(sample) >= {"time", "v1", "v28", "amount"}
            pred = (await c.post("/api/predict", json=sample)).json()
            assert 0 <= pred["fraud_probability"] <= 1 and len(pred["top_features"]) == 5
            bad = await c.post("/api/predict", json={**sample, "amount": -1})
            assert bad.status_code == 422

            batch = (await c.post("/api/predict/batch", json={"transactions": [sample] * 50})).json()
            assert batch["count"] == 50 and len(batch["results"]) == 50

            # store + score, and the live feed receives it
            async with broker.subscribe() as queue:
                created = await c.post("/api/transactions/", json=sample)
                assert created.status_code == 201, created.text
                tx = created.json()
                event = await asyncio.wait_for(queue.get(), timeout=5)
                assert event["id"] == tx["id"]
            assert tx["status"] == "scored" and tx["shap_values"] and tx["features"]["Amount"] == sample["amount"]

            # simulation from the held-out set keeps true labels
            sim = (await c.post("/api/transactions/simulate", json={"count": 12, "fraud_ratio": 0.5})).json()
            assert sim["created"] == 12
            assert all(t["ground_truth"] in (0, 1) and t["outcome"] for t in sim["transactions"])

            # analyst review
            reviewed = (await c.post(f"/api/transactions/{tx['id']}/review",
                                     json={"label": "fraud", "notes": "confirmed with cardholder"})).json()
            assert reviewed["review_status"] == "fraud"
            assert [a["action"] for a in reviewed["audit_trail"]] == ["created", "scored", "reviewed"]

            listing = (await c.get("/api/transactions/")).json()
            assert len(listing) == 13 and listing[0]["id"] > listing[-1]["id"]

            # analytics
            summary = (await c.get("/api/analytics/")).json()
            assert summary["total_transactions"] == 13
            assert summary["live_performance"]["labelled"] == 13  # 12 simulated + 1 reviewed
            series = (await c.get("/api/analytics/timeseries", params={"bucket": "minute", "points": 5})).json()
            assert len(series) == 5 and sum(p["total"] for p in series) == 13
            assert (await c.get("/api/analytics/drivers")).status_code == 200
            curve = (await c.get("/api/analytics/threshold-curve")).json()
            assert len(curve["points"]) == 19
            assert (await c.get("/api/analytics/metrics")).status_code == 200

            # reset
            assert (await c.delete("/api/transactions/")).status_code == 400
            assert (await c.delete("/api/transactions/", params={"confirm": True})).status_code == 204
            assert (await c.get("/api/transactions/")).json() == []


def test_full_api_flow():
    run(_flow())
