import asyncio
import re
import time
from datetime import datetime, timezone
import aiohttp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import os
from dotenv import load_dotenv
from contextlib import asynccontextmanager

# Load local .env if it exists
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
API_BASE = os.environ.get("API_BASE", "https://555api.com/")
API_TOKEN = os.environ.get("API_TOKEN")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

# Global aiohttp session and cache to avoid socket exhaustion and request storms
global_session: aiohttp.ClientSession = None
sms_check_cache = {}  # {order_id: (timestamp, msg_text, otp)}
CACHE_TTL_SECONDS = 2  # Cache external sms checks for 2 seconds per order

@asynccontextmanager
async def lifespan(app: FastAPI):
    global global_session
    connector = aiohttp.TCPConnector(limit=200, ttl_dns_cache=300, ssl=False)
    timeout = aiohttp.ClientTimeout(total=6, connect=3)
    global_session = aiohttp.ClientSession(connector=connector, timeout=timeout)
    print("[Live API] Global HTTP Session initialized.")
    yield
    if global_session and not global_session.closed:
        await global_session.close()
        print("[Live API] Global HTTP Session closed.")

app = FastAPI(
    title="Live OTP Fetcher API",
    description="On-Demand live OTP fetching service",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend tracking page access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def parse_otp(text: str) -> str:
    """Extracts a 4 to 8 digit OTP code from text."""
    if not text:
        return None
    
    # Strip trailing YYYY-MM-DD date if present to prevent false positive matching on the year
    text_clean = re.sub(r'\|\d{4}-\d{2}-\d{2}$', '', text.strip())
    
    # Try parsing pipe-separated first if it's sms_url format e.g. "13694|https://..."
    parts = text_clean.split('|')
    if len(parts) > 1 and re.match(r'^\d{4,8}$', parts[0].strip()):
        return parts[0].strip()
    
    match = re.search(r'\b\d{4,8}\b', text_clean)
    return match.group(0) if match else None

def is_valid_sms(text: str) -> bool:
    """Checks if the response content is a valid SMS instead of a Cloudflare block or HTML error."""
    if not text:
        return False
    low = text.lower()
    invalid_keywords = [
        "no message", "no sms", "<!doctype", "<html", 
        "cloudflare", "just a moment", "security check"
    ]
    return not any(kw in low for kw in invalid_keywords)

async def check_sms_url(sms_url: str) -> tuple:
    """Fetches direct sms_url and attempts to find OTP."""
    if not sms_url:
        return None, None
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        session = global_session or aiohttp.ClientSession()
        async with session.get(sms_url, headers=headers, timeout=aiohttp.ClientTimeout(total=5, connect=2.5)) as resp:
            if resp.status == 200:
                text = await resp.text()
                if text:
                    text = re.sub(r'\|\d{4}-\d{2}-\d{2}$', '', text.strip())
                if is_valid_sms(text):
                    otp = parse_otp(text)
                    return text, otp
    except Exception as e:
        print(f"[Live API] Error checking sms_url {sms_url}: {type(e).__name__} - {e}")
    return None, None

async def check_parent_api(product_id: str, raw_number: str) -> tuple:
    """Queries the parent API using multiple phone number formats."""
    formats = [raw_number]
    if not raw_number.startswith('+'):
        formats.append('+' + raw_number)
    
    session = global_session or aiohttp.ClientSession()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    for phone in formats:
        url = f"{API_BASE.rstrip('/')}/api/v1/msg?key={API_TOKEN}&id={product_id}&number={phone}"
        try:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=5, connect=2.5)) as resp:
                if resp.status == 200:
                    text = await resp.text()
                    try:
                        import json
                        data = json.loads(text)
                        if data.get("code") == 200 and data.get("data"):
                            items = data["data"] if isinstance(data["data"], list) else [data["data"]]
                            for item in items:
                                if item and item.get("msg"):
                                    msg_text = item["msg"]
                                    otp = parse_otp(msg_text)
                                    return msg_text, otp
                    except Exception as json_err:
                        print(f"[Live API] JSON error parsing parent API response for {phone}: {json_err}. Raw: {text[:100]}")
        except Exception as e:
            print(f"[Live API] HTTP error checking parent API for {phone}: {type(e).__name__} - {e}")
    return None, None

# Synchronous Supabase DB functions to be safely offloaded to threads
def db_fetch_order_by_key(key: str):
    if not supabase:
        return None
    res = supabase.table("orders").select("*").eq("tracking_key", key).execute()
    return res.data[0] if res.data else None

def db_fetch_order_by_id(oid: str):
    if not supabase:
        return None
    res = supabase.table("orders").select("*").eq("order_id", oid).execute()
    return res.data[0] if res.data else None

def db_update_order(oid: str, payload: dict):
    if not supabase:
        return None
    res = supabase.table("orders").update(payload).eq("order_id", oid).execute()
    return res.data[0] if res.data else None

@app.get("/")
@app.get("/health")
def health_check():
    return {"status": "ok", "message": "On-demand Live OTP Fetcher is running"}

@app.get("/api/track/{tracking_key}")
async def track_order(tracking_key: str):
    """Fetches order details, queries the SMS URL in real-time, and updates Supabase on-demand."""
    if not tracking_key or len(tracking_key) < 5:
        raise HTTPException(status_code=400, detail="Invalid tracking key format")
        
    try:
        # 1. Fetch order details from Supabase using thread execution to prevent event loop blocking
        order = await asyncio.to_thread(db_fetch_order_by_key, tracking_key)
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
            
        order_id = order.get("order_id")
        sms_url = order.get("sms_url")
        product_id = order.get("product_id")
        raw_number = order.get("number", "").replace(" ", "") if order.get("number") else ""
        status = order.get("status")
        
        # We only try to fetch new SMS if the order status is NOT 'CANCELLED'
        if status != "CANCELLED":
            # Check 2-second in-memory cache per order_id to prevent duplicate parallel external HTTP requests
            now = time.time()
            cached = sms_check_cache.get(order_id)
            if cached and (now - cached[0] < CACHE_TTL_SECONDS):
                msg_text, otp = cached[1], cached[2]
            else:
                msg_text, otp = None, None
                
                # 2. Try fetching SMS from direct sms_url first
                if sms_url:
                    msg_text, otp = await check_sms_url(sms_url)
                    
                # 3. If not found, try fallback parent API
                if not otp and product_id and raw_number:
                    clean_num = re.sub(r'[^0-9]', '', raw_number)
                    msg_text, otp = await check_parent_api(product_id, clean_num)
                    
                sms_check_cache[order_id] = (now, msg_text, otp)
                    
            # 4. If a message is found, check if it's new and update Supabase
            if otp and msg_text:
                # Re-fetch latest order state via thread
                try:
                    latest_order = await asyncio.to_thread(db_fetch_order_by_id, order_id)
                    if latest_order:
                        order = latest_order
                except Exception as db_read_err:
                    print(f"[Live API] Error reading latest order state for {order_id}: {db_read_err}")
                
                # Gather existing messages message_1 to message_10
                existing_msgs = []
                next_index = None
                for i in range(1, 11):
                    val = order.get(f"message_{i}")
                    if val:
                        existing_msgs.append(val)
                    elif next_index is None:
                        next_index = i
                        
                if next_index is None:
                    next_index = 10
                    
                cleaned_existing = [re.sub(r'\|\d{4}-\d{2}-\d{2}$', '', m.strip()) for m in existing_msgs if m]
                is_new_msg = (msg_text not in cleaned_existing)
                status_needs_update = (order.get("status") == "PENDING")
                
                if is_new_msg or status_needs_update:
                    print(f"[Live API] Found new message on-demand for order {order_id} ({raw_number}): {otp}")
                    update_payload = {
                        "status": "COMPLETED",
                        "otp": otp,
                        "full_message": msg_text,
                        "received_at": datetime.now(timezone.utc).isoformat()
                    }
                    if is_new_msg:
                        update_payload[f"message_{next_index}"] = msg_text
                        
                    try:
                        # Perform the update in thread
                        updated_order = await asyncio.to_thread(db_update_order, order_id, update_payload)
                        if updated_order:
                            order = updated_order
                    except Exception as update_err:
                        print(f"[Live API] Supabase update error: {update_err}")
        
        # 5. Build and return the messages list to the tracking frontend
        sms_messages = []
        for i in range(1, 11):
            msg_val = order.get(f"message_{i}")
            if msg_val:
                msg_otp = parse_otp(msg_val)
                sms_messages.append({
                    "text": msg_val,
                    "otp": msg_otp,
                    "time": order.get("created_at")
                })
                
        if not sms_messages:
            jsonb_msgs = order.get("sms_messages") or []
            if isinstance(jsonb_msgs, list):
                sms_messages = jsonb_msgs
                
        return {
            "success": True,
            "number": order.get("number"),
            "status": order.get("status"),
            "created_at": order.get("created_at"),
            "sms_messages": sms_messages,
            "full_message": order.get("full_message")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Live API] Error tracking key {tracking_key}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal database tracking error: {str(e)}")

