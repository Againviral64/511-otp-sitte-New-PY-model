// routes/api.js
import express from 'express';
import supabase from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Get env configurations
const apiBase = process.env.API_BASE || 'mock';
const apiToken = process.env.API_TOKEN || 'YOUR_API_TOKEN';
const isMock = apiBase.toLowerCase() === 'mock' || apiToken === 'YOUR_API_TOKEN' || !apiToken;

// One-time Database Migration: Convert legacy PKR prices to USD
if (supabase) {
    supabase.from('services').select('*').then(({ data, error }) => {
        if (data && !error) {
            const updates = data.filter(d => parseFloat(d.cost_price) > 2.0).map(d => ({
                id: d.id,
                cost_price: parseFloat(d.cost_price) / 278.50,
                sell_price: parseFloat(d.sell_price) / 278.50
            }));
            if (updates.length > 0) {
                console.log(`[Migration] Migrating ${updates.length} legacy PKR service prices to USD...`);
                Promise.all(updates.map(upd => 
                    supabase.from('services').update({
                        cost_price: upd.cost_price,
                        sell_price: upd.sell_price
                    }).eq('id', upd.id)
                )).then(() => {
                    console.log('[Migration] Database pricing migration completed successfully.');
                }).catch(err => {
                    console.error('[Migration] Failed to migrate database prices:', err.message);
                });
            }
        }
    });
}

// Local Memory for Mock Mode (Prices in USD, User Balance in PKR)
let mockBalance = 3500.000;
let mockOrders = [];
let mockDeposits = [];
let mockServices = [
    { code: '337', name: 'Telegram 纸飞机', price: 0.700, cost_price: 0.600, stock: 1990, group_id: '5' },
    { code: '345', name: '贝宝', price: 0.350, cost_price: 0.300, stock: 45, group_id: '5' },
    { code: '14', name: 'Microsoft', price: 0.250, cost_price: 0.200, stock: 800, group_id: '3' },
    { code: '9', name: 'Facebook', price: 0.500, cost_price: 0.400, stock: 350, group_id: '3' }
];
let mockGroups = [
    { code: '5', name: '美国实卡', flag: '🇺🇸' },
    { code: '3', name: '美国运营商：A', flag: '🇺🇸' }
];

/**
 * UTILITY: Helper to make HTTP requests
 */
async function makeRequest(url) {
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

/**
 * MIDDLEWARE: Require user authentication (decoded JWT token)
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Session expired or missing authorization header.' });
    }

    const token = authHeader.split(' ')[1];

    if (!supabase) {
        // Mock session user fallback
        req.user = { id: '00000000-0000-0000-0000-000000000000', email: 'partner@novatix.com', role: 'admin' };
        return next();
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ success: false, message: 'Invalid token session.' });
        }

        // Fetch or auto-create profile row
        let { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        const name = user.user_metadata?.name || 'User';

        if (!profile) {
            // Safety fallback profile sync
            const { data: newProfile } = await supabase
                .from('profiles')
                .insert([{ id: user.id, email: user.email, name: name, balance: 0.000, spend: 0.000, total_orders: 0, role: 'user', currency: 'PKR' }])
                .select()
                .maybeSingle();
            profile = newProfile;
        }

        req.user = {
            id: user.id,
            email: user.email,
            name: profile ? (profile.name || name) : name,
            role: profile ? profile.role : 'user',
            balance: profile ? parseFloat(profile.balance) : 0.000,
            currency: profile ? (profile.currency || 'PKR') : 'PKR'
        };
        next();
    } catch (err) {
        console.error('Auth middleware error:', err.message);
        return res.status(401).json({ success: false, message: 'Session authentication failed.' });
    }
}

/**
 * MIDDLEWARE: Require Admin role
 */
function requireAdmin(req, res, next) {
    requireAuth(req, res, async () => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Session expired or missing authorization header.' });
        }

        // 1. Role fallback: check user profile role directly
        if (req.user.role && req.user.role.toLowerCase() === 'admin') {
            return next();
        }

        if (isMock || !supabase) {
            // Under mock mode/local testing, if no supabase client is connected
            return res.status(403).json({ success: false, message: 'Access Denied: Admin authorization required.' });
        }

        try {
            // 2. Query admin_profiles table to authorize
            const { data, error } = await supabase
                .from('admin_profiles')
                .select('id')
                .eq('id', req.user.id)
                .maybeSingle();

            if (data && !error) {
                return next();
            }

            return res.status(403).json({ success: false, message: 'Access Denied: Admin authorization required.' });
        } catch (err) {
            console.error('Admin verification error:', err.message);
            return res.status(500).json({ success: false, message: 'Authentication validation error.' });
        }
    });
}

/**
 * GET: /api/auth/config
 * Unified auth config endpoint inside router to prevent frontend fallthrough
 */
router.get('/auth/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_KEY
    });
});

/**
 * GET: /api/user/profile
 */
router.get('/user/profile', requireAuth, async (req, res) => {
    if (!supabase) {
        return res.json({
            success: true,
            profile: {
                email: req.user.email,
                name: req.user.name || 'User',
                balance: mockBalance,
                role: req.user.role,
                currency: req.user.currency || 'PKR',
                is_admin: req.user.role === 'admin'
            }
        });
    }

    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .maybeSingle();

        if (error || !profile) {
            return res.json({ success: false, message: 'Failed to retrieve profile stats.' });
        }

        // Check if user is in admin_profiles table
        const { data: adminProfile } = await supabase
            .from('admin_profiles')
            .select('id')
            .eq('id', req.user.id)
            .maybeSingle();

        const is_admin = (profile.role && profile.role.toLowerCase() === 'admin') || !!adminProfile;

        return res.json({ 
            success: true, 
            profile: {
                ...profile,
                balance: isMock ? mockBalance : parseFloat(profile.balance || 0),
                is_admin: is_admin
            }
        });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * GET: /api/services
 * Public Pricing & Relational Service lists
 */
router.get('/services', async (req, res) => {
    if (isMock || !supabase) {
        return res.json({
            success: true,
            countries: mockGroups,
            services: mockServices
        });
    }

    try {
        // 1. Fetch dynamic groups and services from 555api
        const goodsUrl = `${apiBase.replace(/\/$/, '')}/api/v1/goods?key=${encodeURIComponent(apiToken)}`;
        const response = await makeRequest(goodsUrl);
        
        let apiGroups = [];
        let apiServices = [];

        if (response) {
            try {
                const json = JSON.parse(response);
                if (json.code === 200 && Array.isArray(json.data)) {
                    apiGroups = json.data.map(group => ({
                        code: group.group_id.toString(),
                        name: group.group_name,
                        flag: group.group_name.includes('美国') ? '🇺🇸' : '🌐'
                    }));

                    json.data.forEach(group => {
                        group.list.forEach(item => {
                            apiServices.push({
                                code: item.id.toString(),
                                name: item.name,
                                cost_price: parseFloat(item.unit_price),
                                price: parseFloat(item.unit_price) + 0.10, // Default fallback profit markup in USD
                                stock: parseInt(item.stock),
                                group_id: group.group_id.toString()
                            });
                        });
                    });
                }
            } catch (e) {
                console.error('Failed to parse live goods response:', e.message);
            }
        }

        // 2. Fetch configured pricing from Supabase services table
        const { data: dbServices } = await supabase.from('services').select('*');
        const dbServicesFiltered = dbServices ? dbServices.filter(db => db.group_name !== 'SYSTEM_CONFIG') : [];

        let expiryMinutes = 4;
        try {
            const { data: configRow } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'otp_expiry_duration')
                .maybeSingle();
            if (configRow) {
                expiryMinutes = parseInt(configRow.value) || 4;
            }
        } catch (e) {
            console.error('Failed to query settings table:', e.message);
        }

        // 3. Keep ONLY services that exist in the database (enabled by admin)
        const activeServices = apiServices
            .filter(s => dbServicesFiltered.some(db => db.service_id === s.code))
            .map(s => {
                const dbMatch = dbServicesFiltered.find(db => db.service_id === s.code);
                return {
                    code: s.code,
                    name: s.name,
                    group_id: s.group_id,
                    cost_price: dbMatch ? parseFloat(dbMatch.cost_price) : s.cost_price,
                    price: dbMatch ? parseFloat(dbMatch.sell_price) : s.price,
                    stock: s.stock
                };
            });

        // If the live response is offline, fallback to database records entirely
        if (activeServices.length === 0 && dbServicesFiltered.length > 0) {
            const fallbackServices = dbServicesFiltered.map(db => ({
                code: db.service_id,
                name: db.app_name,
                group_id: '3',
                cost_price: parseFloat(db.cost_price),
                price: parseFloat(db.sell_price),
                stock: db.stock
            }));
            const fallbackGroups = [...new Set(dbServicesFiltered.map(db => db.group_name))].map((name, i) => ({
                code: '3',
                name: name,
                flag: name.includes('美国') ? '🇺🇸' : '🌐'
            }));

            return res.json({
                success: true,
                countries: fallbackGroups,
                services: fallbackServices,
                otp_expiry_minutes: expiryMinutes
            });
        }

        // Filter returned groups so we only show groups that have at least one active service
        const filteredGroups = apiGroups.filter(g => activeServices.some(s => s.group_id === g.code));

        return res.json({
            success: true,
            countries: filteredGroups.length > 0 ? filteredGroups : (apiGroups.length > 0 ? apiGroups : mockGroups),
            services: activeServices,
            otp_expiry_minutes: expiryMinutes
        });
    } catch (err) {
        console.error('Get services failure:', err.message);
        return res.json({ success: true, countries: mockGroups, services: mockServices });
    }
});

/**
 * GET: /api/admin/services
 * Retrieve all available services from 555api, flagged with enabled status
 */
router.get('/admin/services', requireAdmin, async (req, res) => {
    if (isMock || !supabase) {
        return res.json({
            success: true,
            countries: mockGroups,
            services: mockServices.map(s => ({ ...s, enabled: true }))
        });
    }

    try {

        // Fetch dynamic groups and services from 555api
        const goodsUrl = `${apiBase.replace(/\/$/, '')}/api/v1/goods?key=${encodeURIComponent(apiToken)}`;
        const response = await makeRequest(goodsUrl);
        
        let apiGroups = [];
        let apiServices = [];

        if (response) {
            try {
                const json = JSON.parse(response);
                if (json.code === 200 && Array.isArray(json.data)) {
                    apiGroups = json.data.map(group => ({
                        code: group.group_id.toString(),
                        name: group.group_name,
                        flag: group.group_name.includes('美国') ? '🇺🇸' : '🌐'
                    }));

                    json.data.forEach(group => {
                        group.list.forEach(item => {
                            apiServices.push({
                                code: item.id.toString(),
                                name: item.name,
                                cost_price: parseFloat(item.unit_price),
                                price: parseFloat(item.unit_price) + 0.10, // Default fallback profit markup in USD
                                stock: parseInt(item.stock),
                                group_id: group.group_id.toString(),
                                group_name: group.group_name
                            });
                        });
                    });
                }
            } catch (e) {
                console.error('Failed to parsegoods response:', e.message);
            }
        }

        // Fetch current active service records in database
        const { data: dbServices } = await supabase.from('services').select('*');
        const dbServicesFiltered = dbServices ? dbServices.filter(db => db.group_name !== 'SYSTEM_CONFIG') : [];

        // Flag enabled services
        const servicesWithFlags = apiServices.map(s => {
            const dbMatch = dbServicesFiltered.find(db => db.service_id === s.code);
            return {
                ...s,
                group_name: dbMatch ? dbMatch.group_name : (s.group_name || 'Standard Operators'),
                cost_price: dbMatch ? parseFloat(dbMatch.cost_price) : s.cost_price,
                price: dbMatch ? parseFloat(dbMatch.sell_price) : s.price,
                enabled: !!dbMatch
            };
        });

        const finalServices = servicesWithFlags.length > 0 ? servicesWithFlags : dbServicesFiltered.map(db => ({
            code: db.service_id,
            name: db.app_name,
            group_id: '3',
            group_name: db.group_name || 'Standard Operators',
            cost_price: parseFloat(db.cost_price),
            price: parseFloat(db.sell_price),
            stock: db.stock,
            enabled: true
        }));

        const finalGroups = apiGroups.length > 0 ? apiGroups : [...new Set(dbServicesFiltered.map(db => db.group_name))].map(name => ({
            code: '3',
            name: name,
            flag: name.includes('美国') ? '🇺🇸' : '🌐'
        }));

        return res.json({
            success: true,
            countries: finalGroups,
            services: finalServices
        });
    } catch (err) {
        console.error('Admin get services failure:', err.message);
        return res.json({ success: false, message: 'Server error retrieving services.' });
    }
});

/**
 * POST: /api/admin/services/sync-active
 * Syncs the selected services checked state in the Supabase database.
 */
router.post('/admin/services/sync-active', requireAdmin, async (req, res) => {
    if (isMock || !supabase) {
        return res.json({ success: true, message: 'Mock synced successfully.' });
    }

    try {

        const { service_ids } = req.body;
        if (!Array.isArray(service_ids)) {
            return res.json({ success: false, message: 'Invalid service list payload.' });
        }

        // 1. Fetch current database services
        const { data: dbServices } = await supabase.from('services').select('*');
        const dbServicesFiltered = dbServices ? dbServices.filter(db => db.group_name !== 'SYSTEM_CONFIG') : [];

        // 2. Fetch live goods to extract correct group/names if we need to insert new ones
        const goodsUrl = `${apiBase.replace(/\/$/, '')}/api/v1/goods?key=${encodeURIComponent(apiToken)}`;
        const response = await makeRequest(goodsUrl);
        
        let apiServices = [];
        let apiGroups = [];
        if (response) {
            try {
                const json = JSON.parse(response);
                if (json.code === 200 && Array.isArray(json.data)) {
                    apiGroups = json.data.map(group => ({
                        code: group.group_id.toString(),
                        name: group.group_name
                    }));
                    json.data.forEach(group => {
                        group.list.forEach(item => {
                            apiServices.push({
                                code: item.id.toString(),
                                name: item.name,
                                cost_price: parseFloat(item.unit_price),
                                price: parseFloat(item.unit_price) + 0.10,
                                stock: parseInt(item.stock),
                                group_id: group.group_id.toString()
                            });
                        });
                    });
                }
            } catch (e) {
                console.error(e);
            }
        }

        // 3. Find services to delete: Any DB records not present in the checked service_ids array
        const toDeleteIds = dbServicesFiltered
            .filter(db => !service_ids.includes(db.service_id))
            .map(db => db.service_id);

        if (toDeleteIds.length > 0) {
            const { error: delErr } = await supabase
                .from('services')
                .delete()
                .in('service_id', toDeleteIds);
            if (delErr) throw delErr;
        }

        // 4. Find services to insert: Any checked service_ids not present in the DB records
        const existingIds = dbServicesFiltered.map(db => db.service_id);
        const toInsertIds = service_ids.filter(id => !existingIds.includes(id));

        if (toInsertIds.length > 0) {
            const rowsToInsert = toInsertIds.map(id => {
                const liveMatch = apiServices.find(s => s.code === id);
                if (liveMatch) {
                    const grpName = apiGroups.find(g => g.code === liveMatch.group_id)?.name || 'Default Operator';
                    return {
                        service_id: id,
                        group_name: grpName,
                        app_name: liveMatch.name,
                        cost_price: liveMatch.cost_price,
                        sell_price: liveMatch.price,
                        stock: liveMatch.stock
                    };
                } else {
                    return {
                        service_id: id,
                        group_name: 'Custom Operator',
                        app_name: 'Custom App',
                        cost_price: 0.10,
                        sell_price: 0.20,
                        stock: 100
                    };
                }
            });

            const { error: insErr } = await supabase
                .from('services')
                .insert(rowsToInsert);
            if (insErr) throw insErr;
        }

        return res.json({ success: true, message: 'Services selection synchronized successfully.' });
    } catch (err) {
        console.error('Failed to sync active services:', err.message);
        return res.json({ success: false, message: 'Database synchronization failed.' });
    }
});

/**
 * POST: /api/buy
 * Enforces user balance check and buys a live verification number
 */
router.post('/buy', requireAuth, async (req, res) => {
    const { country, service } = req.body; // country is group_id, service is product_id (code)

    if (!country || !service) {
        return res.json({ success: false, message: 'Please select both Category and Service.' });
    }

    let sellPrice = 0.500;
    let costPrice = 0.400;
    let appName = 'OTP App';
    let groupName = 'Operators Group';

    // 1. Fetch dynamic pricing from database services table
    let expiryDuration = 4;
    if (!isMock && supabase) {
        const { data: sRow } = await supabase
            .from('services')
            .select('*')
            .eq('service_id', service)
            .maybeSingle();

        if (sRow) {
            sellPrice = parseFloat(sRow.sell_price);
            costPrice = parseFloat(sRow.cost_price);
            appName = sRow.app_name;
            groupName = sRow.group_name;
        } else {
            return res.json({ success: false, message: 'This service product is currently unavailable.' });
        }

        // Fetch dynamic system expiry config from settings table
        try {
            const { data: configRow } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'otp_expiry_duration')
                .maybeSingle();
            if (configRow) {
                expiryDuration = parseInt(configRow.value) || 4;
            }
        } catch (e) {
            console.error('Failed to query settings table:', e.message);
        }
    } else {
        const mockMatch = mockServices.find(s => s.code === service);
        if (mockMatch) {
            sellPrice = mockMatch.price;
            costPrice = mockMatch.cost_price;
            appName = mockMatch.name;
        }
    }

    // 2. Validate User Balance
    const sellPricePKR = sellPrice * 278.50;
    if (req.user.balance < sellPricePKR) {
        return res.json({ success: false, message: 'Insufficient balance. Please deposit funds.', error_type: 'LOW_BALANCE' });
    }

    let orderId = '';
    let number = '';
    let smsUrl = null;

    if (isMock) {
        mockBalance -= sellPricePKR;
        const randDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        number = `+1 ${randDigits.substring(0,3)}-${randDigits.substring(3,6)}-${randDigits.substring(6)}`;
        orderId = `MOCK-${Math.floor(100000 + Math.random() * 900000)}-${Date.now()}`;
        
        const newMockOrder = {
            order_id: orderId,
            user_id: req.user.id,
            user_email: req.user.email,
            country: 'United States',
            service: appName,
            number: number,
            otp: null,
            status: 'PENDING',
            price: sellPricePKR,
            sms_url: null,
            product_id: service,
            created_at: new Date().toISOString()
        };
        mockOrders.unshift(newMockOrder);
    } else {
        // Call live gateway to buy a number with dynamic expiry duration
        const buyUrl = `${apiBase.replace(/\/$/, '')}/api/v1/get?key=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(service)}&num=1&time=${expiryDuration}`;
        const buyResponse = await makeRequest(buyUrl);

        if (!buyResponse) {
            return res.json({ success: false, message: 'API purchase gateway timed out.' });
        }

        try {
            const buyJson = JSON.parse(buyResponse);
            if (buyJson.code === 200 && buyJson.data && buyJson.data.sn) {
                orderId = buyJson.data.sn;
                number = buyJson.data.number[0];
            } else {
                return res.json({ success: false, message: buyJson.message || 'Gateway purchase failed.' });
            }
        } catch (e) {
            return res.json({ success: false, message: 'Gateway error matching purchase response format.' });
        }

        // Fetch Order checking URL immediately
        const orderUrl = `${apiBase.replace(/\/$/, '')}/api/v1/order?key=${encodeURIComponent(apiToken)}&sn=${encodeURIComponent(orderId)}`;
        const orderResponse = await makeRequest(orderUrl);
        if (orderResponse && orderResponse.includes('|')) {
            const parts = orderResponse.split('|');
            if (parts.length >= 2) {
                smsUrl = parts[1].trim();
            }
        }
    }

    // 3. Save Order and Deduct User Balance in Transaction
    if (!isMock && supabase) {
        // Deduct balance
        const newBalance = req.user.balance - sellPricePKR;
        const newSpend = req.user.balance - newBalance; // spend increment

        const { error: balanceError } = await supabase
            .from('profiles')
            .update({
                balance: newBalance,
                spend: req.user.balance - newBalance + parseFloat(req.user.spend || 0),
                total_orders: 1 + parseInt(req.user.total_orders || 0)
            })
            .eq('id', req.user.id);

        if (balanceError) {
            console.error('Failed to deduct user balance:', balanceError.message);
            return res.json({ success: false, message: 'Payment deduction error.' });
        }

        // Save order logs
        const { error: orderError } = await supabase
            .from('orders')
            .insert([{
                order_id: orderId,
                user_id: req.user.id,
                country: groupName,
                service: appName,
                number: number,
                status: 'PENDING',
                price: sellPricePKR,
                sms_url: smsUrl,
                product_id: service
            }]);

        if (orderError) {
            console.error('Failed to save user order details:', orderError.message);
        }
    }

    return res.json({
        success: true,
        order_id: orderId,
        country: isMock ? 'United States' : groupName,
        service: appName,
        number: number,
        price: sellPricePKR.toFixed(3),
        status: 'PENDING'
    });
});

/**
 * POST: /api/manual
 */
router.post('/manual', requireAuth, async (req, res) => {
    const { number, sms_url } = req.body;

    if (!number || !sms_url) {
        return res.json({ success: false, message: 'Please provide both phone number and SMS URL.' });
    }

    const cleanedNumber = number.trim();
    const cleanedSmsUrl = sms_url.trim();
    const orderId = `MANUAL-${Math.floor(100000 + Math.random() * 900000)}-${Date.now()}`;

    if (isMock || !supabase) {
        const newMockOrder = {
            order_id: orderId,
            user_id: req.user.id,
            user_email: req.user.email,
            country: 'Manual Import',
            service: 'Manual Activation',
            number: cleanedNumber,
            otp: null,
            status: 'PENDING',
            price: 0.000,
            sms_url: cleanedSmsUrl,
            created_at: new Date().toISOString()
        };
        mockOrders.unshift(newMockOrder);
    } else {
        const { error } = await supabase
            .from('orders')
            .insert([{
                order_id: orderId,
                user_id: req.user.id,
                country: 'Manual Import',
                service: 'Manual Activation',
                number: cleanedNumber,
                status: 'PENDING',
                price: 0.000,
                sms_url: cleanedSmsUrl
            }]);

        if (error) {
            console.error('Supabase DB Insert Error:', error.message);
            return res.json({ success: false, message: `Database insert failed: ${error.message}` });
        }
    }

    return res.json({
        success: true,
        order_id: orderId,
        country: 'Manual Import',
        service: 'Manual Activation',
        number: cleanedNumber,
        price: '0.000',
        status: 'PENDING'
    });
});

/**
 * GET: /api/sms
 */
router.get('/sms', requireAuth, async (req, res) => {
    const { order_id } = req.query;

    if (!order_id) {
        return res.json({ success: false, message: 'Missing order_id parameters' });
    }

    let status = 'PENDING';
    let otp = null;
    let targetSmsUrl = null;
    let isManualLink = false;
    let orderRow = null;

    if (!isMock && supabase) {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', order_id)
            .eq('user_id', req.user.id) // Ensure only owner accesses
            .maybeSingle();

        if (error) {
            return res.json({ success: false, message: `Database read error: ${error.message}` });
        }

        if (!data) {
            return res.json({ success: false, message: 'Order not found in DB.' });
        }

        if (data.status !== 'PENDING') {
            return res.json({ success: true, status: data.status, otp: data.otp });
        }

        orderRow = data;
        if (data.sms_url) {
            targetSmsUrl = data.sms_url;
            isManualLink = true;
        }
    } else {
        const localIdx = mockOrders.findIndex(o => o.order_id === order_id && o.user_id === req.user.id);
        if (localIdx === -1) {
            return res.json({ success: false, message: 'Mock order not found.' });
        }
        if (mockOrders[localIdx].status !== 'PENDING') {
            return res.json({ success: true, status: mockOrders[localIdx].status, otp: mockOrders[localIdx].otp });
        }
        orderRow = mockOrders[localIdx];
        if (mockOrders[localIdx].sms_url) {
            targetSmsUrl = mockOrders[localIdx].sms_url;
            isManualLink = true;
        }
    }

    // Polling logic
    if (isManualLink || targetSmsUrl) {
        const response = await makeRequest(targetSmsUrl);
        if (response) {
            const match = response.match(/\b\d{4,8}\b/);
            if (match) {
                status = 'COMPLETED';
                otp = match[0];
            } else {
                status = 'PENDING';
            }
        }
    } else {
        if (isMock) {
            const elapsed = (Date.now() - new Date(orderRow.created_at).getTime()) / 1000;
            if (elapsed > 300) {
                status = 'EXPIRED';
                otp = 'Not Received';
            } else if (elapsed >= 10) {
                status = 'COMPLETED';
                otp = Math.floor(100000 + Math.random() * 900000).toString();
            }
        } else {
            // Backup query route: /api/v1/msg
            const productId = orderRow.product_id;
            const phoneNumber = orderRow.number.replace(/\s+/g, '');
            const msgUrl = `${apiBase.replace(/\/$/, '')}/api/v1/msg?key=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(productId)}&number=${encodeURIComponent(phoneNumber)}`;
            const response = await makeRequest(msgUrl);

            if (response) {
                try {
                    const json = JSON.parse(response);
                    if (json.code === 200 && json.data && json.data.msg) {
                        const match = json.data.msg.match(/\b\d{4,8}\b/);
                        if (match) {
                            status = 'COMPLETED';
                            otp = match[0];
                        }
                    } else if (json.code === 222) {
                        status = 'PENDING';
                    }
                } catch (e) {
                    // Fallthrough
                }
            }
        }
    }

    // Auto-expire order if 5 minutes elapsed and still pending
    if (status === 'PENDING') {
        const elapsedSec = (Date.now() - new Date(orderRow.created_at).getTime()) / 1000;
        if (elapsedSec > 300) {
            status = 'EXPIRED';
            otp = 'Not Received';
        }
    }

    // Commit changes
    if (status !== 'PENDING') {
        if (!isMock && supabase) {
            await supabase
                .from('orders')
                .update({ status: status, otp: otp || 'Not Received' })
                .eq('order_id', order_id);
        } else {
            const localIdx = mockOrders.findIndex(o => o.order_id === order_id);
            if (localIdx !== -1) {
                mockOrders[localIdx].status = status;
                mockOrders[localIdx].otp = otp || 'Not Received';
            }
        }
    }

    return res.json({ success: true, status, otp });
});

/**
 * GET: /api/history
 */
router.get('/history', requireAuth, async (req, res) => {
    if (isMock || !supabase) {
        const userMockOrders = mockOrders.filter(o => o.user_id === req.user.id);
        const formatted = userMockOrders.map(o => ({
            ...o,
            formatted_time: new Date(o.created_at).toLocaleString()
        }));
        return res.json({ success: true, orders: formatted });
    }

    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            return res.json({ success: false, message: error.message });
        }

        const formatted = data.map(o => ({
            ...o,
            formatted_time: new Date(o.created_at).toLocaleString()
        }));

        return res.json({ success: true, orders: formatted });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * POST: /api/deposit
 * User submits a deposit request
 */
router.post('/deposit', requireAuth, async (req, res) => {
    const { method, amount, tx_id, screenshot_url } = req.body;

    if (!method || !amount || !tx_id) {
        return res.json({ success: false, message: 'Missing payment details.' });
    }

    if (isMock || !supabase) {
        const newMockDep = {
            id: `DEP-${Math.floor(100000 + Math.random() * 900000)}`,
            user_id: req.user.id,
            user_email: req.user.email,
            method,
            amount: parseFloat(amount),
            tx_id,
            screenshot_url,
            status: 'PENDING',
            created_at: new Date().toISOString()
        };
        mockDeposits.unshift(newMockDep);
        return res.json({ success: true });
    }

    try {
        const { error } = await supabase
            .from('deposits')
            .insert([{
                user_id: req.user.id,
                method,
                amount: parseFloat(amount),
                tx_id,
                screenshot_url,
                status: 'PENDING'
            }]);

        if (error) {
            if (error.code === '23505') {
                return res.json({ success: false, message: 'This Transaction ID (TxID) has already been submitted.' });
            }
            return res.json({ success: false, message: error.message });
        }

        return res.json({ success: true });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * GET: /api/deposit/history
 */
router.get('/deposit/history', requireAuth, async (req, res) => {
    if (isMock || !supabase) {
        const userDeps = mockDeposits.filter(d => d.user_id === req.user.id);
        return res.json({ success: true, deposits: userDeps });
    }

    try {
        const { data, error } = await supabase
            .from('deposits')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) return res.json({ success: false, message: error.message });
        return res.json({ success: true, deposits: data });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * ====================================================================
 *                 ADMIN CONTEXT PORTAL ENDPOINTS
 * ====================================================================
 */

/**
 * GET: /api/admin/deposits
 */
router.get('/admin/deposits', requireAdmin, async (req, res) => {
    if (isMock || !supabase) {
        const pending = mockDeposits.filter(d => d.status === 'PENDING');
        return res.json({ success: true, deposits: pending });
    }

    try {
        // Query deposits table and join profiles to get user email
        const { data, error } = await supabase
            .from('deposits')
            .select(`
                id,
                user_id,
                method,
                amount,
                tx_id,
                screenshot_url,
                status,
                created_at,
                profiles (
                    email
                )
            `)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: true });

        if (error) return res.json({ success: false, message: error.message });

        const mapped = data.map(d => ({
            id: d.id,
            user_id: d.user_id,
            user_email: d.profiles ? d.profiles.email : 'Unknown Partner',
            method: d.method,
            amount: d.amount,
            tx_id: d.tx_id,
            screenshot_url: d.screenshot_url,
            status: d.status,
            created_at: d.created_at
        }));

        return res.json({ success: true, deposits: mapped });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * GET: /api/admin/deposits/history
 * Retrieve completed deposit history logs (APPROVED, REJECTED, ADMIN_DIRECT)
 */
router.get('/admin/deposits/history', requireAdmin, async (req, res) => {
    if (isMock || !supabase) {
        const history = mockDeposits.filter(d => d.status !== 'PENDING');
        return res.json({ success: true, deposits: history });
    }

    try {
        const { data, error } = await supabase
            .from('deposits')
            .select(`
                id,
                user_id,
                method,
                amount,
                tx_id,
                screenshot_url,
                status,
                created_at,
                profiles (
                    email
                )
            `)
            .neq('status', 'PENDING')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) return res.json({ success: false, message: error.message });

        const mapped = data.map(d => ({
            id: d.id,
            user_id: d.user_id,
            user_email: d.profiles ? d.profiles.email : 'Unknown Partner',
            method: d.method,
            amount: d.amount,
            tx_id: d.tx_id,
            screenshot_url: d.screenshot_url,
            status: d.status,
            created_at: d.created_at
        }));

        return res.json({ success: true, deposits: mapped });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * POST: /api/admin/deposit/action
 */
router.post('/admin/deposit/action', requireAdmin, async (req, res) => {
    const { deposit_id, action } = req.body; // action: APPROVED or REJECTED

    if (!deposit_id || !action || !['APPROVED', 'REJECTED'].includes(action)) {
        return res.json({ success: false, message: 'Invalid deposit review action.' });
    }

    if (isMock || !supabase) {
        const idx = mockDeposits.findIndex(d => d.id === deposit_id);
        if (idx !== -1) {
            mockDeposits[idx].status = action;
            if (action === 'APPROVED') {
                mockBalance += mockDeposits[idx].amount; // increase mock balance
            }
            return res.json({ success: true });
        }
        return res.json({ success: false, message: 'Deposit request not found.' });
    }

    try {
        // 1. Fetch deposit record details
        const { data: dep, error: fetchErr } = await supabase
            .from('deposits')
            .select('*')
            .eq('id', deposit_id)
            .maybeSingle();

        if (fetchErr || !dep) {
            return res.json({ success: false, message: 'Deposit request not found.' });
        }

        if (dep.status !== 'PENDING') {
            return res.json({ success: false, message: 'This deposit has already been processed.' });
        }

        // 2. Transaction update
        if (action === 'APPROVED') {
            // Load user profile
            const { data: prof } = await supabase
                .from('profiles')
                .select('balance')
                .eq('id', dep.user_id)
                .maybeSingle();

            const currentBal = prof ? parseFloat(prof.balance) : 0.000;
            const targetBal = currentBal + parseFloat(dep.amount);

            // Increment profile balance
            const { error: profErr } = await supabase
                .from('profiles')
                .update({ balance: targetBal })
                .eq('id', dep.user_id);

            if (profErr) {
                return res.json({ success: false, message: 'Failed to increment user balance profile.' });
            }
        }

        // Update deposit status
        const { error: depErr } = await supabase
            .from('deposits')
            .update({ status: action })
            .eq('id', deposit_id);

        if (depErr) return res.json({ success: false, message: depErr.message });

        return res.json({ success: true });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * GET: /api/admin/orders
 */
router.get('/admin/orders', requireAdmin, async (req, res) => {
    if (isMock || !supabase) {
        const { user_email } = req.query;
        let filtered = mockOrders;
        if (user_email && user_email.trim() !== '') {
            filtered = mockOrders.filter(o => o.user_email === user_email.trim());
        }
        return res.json({ success: true, orders: filtered });
    }

    try {
        const { user_email } = req.query;
        let query = supabase
            .from('orders')
            .select(`
                order_id,
                country,
                service,
                number,
                otp,
                status,
                price,
                created_at,
                profiles (
                    email
                )
            `);

        if (user_email && user_email.trim() !== '') {
            query = supabase
                .from('orders')
                .select(`
                    order_id,
                    country,
                    service,
                    number,
                    otp,
                    status,
                    price,
                    created_at,
                    profiles!inner (
                        email
                    )
                `)
                .eq('profiles.email', user_email.trim());
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) return res.json({ success: false, message: error.message });

        const mapped = data.map(o => ({
            user_email: o.profiles ? o.profiles.email : 'Unknown',
            order_id: o.order_id,
            service: o.service,
            country: o.country,
            number: o.number,
            otp: o.otp,
            status: o.status,
            price: o.price,
            created_at: o.created_at
        }));

        return res.json({ success: true, orders: mapped });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * POST: /api/admin/services/update
 */
router.post('/admin/services/update', requireAdmin, async (req, res) => {
    const { service_id, cost_price, sell_price } = req.body;

    if (!service_id || isNaN(cost_price) || isNaN(sell_price)) {
        return res.json({ success: false, message: 'Please provide valid service code and pricing inputs.' });
    }

    if (isMock || !supabase) {
        const idx = mockServices.findIndex(s => s.code === service_id);
        if (idx !== -1) {
            mockServices[idx].price = parseFloat(sell_price);
            mockServices[idx].cost_price = parseFloat(cost_price);
            return res.json({ success: true });
        }
        return res.json({ success: false, message: 'Mock service not found.' });
    }

    try {
        const { data: sRow } = await supabase
            .from('services')
            .select('id')
            .eq('service_id', service_id)
            .maybeSingle();

        if (sRow) {
            // Update
            const { error } = await supabase
                .from('services')
                .update({ cost_price: parseFloat(cost_price), sell_price: parseFloat(sell_price) })
                .eq('service_id', service_id);

            if (error) return res.json({ success: false, message: error.message });
        } else {
            // Insert new configured pricing row
            const { error } = await supabase
                .from('services')
                .insert([{
                    service_id,
                    group_name: 'Custom Admin',
                    app_name: 'App ' + service_id,
                    cost_price: parseFloat(cost_price),
                    sell_price: parseFloat(sell_price),
                    stock: 100
                }]);

            if (error) return res.json({ success: false, message: error.message });
        }

        return res.json({ success: true });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * POST: /api/admin/services/bulk-update
 */
router.post('/admin/services/bulk-update', requireAdmin, async (req, res) => {
    const { markup_percent, group_name } = req.body;

    if (isNaN(markup_percent) || parseFloat(markup_percent) < 0) {
        return res.json({ success: false, message: 'Please enter a valid positive markup percentage.' });
    }

    const markupMultiplier = 1 + (parseFloat(markup_percent) / 100);

    if (isMock || !supabase) {
        mockServices.forEach(s => {
            if (!group_name || s.group_id === group_name) {
                s.price = s.cost_price * markupMultiplier;
            }
        });
        return res.json({ success: true });
    }

    try {
        // Fetch current live stock/goods to get fresh cost prices
        const goodsUrl = `${apiBase.replace(/\/$/, '')}/api/v1/goods?key=${encodeURIComponent(apiToken)}`;
        const response = await makeRequest(goodsUrl);
        
        let apiServices = [];
        if (response) {
            try {
                const json = JSON.parse(response);
                if (json.code === 200 && Array.isArray(json.data)) {
                    json.data.forEach(group => {
                        group.list.forEach(item => {
                            apiServices.push({
                                code: item.id.toString(),
                                name: item.name,
                                cost_price: parseFloat(item.unit_price) * 278.50,
                                group_name: group.group_name
                            });
                        });
                    });
                }
            } catch (e) {
                console.error('Failed to parse live goods response in bulk-update:', e.message);
            }
        }

        const { data: dbServices } = await supabase.from('services').select('*');
        const updatePromises = [];

        if (apiServices.length > 0) {
            for (const s of apiServices) {
                if (group_name && s.group_name !== group_name) {
                    continue;
                }
                const sellPrice = s.cost_price * markupMultiplier;
                const dbMatch = dbServices.find(db => db.service_id === s.code);
                
                if (dbMatch) {
                    updatePromises.push(
                        supabase
                            .from('services')
                            .update({ cost_price: s.cost_price, sell_price: sellPrice })
                            .eq('service_id', s.code)
                    );
                } else {
                    updatePromises.push(
                        supabase
                            .from('services')
                            .insert([{
                                service_id: s.code,
                                group_name: s.group_name,
                                app_name: s.name,
                                cost_price: s.cost_price,
                                sell_price: sellPrice,
                                stock: 0
                            }])
                    );
                }
            }
        } else {
            // If API fetch is offline, bulk adjust using cost prices stored in DB
            for (const db of dbServices) {
                if (group_name && db.group_name !== group_name) {
                    continue;
                }
                const sellPrice = parseFloat(db.cost_price) * markupMultiplier;
                updatePromises.push(
                    supabase
                        .from('services')
                        .update({ sell_price: sellPrice })
                        .eq('service_id', db.service_id)
                );
            }
        }

        await Promise.all(updatePromises);
        return res.json({ success: true });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * GET: /api/admin/profiles
 */
router.get('/admin/profiles', requireAdmin, async (req, res) => {
    if (isMock || !supabase) {
        return res.json({ success: true, admins: [{ id: '00000000-0000-0000-0000-000000000000', email: 'partner@novatix.com', created_at: new Date().toISOString() }] });
    }
    try {
        const { data, error } = await supabase
            .from('admin_profiles')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) return res.json({ success: false, message: error.message });
        return res.json({ success: true, admins: data });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * POST: /api/admin/profiles/add
 */
router.post('/admin/profiles/add', requireAdmin, async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.json({ success: false, message: 'Please specify the email to add.' });
    }
    const cleanEmail = email.trim().toLowerCase();

    if (isMock || !supabase) {
        return res.json({ success: true, message: 'Added admin profile (Mock Mode).' });
    }

    try {
        const { data: userProfile, error: userError } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (userError || !userProfile) {
            return res.json({ success: false, message: 'User profile with this email was not found. They must sign up first.' });
        }

        const { error: insertError } = await supabase
            .from('admin_profiles')
            .insert([{ id: userProfile.id, email: userProfile.email }]);

        if (insertError) {
            if (insertError.code === '23505') {
                return res.json({ success: false, message: 'This user is already an admin.' });
            }
            return res.json({ success: false, message: insertError.message });
        }

        return res.json({ success: true });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * POST: /api/admin/profiles/remove
 */
router.post('/admin/profiles/remove', requireAdmin, async (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.json({ success: false, message: 'Missing user ID.' });
    }

    if (req.user.id === id) {
        return res.json({ success: false, message: 'You cannot revoke your own admin permissions.' });
    }

    if (isMock || !supabase) {
        return res.json({ success: true });
    }

    try {
        const { error } = await supabase
            .from('admin_profiles')
            .delete()
            .eq('id', id);

        if (error) return res.json({ success: false, message: error.message });
        return res.json({ success: true });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});


/**
 * POST: /api/user/rotate-key
 * Generate or Rotate Developer API key
 */
router.post('/user/rotate-key', requireAuth, async (req, res) => {
    // Generate secure random string
    const newKey = 'nova_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    if (isMock || !supabase) {
        return res.json({ success: true, api_key: newKey });
    }

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ api_key: newKey })
            .eq('id', req.user.id);

        if (error) return res.json({ success: false, message: error.message });

        return res.json({ success: true, api_key: newKey });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * RESELLER API: GET /api/v1/info
 */
router.get('/v1/info', async (req, res) => {
    const { key } = req.query;
    if (!key) {
        return res.json({ code: 500, data: [], message: '密钥不能为空' });
    }

    if (isMock || !supabase) {
        return res.json({
            code: 200,
            data: { id: 111, username: 'mock_reseller', balance: mockBalance.toFixed(3) },
            message: 'OK'
        });
    }

    try {
        const { data: prof, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('api_key', key)
            .maybeSingle();

        if (error || !prof) {
            return res.json({ code: 500, data: [], message: 'Invalid API Key' });
        }

        return res.json({
            code: 200,
            data: {
                id: prof.id,
                username: prof.email,
                balance: parseFloat(prof.balance).toFixed(3)
            },
            message: 'OK'
        });
    } catch (e) {
        return res.json({ code: 500, data: [], message: e.message });
    }
});

/**
 * RESELLER API: GET /api/v1/get (Buy Number)
 */
router.get('/v1/get', async (req, res) => {
    const { key, id } = req.query;
    if (!key || !id) {
        return res.json({ code: 500, data: [], message: 'Missing parameters (key and id are required)' });
    }

    if (isMock || !supabase) {
        const mockMatch = mockServices.find(s => s.code === id);
        const price = mockMatch ? mockMatch.price : 0.500;
        
        if (mockBalance < price) {
            return res.json({ code: 500, data: [], message: 'No balance' });
        }
        mockBalance -= price;
        const randDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        
        return res.json({
            code: 200,
            data: {
                sn: `MOCK-${Math.floor(100000 + Math.random() * 900000)}-${Date.now()}`,
                number: [`+1${randDigits}`]
            },
            message: 'OK'
        });
    }

    try {
        const { data: prof, error: profErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('api_key', key)
            .maybeSingle();

        if (profErr || !prof) {
            return res.json({ code: 500, data: [], message: 'Invalid API Key' });
        }

        const { data: sRow } = await supabase
            .from('services')
            .select('*')
            .eq('service_id', id)
            .maybeSingle();

        if (!sRow) {
            return res.json({ code: 500, data: [], message: 'Product not supported or offline' });
        }

        const sellPrice = parseFloat(sRow.sell_price);
        const balance = parseFloat(prof.balance);
        if (balance < sellPrice) {
            return res.json({ code: 500, data: [], message: 'No balance' });
        }

        const buyUrl = `${apiBase.replace(/\/$/, '')}/api/v1/get?key=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(id)}&num=1&time=4`;
        const buyResponse = await makeRequest(buyUrl);

        if (!buyResponse) {
            return res.json({ code: 500, data: [], message: 'Gateway timeout' });
        }

        const buyJson = JSON.parse(buyResponse);
        if (buyJson.code !== 200 || !buyJson.data || !buyJson.data.sn) {
            return res.json({ code: 500, data: [], message: buyJson.message || 'Gateway purchase failed' });
        }

        const orderId = buyJson.data.sn;
        const number = buyJson.data.number[0];
        let smsUrl = null;

        const orderUrl = `${apiBase.replace(/\/$/, '')}/api/v1/order?key=${encodeURIComponent(apiToken)}&sn=${encodeURIComponent(orderId)}`;
        const orderResponse = await makeRequest(orderUrl);
        if (orderResponse && orderResponse.includes('|')) {
            const parts = orderResponse.split('|');
            if (parts.length >= 2) {
                smsUrl = parts[1].trim();
            }
        }

        const newBalance = balance - sellPrice;
        await supabase
            .from('profiles')
            .update({
                balance: newBalance,
                spend: balance - newBalance + parseFloat(prof.spend || 0),
                total_orders: 1 + parseInt(prof.total_orders || 0)
            })
            .eq('id', prof.id);

        await supabase
            .from('orders')
            .insert([{
                order_id: orderId,
                user_id: prof.id,
                country: sRow.group_name,
                service: sRow.app_name,
                number: number,
                status: 'PENDING',
                price: sellPrice,
                sms_url: smsUrl,
                product_id: id
            }]);

        return res.json({
            code: 200,
            data: {
                sn: orderId,
                number: [number]
            },
            message: 'OK'
        });
    } catch (e) {
        return res.json({ code: 500, data: [], message: e.message });
    }
});

/**
 * RESELLER API: GET /api/v1/msg (Get SMS)
 */
router.get('/v1/msg', async (req, res) => {
    const { key, id, number } = req.query;
    if (!key || !id || !number) {
        return res.json({ code: 500, data: [], message: 'Missing parameters (key, id and number are required)' });
    }

    if (isMock || !supabase) {
        return res.json({
            code: 200,
            data: {
                time: new Date().toISOString().replace('T', ' ').substring(0, 19),
                msg: `[Verification] Your OTP code is ${Math.floor(1000 + Math.random() * 9000)}`,
                from: number
            },
            message: 'OK'
        });
    }

    try {
        const { data: prof, error: profErr } = await supabase
            .from('profiles')
            .select('id')
            .eq('api_key', key)
            .maybeSingle();

        if (profErr || !prof) {
            return res.json({ code: 500, data: [], message: 'Invalid API Key' });
        }

        const cleanedNumber = number.replace(/\s+/g, '');
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', prof.id)
            .eq('product_id', id)
            .ilike('number', `%${cleanedNumber}%`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (orderErr || !order) {
            return res.json({ code: 500, data: [], message: 'Order matching this number not found' });
        }

        if (order.status === 'COMPLETED' && order.otp) {
            return res.json({
                code: 200,
                data: {
                    time: new Date(order.created_at).toISOString().replace('T', ' ').substring(0, 19),
                    msg: `Your verification code is ${order.otp}`,
                    from: order.number
                },
                message: 'OK'
            });
        }

        let status = 'PENDING';
        let otp = null;
        let smsText = 'No message';

        if (order.sms_url) {
            const response = await makeRequest(order.sms_url);
            if (response) {
                const match = response.match(/\b\d{4,8}\b/);
                if (match) {
                    status = 'COMPLETED';
                    otp = match[0];
                    smsText = response;
                }
            }
        } else {
            const msgUrl = `${apiBase.replace(/\/$/, '')}/api/v1/msg?key=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(id)}&number=${encodeURIComponent(cleanedNumber)}`;
            const response = await makeRequest(msgUrl);
            if (response) {
                try {
                    const json = JSON.parse(response);
                    if (json.code === 200 && json.data && json.data.msg) {
                        const match = json.data.msg.match(/\b\d{4,8}\b/);
                        if (match) {
                            status = 'COMPLETED';
                            otp = match[0];
                            smsText = json.data.msg;
                        }
                    }
                } catch (e) {}
            }
        }

        if (status === 'COMPLETED') {
            await supabase
                .from('orders')
                .update({ status: 'COMPLETED', otp: otp })
                .eq('order_id', order.order_id);

            return res.json({
                code: 200,
                data: {
                    time: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    msg: smsText,
                    from: order.number
                },
                message: 'OK'
            });
        }

        return res.json({
            code: 222,
            data: [],
            message: 'No message'
        });
    } catch (e) {
        return res.json({ code: 500, data: [], message: e.message });
    }
});

/**
 * ====================================================================
 *                 USER PROFILE SETTINGS & SUPPORT TICKETS
 * ====================================================================
 */

// Local Memory for Support Tickets Mock Mode
let mockTickets = [];
let mockTicketMessages = [];

/**
 * POST: /api/user/settings
 * Update profile details (Name)
 */
router.post('/user/settings', requireAuth, async (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') {
        return res.json({ success: false, message: 'Name cannot be empty.' });
    }

    if (isMock || !supabase) {
        return res.json({ success: true, message: 'Settings saved locally.' });
    }

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ name: name.trim() })
            .eq('id', req.user.id);

        if (error) return res.json({ success: false, message: error.message });
        return res.json({ success: true });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * POST: /api/user/currency
 * Save user currency preference to profiles table
 */
router.post('/user/currency', requireAuth, async (req, res) => {
    const { currency } = req.body;
    if (!currency || !['PKR', 'USD', 'INR', 'BDT', 'NPR', 'RUB'].includes(currency)) {
        return res.json({ success: false, message: 'Invalid currency selection.' });
    }

    if (isMock || !supabase) {
        return res.json({ success: true });
    }

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ currency })
            .eq('id', req.user.id);

        if (error) return res.json({ success: false, message: error.message });
        return res.json({ success: true });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * POST: /api/tickets
 * Create a new support ticket and send initial message
 */
router.post('/tickets', requireAuth, async (req, res) => {
    const { title, category, message } = req.body;
    if (!title || !category || !message) {
        return res.json({ success: false, message: 'All fields are required.' });
    }

    if (isMock || !supabase) {
        const ticketId = mockTickets.length + 1;
        const newTicket = {
            id: ticketId,
            user_id: req.user.id,
            title,
            category,
            status: 'OPEN',
            created_at: new Date().toISOString()
        };
        const newMessage = {
            id: mockTicketMessages.length + 1,
            ticket_id: ticketId,
            sender_id: req.user.id,
            sender_email: req.user.email,
            message,
            created_at: new Date().toISOString()
        };
        mockTickets.unshift(newTicket);
        mockTicketMessages.push(newMessage);
        return res.json({ success: true, ticket_id: ticketId });
    }

    try {
        // Insert ticket
        const { data: ticket, error: ticketErr } = await supabase
            .from('tickets')
            .insert([{
                user_id: req.user.id,
                title,
                category,
                status: 'OPEN'
            }])
            .select()
            .maybeSingle();

        if (ticketErr || !ticket) {
            return res.json({ success: false, message: ticketErr.message });
        }

        // Insert initial message
        const { error: msgErr } = await supabase
            .from('ticket_messages')
            .insert([{
                ticket_id: ticket.id,
                sender_id: req.user.id,
                message
            }]);

        if (msgErr) {
            return res.json({ success: false, message: msgErr.message });
        }

        return res.json({ success: true, ticket_id: ticket.id });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * GET: /api/tickets
 * List user support tickets
 */
router.get('/tickets', requireAuth, async (req, res) => {
    if (isMock || !supabase) {
        const userTickets = mockTickets.filter(t => t.user_id === req.user.id);
        return res.json({ success: true, tickets: userTickets });
    }

    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) return res.json({ success: false, message: error.message });
        return res.json({ success: true, tickets: data });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * GET: /api/tickets/:id/messages
 * Get message history of a support ticket
 */
router.get('/tickets/:id/messages', requireAuth, async (req, res) => {
    const ticketId = parseInt(req.params.id);

    if (isMock || !supabase) {
        const ticketMessages = mockTicketMessages.filter(m => m.ticket_id === ticketId);
        return res.json({ success: true, messages: ticketMessages });
    }

    try {
        // Retrieve ticket and verify owner
        const { data: ticket } = await supabase
            .from('tickets')
            .select('user_id')
            .eq('id', ticketId)
            .maybeSingle();

        if (!ticket || ticket.user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Fetch messages with sender email
        const { data, error } = await supabase
            .from('ticket_messages')
            .select(`
                id,
                ticket_id,
                sender_id,
                message,
                created_at,
                profiles (
                    email
                )
            `)
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (error) return res.json({ success: false, message: error.message });

        const mapped = data.map(m => ({
            id: m.id,
            ticket_id: m.ticket_id,
            sender_id: m.sender_id,
            sender_email: m.profiles ? m.profiles.email : 'System Support',
            message: m.message,
            created_at: m.created_at
        }));

        return res.json({ success: true, messages: mapped });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * POST: /api/tickets/:id/messages
 * Send message in ticket chat
 */
router.post('/tickets/:id/messages', requireAuth, async (req, res) => {
    const ticketId = parseInt(req.params.id);
    const { message } = req.body;

    if (!message || message.trim() === '') {
        return res.json({ success: false, message: 'Message cannot be empty.' });
    }

    if (isMock || !supabase) {
        const newMessage = {
            id: mockTicketMessages.length + 1,
            ticket_id: ticketId,
            sender_id: req.user.id,
            sender_email: req.user.email,
            message: message.trim(),
            created_at: new Date().toISOString()
        };
        mockTicketMessages.push(newMessage);
        return res.json({ success: true });
    }

    try {
        // Verify owner
        const { data: ticket } = await supabase
            .from('tickets')
            .select('user_id')
            .eq('id', ticketId)
            .maybeSingle();

        if (!ticket || ticket.user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Insert message
        const { error } = await supabase
            .from('ticket_messages')
            .insert([{
                ticket_id: ticketId,
                sender_id: req.user.id,
                message: message.trim()
            }]);

        if (error) return res.json({ success: false, message: error.message });
        return res.json({ success: true });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
});

/**
 * POST: /api/admin/deposits/direct
 * Direct Admin Deposit: Credits balance to a specific user using email or UUID.
 */
router.post('/admin/deposits/direct', requireAuth, async (req, res) => {
    if (isMock || !supabase) {
        const { user_identifier, amount, tx_id, comments } = req.body;
        mockBalance += parseFloat(amount);
        return res.json({ success: true, message: 'Direct deposit executed, mock balance credited.' });
    }

    try {
        // 1. Verify admin permissions
        const { data: adminProfile } = await supabase
            .from('admin_profiles')
            .select('id')
            .eq('id', req.user.id)
            .maybeSingle();

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', req.user.id)
            .maybeSingle();

        const is_admin = (profile.role && profile.role.toLowerCase() === 'admin') || !!adminProfile;
        if (!is_admin) {
            return res.status(403).json({ success: false, message: 'Unauthorized: Admin access required.' });
        }

        const { user_identifier, amount, tx_id, comments } = req.body;
        const depositAmount = parseFloat(amount);

        if (!user_identifier || isNaN(depositAmount) || depositAmount <= 0) {
            return res.json({ success: false, message: 'Please specify a valid user identifier and amount.' });
        }

        // 2. Resolve targeted user profile (by UUID or Email)
        let query = supabase.from('profiles').select('*');
        if (user_identifier.includes('@')) {
            query = query.eq('email', user_identifier.trim());
        } else {
            query = query.eq('id', user_identifier.trim());
        }
        
        const { data: targetUser, error: targetError } = await query.maybeSingle();
        if (targetError || !targetUser) {
            return res.json({ success: false, message: 'Target user profile not found.' });
        }

        // 3. Update User Balance
        const newBalance = parseFloat(targetUser.balance || 0) + depositAmount;
        const { error: balanceUpdateError } = await supabase
            .from('profiles')
            .update({ balance: newBalance })
            .eq('id', targetUser.id);

        if (balanceUpdateError) {
            console.error('Failed to credit user balance:', balanceUpdateError.message);
            return res.json({ success: false, message: 'Balance credit update transaction failed.' });
        }

        // 4. Record deposit logs as APPROVED and ADMIN_DIRECT method
        const generatedTxId = tx_id || `ADM-${Date.now()}`;
        const finalComments = comments || 'Direct deposit by admin';
        
        const { error: logError } = await supabase
            .from('deposits')
            .insert([{
                user_id: targetUser.id,
                user_email: targetUser.email,
                amount: depositAmount,
                method: 'ADMIN_DIRECT',
                tx_id: generatedTxId,
                screenshot_url: null,
                status: 'APPROVED',
                created_at: new Date().toISOString()
            }]);

        if (logError) {
            console.error('Direct deposit log failed:', logError.message);
        }

        return res.json({ success: true, message: `Deposit of ₨ ${depositAmount.toFixed(2)} completed successfully.` });
    } catch (e) {
        console.error('Direct deposit error:', e.message);
        return res.json({ success: false, message: 'Execution error: ' + e.message });
    }
});

/**
 * GET: /api/admin/settings
 * Retrieve the current system configurations (OTP Expiry timeout limit).
 */
router.get('/admin/settings', requireAuth, async (req, res) => {
    if (isMock || !supabase) {
        return res.json({ success: true, otp_expiry_duration: 5 });
    }

    try {
        // Verify admin
        const { data: adminProfile } = await supabase
            .from('admin_profiles')
            .select('id')
            .eq('id', req.user.id)
            .maybeSingle();

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', req.user.id)
            .maybeSingle();

        const is_admin = (profile.role && profile.role.toLowerCase() === 'admin') || !!adminProfile;
        if (!is_admin) {
            return res.status(403).json({ success: false, message: 'Unauthorized: Admin access required.' });
        }

        const { data: configRow } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'otp_expiry_duration')
            .maybeSingle();
 
        const duration = configRow ? parseInt(configRow.value) : 4;
        return res.json({ success: true, otp_expiry_duration: duration });
    } catch (e) {
        return res.json({ success: false, message: 'Failed to retrieve settings: ' + e.message });
    }
});

/**
 * POST: /api/admin/settings
 * Update global system settings (OTP timeout duration).
 */
router.post('/admin/settings', requireAuth, async (req, res) => {
    if (isMock || !supabase) {
        return res.json({ success: true, message: 'Mock settings updated.' });
    }

    try {
        // Verify admin
        const { data: adminProfile } = await supabase
            .from('admin_profiles')
            .select('id')
            .eq('id', req.user.id)
            .maybeSingle();

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', req.user.id)
            .maybeSingle();

        const is_admin = (profile.role && profile.role.toLowerCase() === 'admin') || !!adminProfile;
        if (!is_admin) {
            return res.status(403).json({ success: false, message: 'Unauthorized: Admin access required.' });
        }

        const { duration } = req.body;
        const durationVal = parseInt(duration);

        if (isNaN(durationVal) || durationVal < 1) {
            return res.json({ success: false, message: 'Please specify a valid positive countdown timeout duration in minutes.' });
        }

        const { data: existing } = await supabase
            .from('settings')
            .select('key')
            .eq('key', 'otp_expiry_duration')
            .maybeSingle();
 
        if (existing) {
            const { error: updError } = await supabase
                .from('settings')
                .update({ value: durationVal.toString() })
                .eq('key', 'otp_expiry_duration');
            if (updError) throw updError;
        } else {
            const { error: insError } = await supabase
                .from('settings')
                .insert([{
                    key: 'otp_expiry_duration',
                    value: durationVal.toString()
                }]);
            if (insError) throw insError;
        }

        return res.json({ success: true, message: 'System settings configurations saved successfully!' });
    } catch (e) {
        return res.json({ success: false, message: 'Failed to save settings: ' + e.message });
    }
});

/**
 * GET: /api/admin/users
 * Retrieve list of all user profiles (UUID, email, name) for manual admin actions.
 */
router.get('/admin/users', requireAuth, async (req, res) => {
    if (isMock || !supabase) {
        return res.json({
            success: true,
            users: [
                { id: 'mock-1', email: 'admin@gmail.com', name: 'Super Admin' },
                { id: 'mock-2', email: 'partner@gmail.com', name: 'Zain Partner' }
            ]
        });
    }

    try {
        // Verify admin
        const { data: adminProfile } = await supabase
            .from('admin_profiles')
            .select('id')
            .eq('id', req.user.id)
            .maybeSingle();

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', req.user.id)
            .maybeSingle();

        const is_admin = (profile.role && profile.role.toLowerCase() === 'admin') || !!adminProfile;
        if (!is_admin) {
            return res.status(403).json({ success: false, message: 'Unauthorized: Admin access required.' });
        }

        const { data: users, error } = await supabase
            .from('profiles')
            .select('id, email, name')
            .order('email', { ascending: true });

        if (error) throw error;

        return res.json({ success: true, users: users || [] });
    } catch (e) {
        console.error('Failed to load user list:', e.message);
        return res.json({ success: false, message: 'Failed to retrieve user list: ' + e.message });
    }
});

/**
 * GET: /api/admin/stats
 * Get comprehensive business performance statistics for the admin dashboard
 */
router.get('/admin/stats', requireAdmin, async (req, res) => {
    if (isMock || !supabase) {
        return res.json({
            success: true,
            stats: {
                total_liability: 3500.00,
                orders_today: 12,
                revenue_today: 450.00,
                cost_today: 320.00,
                profit_today: 130.00,
                orders_lifetime: 145,
                revenue_lifetime: 5400.00,
                cost_lifetime: 3800.00,
                profit_lifetime: 1600.00
            }
        });
    }

    try {
        const { data: statsRow, error: statsError } = await supabase
            .from('admin_overview')
            .select('*')
            .maybeSingle();

        if (statsError || !statsRow) {
            console.warn('Failed to query admin_overview view, falling back to manual liability calculation:', statsError ? statsError.message : 'No data returned');
            // Fallback manual profiles balance count to prevent crash if view is not configured yet
            const { data: profiles } = await supabase.from('profiles').select('balance');
            const totalLiability = profiles ? profiles.reduce((acc, curr) => acc + parseFloat(curr.balance || 0), 0) : 0;
            return res.json({
                success: true,
                stats: {
                    total_liability: totalLiability,
                    orders_today: 0,
                    revenue_today: 0.00,
                    cost_today: 0.00,
                    profit_today: 0.00,
                    orders_lifetime: 0,
                    revenue_lifetime: 0.00,
                    cost_lifetime: 0.00,
                    profit_lifetime: 0.00
                }
            });
        }

        const tLiability = parseFloat(statsRow.total_liability || 0);
        const oToday = parseInt(statsRow.orders_today || 0);
        const rToday = parseFloat(statsRow.revenue_today || 0);
        const cToday = parseFloat(statsRow.cost_today || 0);
        
        const oLifetime = parseInt(statsRow.orders_lifetime || 0);
        const rLifetime = parseFloat(statsRow.revenue_lifetime || 0);
        const cLifetime = parseFloat(statsRow.cost_lifetime || 0);

        return res.json({
            success: true,
            stats: {
                total_liability: tLiability,
                orders_today: oToday,
                revenue_today: rToday,
                cost_today: cToday,
                profit_today: rToday - cToday,
                orders_lifetime: oLifetime,
                revenue_lifetime: rLifetime,
                cost_lifetime: cLifetime,
                profit_lifetime: rLifetime - cLifetime
            }
        });
    } catch (e) {
        console.error('Stats aggregation failed:', e.message);
        return res.json({ success: false, message: 'Failed to aggregate statistics: ' + e.message });
    }
});

export default router;
