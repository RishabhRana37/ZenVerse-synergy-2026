import json
import uuid
import random
from pathlib import Path
from datetime import datetime, timedelta, timezone

def generate_db_cascade():
    # Setup paths
    out_dir = Path(__file__).parent.parent / "data" / "samples"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "db-cascade.jsonl"
    
    start_time = datetime.now(timezone.utc)
    alerts = []
    
    def add_alert(service, msg, sev, delay_sec):
        alerts.append({
            "id": str(uuid.uuid4()),
            "service": service,
            "message": msg,
            "severity": sev,
            "timestamp": (start_time + timedelta(seconds=delay_sec)).isoformat()
        })

    # The scenario: Redis cache fails -> Auth service gets overloaded -> Order service fails
    
    # Background noise
    for i in range(10):
        add_alert(random.choice(["payment-svc", "user-svc"]), "Normal background latency spike", "info", i * 2)

    # 1. Redis goes down
    add_alert("redis-cache", "Connection refused: port 6379", "critical", 15)
    add_alert("redis-cache", "Memory usage exceeded 99%", "warning", 16)
    
    for i in range(5):
        add_alert("redis-cache", "Connection refused: port 6379", "critical", 16 + i)

    # 2. Auth service starts failing because it can't reach Redis
    add_alert("auth-svc", "Redis timeout waiting for connection", "error", 20)
    add_alert("auth-svc", "Failed to validate JWT token", "error", 22)
    add_alert("auth-svc", "High error rate (5xx > 10%)", "critical", 25)
    
    for i in range(15):
        add_alert("auth-svc", f"Failed to validate JWT token (trace_id={uuid.uuid4().hex[:8]})", "error", 25 + i * 0.5)

    # 3. Order service fails because Auth is down
    add_alert("order-svc", "Unauthorized: Auth service returned 503", "error", 30)
    add_alert("order-svc", "Checkout failed: internal server error", "critical", 32)
    
    for i in range(20):
        add_alert("order-svc", "Unauthorized: Auth service returned 503", "error", 32 + i * 0.5)
        
    # Sort chronologically just in case
    alerts.sort(key=lambda x: x["timestamp"])

    with open(out_path, "w") as f:
        for a in alerts:
            f.write(json.dumps(a) + "\n")
            
    print(f"Generated {len(alerts)} synthetic alerts at {out_path}")

if __name__ == "__main__":
    generate_db_cascade()
