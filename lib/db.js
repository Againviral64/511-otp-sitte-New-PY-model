import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

export const apiBase = process.env.API_BASE || 'mock';
export const apiToken = process.env.API_TOKEN || 'YOUR_API_TOKEN';
export const isMock = apiBase.toLowerCase() === 'mock' || apiToken === 'YOUR_API_TOKEN' || !apiToken;

let supabase = null;

if (supabaseUrl && supabaseUrl !== 'YOUR_SUPABASE_URL' && supabaseKey && supabaseKey !== 'YOUR_SUPABASE_KEY') {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log('Supabase connection initialized successfully.');
    } catch (err) {
        console.error('Failed to initialize Supabase client:', err.message);
    }
} else {
    console.warn('⚠️ Supabase credentials are missing or default in .env. Running in Database-less / Local-Mock mode.');
}

export function getSupabaseClient(request) {
    if (!supabaseUrl || supabaseUrl === 'YOUR_SUPABASE_URL') return null;
    
    const activeKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!activeKey || activeKey === 'YOUR_SUPABASE_KEY') return null;

    if (request && request.headers) {
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                return createClient(supabaseUrl, activeKey, {
                    global: {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                });
            } catch (err) {
                console.error('Failed to create authenticated Supabase client:', err.message);
            }
        }
    }
    
    return supabase;
}

export async function makeRequest(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: AbortSignal.timeout(10000)
        });
        return await response.text();
    } catch (err) {
        console.error('Fetch request error:', err.message);
        return null;
    }
}

let cachedGoods = null;
let cacheTime = 0;

export async function resolveBestTime(serviceId) {
    let timeParam = 4; // default fallback
    try {
        const now = Date.now();
        let goodsData = cachedGoods;
        if (!goodsData || now - cacheTime > 5000) { // 5-second cache TTL
            const goodsUrl = `${apiBase.replace(/\/$/, '')}/api/v1/goods?key=${encodeURIComponent(apiToken)}`;
            const response = await makeRequest(goodsUrl);
            if (response) {
                const json = JSON.parse(response);
                if (json.code === 200 && Array.isArray(json.data)) {
                    cachedGoods = json;
                    cacheTime = now;
                    goodsData = json;
                }
            }
        }
        
        if (goodsData && Array.isArray(goodsData.data)) {
            let foundItem = null;
            for (const group of goodsData.data) {
                foundItem = group.list.find(item => item.id.toString() === serviceId.toString());
                if (foundItem) break;
            }
            if (foundItem && Array.isArray(foundItem.conf_price)) {
                // Loop from longest (3) to shortest (0) to find first with stock > 0
                for (let i = 3; i >= 0; i--) {
                    const conf = foundItem.conf_price[i];
                    if (conf && conf.stock > 0) {
                        timeParam = i + 1;
                        break;
                    }
                }
            }
        }
    } catch (err) {
        console.error('[resolveBestTime] Error:', err.message);
    }
    return timeParam;
}

// Local Memory for Mock Mode
export let mockBalance = 3500.000;
export let mockOrders = [];
export let mockDeposits = [];
export const mockServices = [
    { code: '337', name: 'Telegram 纸飞机', price: 0.700, cost_price: 0.600, stock: 1990, group_id: '5' },
    { code: '345', name: '贝宝', price: 0.350, cost_price: 0.300, stock: 45, group_id: '5' },
    { code: '14', name: 'Microsoft', price: 0.250, cost_price: 0.200, stock: 800, group_id: '3' },
    { code: '9', name: 'Facebook', price: 0.500, cost_price: 0.400, stock: 350, group_id: '3' }
];
export const mockGroups = [
    { code: '5', name: '美国实卡', flag: '🇺🇸' },
    { code: '3', name: '美国运营商：A', flag: '🇺🇸' }
];

export default supabase;
