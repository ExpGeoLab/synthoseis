"""Quick diagnostic script to check API health."""

import requests
import sys

BASE_URL = "http://localhost:8000"

endpoints = [
    "/api/dashboard",
    "/api/runs",
    "/api/datasets",
    "/api/system/settings",
]

print("=" * 60)
print("API Health Check")
print("=" * 60)

all_ok = True

for endpoint in endpoints:
    url = f"{BASE_URL}{endpoint}"
    try:
        response = requests.get(url, timeout=5)
        content_type = response.headers.get("content-type", "unknown")

        if response.status_code == 200 and "application/json" in content_type:
            print(f"[OK] {endpoint:30} (JSON)")
        elif "text/html" in content_type:
            print(f"[FAIL] {endpoint:30} (Returned HTML)")
            all_ok = False
        else:
            print(f"[?] {endpoint:30} ({content_type})")
            all_ok = False
    except requests.exceptions.ConnectionError:
        print(f"[FAIL] {endpoint:30} (Server not running)")
        all_ok = False
    except Exception as e:
        print(f"[FAIL] {endpoint:30} ({e})")
        all_ok = False

print("=" * 60)

if all_ok:
    print("[OK] All endpoints are working correctly!")
    print("\nIf the frontend still shows errors:")
    print("1. Check browser DevTools Network tab")
    print("2. Look for failed requests")
    print("3. Check the Vite proxy configuration")
else:
    print("[FAIL] Some endpoints are not working")
    print("\nTroubleshooting steps:")
    print("1. Make sure the backend server is running:")
    print("   python -m server.main")
    print("2. Check the server console for errors")
    print("3. Restart the server if needed")
    sys.exit(1)
