import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

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
