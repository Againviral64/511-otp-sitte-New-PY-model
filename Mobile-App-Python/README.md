# Mobile-App-Python Backend

Live Python FastAPI Backend for the **OTP Mobile Admin App**, connected to Supabase live database.

## Folder Structure

```
Mobile-App-Python/
├── .env                  # Supabase URL & Keys configuration
├── config.py             # App environment variables loader
├── database.py           # Async Supabase REST API client
├── main.py               # FastAPI server endpoints
├── schemas.py            # Pydantic request/response models
└── requirements.txt      # Python dependencies
```

## How to Run

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Start Python FastAPI Server**:
   ```bash
   python main.py
   ```
   Or using Uvicorn directly:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. **Interactive API Documentation (Swagger)**:
   Open [http://localhost:8000/docs](http://localhost:8000/docs) in your browser.

## Connected Live Supabase Tables

- `profiles` (User accounts, balances, roles, status)
- `orders` (Live orders audit log, status, SMS details, pricing)
- `deposits` (Deposit requests, payment methods, proofs)
- `services` (Wholesale services, cost & sell pricing)
- `tickets` & `ticket_messages` (Customer support chat)
