from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone

import httpx
from config import HOST, PORT, SUPABASE_URL, HEADERS
from database import supabase_get, supabase_get_all, supabase_post, supabase_patch, supabase_delete
from schemas import (
    BalanceAdjustRequest,
    UserStatusRequest,
    RefundOrderRequest,
    DepositActionRequest,
    DirectDepositRequest,
    ServicePricingRequest,
    BulkMarkupRequest,
    TicketReplyRequest,
    TicketCloseRequest,
    PaymentMethodRequest,
    WhatsAppSettingsRequest,
    SystemSettingsRequest,
)

app = FastAPI(
    title="OTP Mobile Admin Backend (Python + Supabase)",
    description="Live Python API server interfacing with Supabase for OTP Mobile Admin Panel",
    version="1.0.0",
)

# Enable CORS for React Native Expo & Web
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "OTP Mobile Admin Python Backend",
        "database": "Supabase Live Connected",
        "timestamp": datetime.utcnow().isoformat(),
    }

# ════════════════════════════════════════════════════════════════════
# 1. DASHBOARD ENDPOINTS
# ════════════════════════════════════════════════════════════════════

@app.get("/api/admin/dashboard")
async def get_dashboard_metrics(range_filter: Optional[str] = "Today"):
    """Fetch live dashboard statistics directly from Supabase orders table with 100% accuracy."""
    # Fetch ALL orders and profiles using pagination to bypass default 1000 limit
    all_orders = await supabase_get_all("orders?select=*")
    all_profiles = await supabase_get_all("profiles?select=*")
    settings = await supabase_get("settings?select=*")

    # Get PKR exchange rate from settings table (fallback: 290.0)
    exchange_rate = 290.0
    for s in settings:
        if s.get("key") == "exchange_rate_PKR":
            try:
                exchange_rate = float(s.get("value"))
            except Exception:
                pass

    # Karachi Timezone (+5 hours) for accurate local Pakistan dates
    karachi_tz = timezone(timedelta(hours=5))
    now_karachi = datetime.now(timezone.utc).astimezone(karachi_tz)
    today_date = now_karachi.date()
    yesterday_date = today_date - timedelta(days=1)

    filtered_orders = []

    for o in all_orders:
        created_str = o.get("created_at", "")
        if not created_str:
            continue
        try:
            order_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00")).astimezone(karachi_tz)
        except Exception:
            order_dt = now_karachi

        if range_filter == "Today" and order_dt.date() == today_date:
            filtered_orders.append(o)
        elif range_filter == "Yesterday" and order_dt.date() == yesterday_date:
            filtered_orders.append(o)
        elif range_filter == "7 Days" and order_dt.date() >= (today_date - timedelta(days=7)):
            filtered_orders.append(o)
        elif range_filter == "30 Days" and order_dt.date() >= (today_date - timedelta(days=30)):
            filtered_orders.append(o)
        elif range_filter == "Custom" or not range_filter:
            filtered_orders.append(o)

    # Calculate filtered stats across all orders in range
    filtered_count = len(filtered_orders)
    filtered_revenue = sum(float(o.get("price") or 0) for o in filtered_orders)
    filtered_cost = sum(float(o.get("cost_price") or 0) * exchange_rate for o in filtered_orders)
    filtered_profit = filtered_revenue - filtered_cost

    # Calculate lifetime stats across ALL orders
    lifetime_count = len(all_orders)
    lifetime_revenue = sum(float(o.get("price") or 0) for o in all_orders)
    lifetime_cost = sum(float(o.get("cost_price") or 0) * exchange_rate for o in all_orders)
    lifetime_profit = lifetime_revenue - lifetime_cost

    # Calculate User Account Insights
    users_with_balance = len([p for p in all_profiles if float(p.get("balance") or 0) > 0])
    users_no_balance = len([p for p in all_profiles if float(p.get("balance") or 0) == 0])
    users_low_balance = len([p for p in all_profiles if 0 < float(p.get("balance") or 0) < 15])
    
    signups_today = 0
    signups_yesterday = 0
    for p in all_profiles:
        c_str = p.get("created_at", "")
        try:
            p_dt = datetime.fromisoformat(c_str.replace("Z", "+00:00")).astimezone(karachi_tz)
            if p_dt.date() == today_date:
                signups_today += 1
        except Exception:
            pass

    # Total Credit Liability (Sum of all user balances)
    total_liability = sum(float(p.get("balance") or 0) for p in all_profiles)

    # Calculate real 14-day daily chart data
    daily_chart = []
    for i in range(13, -1, -1):
        d_date = today_date - timedelta(days=i)
        d_orders = []
        for o in all_orders:
            c_str = o.get("created_at", "")
            if c_str:
                try:
                    if datetime.fromisoformat(c_str.replace("Z", "+00:00")).astimezone(karachi_tz).date() == d_date:
                        d_orders.append(o)
                except Exception:
                    pass
        
        d_signups = 0
        for p in all_profiles:
            c_str = p.get("created_at", "")
            if c_str:
                try:
                    if datetime.fromisoformat(c_str.replace("Z", "+00:00")).astimezone(karachi_tz).date() == d_date:
                        d_signups += 1
                except Exception:
                    pass

        d_rev = sum(float(o.get("price") or 0) for o in d_orders)
        d_cost = sum(float(o.get("cost_price") or 0) * exchange_rate for o in d_orders)
        d_profit = d_rev - d_cost

        daily_chart.append({
            "day": d_date.strftime("%d"),
            "date_label": d_date.strftime("%b %d"),
            "orders": len(d_orders),
            "revenue": round(d_rev, 2),
            "cost": round(d_cost, 2),
            "profit": round(d_profit, 2),
            "signups": d_signups,
        })

    return {
        "range_filter": range_filter,
        "filtered_stats": {
            "orders": filtered_count,
            "revenue": round(filtered_revenue, 2),
            "cost": round(filtered_cost, 2),
            "profit": round(filtered_profit, 2),
        },
        "lifetime_stats": {
            "orders": lifetime_count,
            "revenue": round(lifetime_revenue, 2),
            "cost": round(lifetime_cost, 2),
            "profit": round(lifetime_profit, 2),
        },
        "user_insights": {
            "users_with_balance": users_with_balance,
            "users_no_balance": users_no_balance,
            "users_low_balance": users_low_balance,
            "signups_today": signups_today,
            "signups_yesterday": signups_yesterday,
        },
        "credit_liability": round(total_liability, 2),
        "daily_chart": daily_chart,
    }


# ════════════════════════════════════════════════════════════════════
# 2. USER ACCOUNTS ENDPOINTS
# ════════════════════════════════════════════════════════════════════

@app.get("/api/admin/users")
async def list_users(
    search: Optional[str] = None,
    filter_mode: Optional[str] = "all",
    sort_mode: Optional[str] = "default"
):
    """Fetch live registered user accounts from Supabase profiles table using pagination."""
    profiles = await supabase_get_all("profiles?select=*")

    # Timezones for dynamic date filtering
    karachi_tz = timezone(timedelta(hours=5))
    now_karachi = datetime.now(timezone.utc).astimezone(karachi_tz)
    today_str = str(now_karachi.date())
    yesterday_str = str((now_karachi - timedelta(days=1)).date())

    res = []
    for p in profiles:
        c_str = p.get("created_at") or ""
        # Get YYYY-MM-DD from timestamp
        created_date_str = c_str[:10]
        try:
            # Try to convert to Karachi local time if ISO format is present
            if c_str:
                dt = datetime.fromisoformat(c_str.replace("Z", "+00:00")).astimezone(karachi_tz)
                created_date_str = str(dt.date())
        except Exception:
            pass

        u = {
            "id": p.get("id"),
            "name": p.get("name") or "User",
            "email": p.get("email"),
            "balance": float(p.get("balance") or 0.0),
            "status": p.get("status") or "ACTIVE",
            "role": p.get("role") or "user",
            "createdAt": created_date_str,
        }
        res.append(u)

    # Search filter
    if search:
        q = search.lower()
        res = [u for u in res if q in u["name"].lower() or q in u["email"].lower() or q in str(u["id"]).lower()]

    # Analytics filters
    if filter_mode == "withBalance":
        res = [u for u in res if u["balance"] > 0]
    elif filter_mode == "noBalance":
        res = [u for u in res if u["balance"] == 0]
    elif filter_mode == "lowBalance":
        res = [u for u in res if 0 < u["balance"] < 15]
    elif filter_mode == "today":
        res = [u for u in res if u["createdAt"] == today_str]
    elif filter_mode == "yesterday":
        res = [u for u in res if u["createdAt"] == yesterday_str]

    # Sorting
    if sort_mode == "highToLow":
        res.sort(key=lambda u: u["balance"], reverse=True)
    elif sort_mode == "lowToHigh":
        res.sort(key=lambda u: u["balance"])

    return {"total": len(res), "users": res}

@app.post("/api/admin/users/adjust-balance")
async def adjust_user_balance(req: BalanceAdjustRequest):
    """Credit or debit user wallet balance in Supabase profiles table."""
    user = await supabase_get(f"profiles?id=eq.{req.user_id}")
    if not user:
        raise HTTPException(status_code=404, detail="User profile not found")

    current_balance = float(user[0].get("balance") or 0)
    new_balance = round(current_balance + req.amount, 2)

    updated = await supabase_patch("profiles", {"id": req.user_id}, {"balance": new_balance})
    return {"status": "success", "user_id": req.user_id, "new_balance": new_balance}

@app.put("/api/admin/users/status")
async def update_user_status(req: UserStatusRequest):
    """Suspend, Ban, or Activate a user in Supabase profiles table."""
    if req.status not in ["ACTIVE", "SUSPENDED", "BANNED"]:
        raise HTTPException(status_code=400, detail="Invalid status option")

    await supabase_patch("profiles", {"id": req.user_id}, {"status": req.status})
    return {"status": "success", "user_id": req.user_id, "new_status": req.status}

@app.get("/api/admin/users/{user_id}/audit")
async def get_user_audit(user_id: str):
    """Fetch user's orders and deposit history for per-user audit modal."""
    orders = await supabase_get(f"orders?user_id=eq.{user_id}&select=*")
    deposits = await supabase_get(f"deposits?user_id=eq.{user_id}&select=*")
    user = await supabase_get(f"profiles?id=eq.{user_id}&select=*")

    return {
        "user": user[0] if user else None,
        "orders": orders,
        "deposits": deposits,
    }


# ════════════════════════════════════════════════════════════════════
# 3. ORDERS HISTORY ENDPOINTS
# ════════════════════════════════════════════════════════════════════

@app.get("/api/admin/orders")
async def list_orders(
    search: Optional[str] = None,
    status: Optional[str] = "ALL",
):
    """Fetch live order history audit log from Supabase orders table with database-level search and cost conversion."""
    # 1. Fetch exchange rate for cost conversion
    settings = await supabase_get("settings?select=*")
    exchange_rate = 290.0
    for s in settings:
        if s.get("key") == "exchange_rate_PKR":
            try:
                exchange_rate = float(s.get("value"))
            except Exception:
                pass

    # 2. Build live query parameters
    params = ["select=*,profiles(email)", "order=id.desc", "limit=100"]

    if status and status != "ALL":
        params.append(f"status=eq.{status}")

    if search:
        q = search.strip()
        # Find matching profiles first to allow searching by user email/name
        matching_profiles = await supabase_get(f"profiles?select=id&or=(email.ilike.*{q}*,name.ilike.*{q}*)")
        user_ids = [p.get("id") for p in matching_profiles if p.get("id")]

        or_conds = [
            f"order_id.ilike.*{q}*",
            f"number.ilike.*{q}*",
            f"service.ilike.*{q}*"
        ]
        if user_ids:
            user_ids_str = ",".join(user_ids)
            or_conds.append(f"user_id.in.({user_ids_str})")

        params.append(f"or=({','.join(or_conds)})")

    query_str = f"orders?{'&'.join(params)}"
    orders_raw = await supabase_get(query_str)

    res = []
    for o in orders_raw:
        profile_info = o.get("profiles") or {}
        user_email = profile_info.get("email") if isinstance(profile_info, dict) else "user@example.com"

        raw_cost = float(o.get("cost_price") or 0)
        cost_in_pkr = raw_cost * exchange_rate
        price = float(o.get("price") or 0)
        profit = price - cost_in_pkr

        res.append({
            "id": str(o.get("id")),
            "orderId": o.get("order_id"),
            "user": user_email,
            "appGroup": o.get("service") or "SMS Service",
            "phoneNumber": o.get("number") or "N/A",
            "otpCode": o.get("otp") or "---",
            "otpDetails": o.get("full_message") or o.get("message_1") or "SMS Delivered",
            "price": round(price, 2),
            "cost": round(cost_in_pkr, 2),
            "profit": round(profit, 2),
            "status": o.get("status") or "PENDING",
            "createdAt": (o.get("created_at") or "")[:19].replace("T", " "),
            "codeUrl": o.get("sms_url") or "",
        })

    if search:
        # Secondary local filter in case of relations or fallback
        q = search.lower()
        res = [
            o for o in res
            if q in o["orderId"].lower() or q in o["user"].lower() or q in o["phoneNumber"] or q in o["appGroup"].lower()
        ]

    return {"total": len(res), "orders": res}

@app.post("/api/admin/orders/refund")
async def refund_order(req: RefundOrderRequest):
    """Refund order and credit balance back to user in Supabase."""
    order = await supabase_get(f"orders?order_id=eq.{req.order_id}&select=*")
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    o = order[0]
    user_id = o.get("user_id")
    price = float(o.get("price") or 0)

    # Update order status to CANCELLED / EXPIRED
    await supabase_patch("orders", {"order_id": req.order_id}, {"status": "CANCELLED"})

    # Credit back user balance
    if user_id:
        user = await supabase_get(f"profiles?id=eq.{user_id}")
        if user:
            cur_bal = float(user[0].get("balance") or 0)
            await supabase_patch("profiles", {"id": user_id}, {"balance": round(cur_bal + price, 2)})

    return {"status": "success", "order_id": req.order_id, "refunded_amount": price}


# ════════════════════════════════════════════════════════════════════
# 4. DEPOSITS ENDPOINTS
# ════════════════════════════════════════════════════════════════════

@app.get("/api/admin/deposits")
async def list_deposits(tab: Optional[str] = "pending"):
    """Fetch live pending deposit requests and history from Supabase deposits table using pagination."""
    deposits_raw = await supabase_get_all("deposits?select=*,profiles(email,name)&order=id.desc")

    karachi_tz = timezone(timedelta(hours=5))
    now_karachi = datetime.now(timezone.utc).astimezone(karachi_tz)
    today_date = now_karachi.date()

    pending = []
    history = []
    today_deposits_total = 0.0

    async with httpx.AsyncClient(timeout=10.0) as client:
        for d in deposits_raw:
            profile_info = d.get("profiles") or {}
            user_email = profile_info.get("email") if isinstance(profile_info, dict) else "user@example.com"
            user_name = profile_info.get("name") if isinstance(profile_info, dict) else "User"

            created_str = d.get("created_at") or ""
            created_date_str = created_str[:19].replace("T", " ")
            is_today = False
            try:
                if created_str:
                    dep_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00")).astimezone(karachi_tz)
                    created_date_str = dep_dt.strftime("%Y-%m-%d %H:%M:%S")
                    if dep_dt.date() == today_date:
                        is_today = True
            except Exception:
                pass

            amount_val = float(d.get('amount') or 0)
            status_str = d.get("status") or "PENDING"

            if status_str == "APPROVED" and is_today:
                today_deposits_total += amount_val

            raw_proof = d.get("proof_image") or d.get("screenshot_url") or ""
            proof_url = ""
            if raw_proof:
                if raw_proof.startswith("http"):
                    proof_url = raw_proof
                else:
                    try:
                        r = await client.post(
                            f"{SUPABASE_URL}/storage/v1/object/sign/deposit-proofs/{raw_proof}",
                            headers=HEADERS,
                            json={"expiresIn": 3600}
                        )
                        if r.status_code == 200:
                            signed_path = r.json().get("signedURL", "")
                            proof_url = f"{SUPABASE_URL}/storage/v1{signed_path}"
                        else:
                            proof_url = f"{SUPABASE_URL}/storage/v1/object/public/deposit-proofs/{raw_proof}"
                    except Exception:
                        proof_url = f"{SUPABASE_URL}/storage/v1/object/public/deposit-proofs/{raw_proof}"

            dep_obj = {
                "id": str(d.get("id")),
                "userId": str(d.get("user_id")),
                "user": user_email,
                "accountName": user_name,
                "amount": f"Rs {amount_val:.2f}",
                "method": d.get("method") or "JazzCash",
                "date": created_date_str,
                "proof": proof_url,
                "status": status_str,
                "txId": d.get("tx_id") or "N/A",
            }

            if status_str == "PENDING":
                pending.append(dep_obj)
            else:
                history.append(dep_obj)

    return {
        "pending": pending,
        "history": history,
        "today_deposits_total": round(today_deposits_total, 2),
        "total_transactions": len(deposits_raw),
    }

@app.post("/api/admin/deposits/action")
async def action_deposit(req: DepositActionRequest):
    """Approve or Reject a deposit request."""
    deps = await supabase_get(f"deposits?id=eq.{req.deposit_id}&select=*")
    if not deps:
        raise HTTPException(status_code=404, detail="Deposit request not found")
    
    dep = deps[0]
    curr_status = dep.get("status")
    user_id = dep.get("user_id")
    amount = float(dep.get("amount") or 0)
    currency = (dep.get("currency") or "PKR").upper()

    # Get exchange rate
    settings = await supabase_get("settings?select=*")
    exchange_rate = 290.0
    for s in settings:
        if s.get("key") == "exchange_rate_PKR":
            try: exchange_rate = float(s.get("value"))
            except Exception: pass

    pkr_amount = amount * exchange_rate if currency == "USD" else amount

    if req.action.upper() == "APPROVE":
        if curr_status != "APPROVED":
            # 1. Update deposit status
            await supabase_patch("deposits", {"id": req.deposit_id}, {"status": "APPROVED"})
            
            # 2. Credit user's balance in profiles
            profiles = await supabase_get(f"profiles?id=eq.{user_id}&select=*")
            if profiles:
                p = profiles[0]
                old_bal = float(p.get("balance") or 0)
                new_bal = round(old_bal + pkr_amount, 2)
                await supabase_patch("profiles", {"id": user_id}, {"balance": new_bal})

        return {"status": "success", "message": f"Deposit #{req.deposit_id} approved and credited Rs {pkr_amount:.2f}"}

    elif req.action.upper() == "REJECT":
        await supabase_patch("deposits", {"id": req.deposit_id}, {"status": "REJECTED"})
        return {"status": "success", "message": f"Deposit #{req.deposit_id} rejected"}

    else:
        raise HTTPException(status_code=400, detail="Invalid action, must be APPROVE or REJECT")

@app.post("/api/admin/deposits/direct")
async def direct_admin_deposit(req: DirectDepositRequest):
    """Directly credit user wallet in Supabase."""
    profiles = await supabase_get(f"profiles?email=eq.{req.user_email_or_id}")
    if not profiles:
        profiles = await supabase_get(f"profiles?id=eq.{req.user_email_or_id}")
    if not profiles:
        raise HTTPException(status_code=404, detail="User account not found")

    u = profiles[0]
    user_id = u["id"]
    cur_balance = float(u.get("balance") or 0)
    new_balance = round(cur_balance + req.amount, 2)

    await supabase_patch("profiles", {"id": user_id}, {"balance": new_balance})

    # Log deposit record in deposits table
    await supabase_post("deposits", {
        "user_id": user_id,
        "method": "DIRECT ADMIN",
        "amount": req.amount,
        "tx_id": req.tx_id or "DIRECT-ADMIN",
        "status": "APPROVED",
        "currency": "PKR",
        "payment_note": req.comments,
    })

    return {"status": "success", "user": u["email"], "new_balance": new_balance}


# ════════════════════════════════════════════════════════════════════
# 5. SERVICES & PRICING ENDPOINTS
# ════════════════════════════════════════════════════════════════════

@app.get("/api/admin/services")
async def list_services():
    """Fetch services & prices from Supabase services table."""
    services = await supabase_get("services?select=*&order=id.asc")
    res = []
    for s in services:
        res.append({
            "id": str(s.get("id")),
            "code": s.get("service_id") or f"srv_{s.get('id')}",
            "name": s.get("app_name") or "Service",
            "costPrice": float(s.get("cost_price") or 0),
            "sellPrice": float(s.get("sell_price") or 0),
            "group": s.get("group_name") or "Social Media",
            "isActive": True,
        })
    return {"services": res}

@app.put("/api/admin/services/pricing")
async def update_service_pricing(req: ServicePricingRequest):
    """Update service cost & sell price in Supabase."""
    await supabase_patch("services", {"id": req.service_id}, {
        "cost_price": req.cost_price,
        "sell_price": req.sell_price,
    })
    return {"status": "success", "service_id": req.service_id}


# ════════════════════════════════════════════════════════════════════
# 6. SUPPORT TICKETS ENDPOINTS
# ════════════════════════════════════════════════════════════════════

@app.get("/api/admin/tickets")
async def list_tickets():
    """Fetch support tickets from Supabase tickets table using pagination."""
    tickets = await supabase_get_all("tickets?select=*,profiles(email,name)&order=id.desc")
    res = []
    for t in tickets:
        p = t.get("profiles") or {}
        res.append({
            "id": str(t.get("id")),
            "ticketId": f"TK-{t.get('id')}",
            "subject": t.get("title") or "Support Issue",
            "category": t.get("category") or "General",
            "userName": p.get("name") if isinstance(p, dict) else "User",
            "email": p.get("email") if isinstance(p, dict) else "user@example.com",
            "status": t.get("status") or "OPEN",
            "createdAt": (t.get("created_at") or "")[:16].replace("T", " "),
            "lastMessage": "Click to view full message trajectory",
        })
    return {"tickets": res}

# Server execution runner
if __name__ == "__main__":
    import uvicorn
    print(f"Starting Mobile Admin Python Server on http://{HOST}:{PORT}")
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
