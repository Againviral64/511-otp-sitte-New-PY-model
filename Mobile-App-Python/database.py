import httpx
from typing import Dict, Any, List, Optional
from config import SUPABASE_URL, HEADERS

async def supabase_get(endpoint: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Fetch records from Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(url, headers=HEADERS, params=params)
        if res.status_code in (200, 206):
            return res.json()
        print(f"Supabase GET error on {endpoint}: {res.status_code} - {res.text}")
        return []

async def supabase_get_all(endpoint: str) -> List[Dict[str, Any]]:
    """Fetch ALL records from Supabase REST API using pagination."""
    all_records = []
    offset = 0
    limit = 1000
    separator = "&" if "?" in endpoint else "?"
    order_param = "" if "order=" in endpoint else ("&order=id.asc" if "?" in endpoint else "?order=id.asc")
    async with httpx.AsyncClient(timeout=25.0) as client:
        while True:
            url = f"{SUPABASE_URL}/rest/v1/{endpoint}{separator}limit={limit}&offset={offset}{order_param}"
            res = await client.get(url, headers=HEADERS)
            if res.status_code in (200, 206):
                batch = res.json()
                all_records.extend(batch)
                if len(batch) < limit:
                    break
                offset += limit
            else:
                print(f"Supabase GET ALL error on {endpoint}: {res.status_code} - {res.text}")
                break
    return all_records

async def supabase_post(table: str, data: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    """Insert a record into Supabase table."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(url, headers=HEADERS, json=data)
        if res.status_code in (200, 201):
            return res.json()
        print(f"Supabase POST error on {table}: {res.status_code} - {res.text}")
        return None

async def supabase_patch(table: str, match_params: Dict[str, Any], data: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    """Update records matching parameters in Supabase table."""
    query_str = "&".join([f"{k}=eq.{v}" for k, v in match_params.items()])
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query_str}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.patch(url, headers=HEADERS, json=data)
        if res.status_code in (200, 204):
            return res.json() if res.content else []
        print(f"Supabase PATCH error on {table}: {res.status_code} - {res.text}")
        return None

async def supabase_delete(table: str, match_params: Dict[str, Any]) -> bool:
    """Delete records matching parameters in Supabase table."""
    query_str = "&".join([f"{k}=eq.{v}" for k, v in match_params.items()])
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query_str}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.delete(url, headers=HEADERS)
        return res.status_code in (200, 204)
