"""
Load test for the scoring API: latency percentiles and throughput.

    python scripts/load_test.py                          # 500 requests, 20 concurrent
    python scripts/load_test.py -n 2000 -c 50
    python scripts/load_test.py --batch-size 1000        # also time the batch endpoint
    python scripts/load_test.py --url http://localhost:8000/api --email you@x.com --password ...

Needs the API running and `pip install httpx`. Logs in with the demo account by default.
"""
import argparse
import asyncio
import statistics
import time

import httpx


def pct(values, p):
    if not values:
        return float("nan")
    values = sorted(values)
    k = (len(values) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (k - lo)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000/api")
    ap.add_argument("--email", default="demo@fraudx.dev")
    ap.add_argument("--password", default="demo1234")
    ap.add_argument("-n", "--requests", type=int, default=500)
    ap.add_argument("-c", "--concurrency", type=int, default=20)
    ap.add_argument("--no-explain", action="store_true", help="skip SHAP in single predictions")
    ap.add_argument("--batch-size", type=int, default=0, help="also test /predict/batch with this many rows")
    args = ap.parse_args()

    async with httpx.AsyncClient(base_url=args.url, timeout=60) as client:
        r = await client.post("/auth/login", data={"username": args.email, "password": args.password})
        r.raise_for_status()
        client.headers["Authorization"] = f"Bearer {r.json()['access_token']}"

        samples = [(await client.get("/predict/sample", params={"label": lbl})).json()
                   for lbl in ("legit", "fraud", "legit", "legit")]

        latencies: list[float] = []
        errors = 0
        sem = asyncio.Semaphore(args.concurrency)

        async def one(i: int) -> None:
            nonlocal errors
            async with sem:
                t0 = time.perf_counter()
                try:
                    resp = await client.post("/predict", json=samples[i % len(samples)],
                                             params={"explain": not args.no_explain})
                    resp.raise_for_status()
                    latencies.append((time.perf_counter() - t0) * 1000)
                except httpx.HTTPError:
                    errors += 1

        print(f"POST /predict  x{args.requests}, concurrency {args.concurrency} ...")
        t0 = time.perf_counter()
        await asyncio.gather(*(one(i) for i in range(args.requests)))
        wall = time.perf_counter() - t0

        print(f"  throughput : {len(latencies) / wall:,.1f} req/s   ({wall:.2f}s total, {errors} errors)")
        print(f"  latency ms : p50 {pct(latencies, 50):.1f}   p95 {pct(latencies, 95):.1f}   "
              f"p99 {pct(latencies, 99):.1f}   mean {statistics.mean(latencies) if latencies else float('nan'):.1f}")

        if args.batch_size:
            rows = [samples[i % len(samples)] for i in range(args.batch_size)]
            t0 = time.perf_counter()
            resp = await client.post("/predict/batch", json={"transactions": rows})
            resp.raise_for_status()
            body = resp.json()
            print(f"POST /predict/batch  {args.batch_size} rows: {(time.perf_counter() - t0) * 1000:.0f} ms round trip, "
                  f"model time {body['elapsed_ms']:.0f} ms ({body['throughput_per_second']:,.0f} rows/s)")


if __name__ == "__main__":
    asyncio.run(main())
