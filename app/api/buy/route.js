import { NextResponse } from 'next/server';
import supabase, { isMock, apiBase, apiToken, makeRequest, mockServices, mockOrders, resolveBestTime } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';
import { checkRateLimit, RATE_LIMITS, getClientKey } from '@/lib/rate-limit';
import { sanitizeText } from '@/lib/sanitize';

// Track recent purchases per user to prevent duplicate orders
const recentPurchases = new Map();

export async function POST(request) {
    try {
        const user = await verifyAuth(request);
        const body = await request.json();
        const { country, service, is_bulk } = body;

        // Rate limit check (relaxed if is_bulk is true)
        const clientKey = getClientKey(request);
        const maxReqs = is_bulk ? 120 : RATE_LIMITS.BUY.maxRequests;
        const limit = checkRateLimit(`buy:${clientKey}`, maxReqs, RATE_LIMITS.BUY.windowMs);
        if (!limit.allowed) {
            return NextResponse.json({ success: false, message: `Too many purchase requests. Please wait ${Math.ceil(limit.retryAfterMs / 1000)} seconds.` }, { status: 429 });
        }

        if (!country || !service) {
            return NextResponse.json({ success: false, message: 'Please select both Category and Service.' });
        }

        // Duplicate order prevention: 30-second cooldown per user+service (bypass for bulk)
        const purchaseKey = `${user.id}:${service}`;
        const lastPurchase = recentPurchases.get(purchaseKey);
        if (!is_bulk && lastPurchase && Date.now() - lastPurchase < 30000) {
            const waitSec = Math.ceil((30000 - (Date.now() - lastPurchase)) / 1000);
            return NextResponse.json({ success: false, message: `Please wait ${waitSec} seconds before buying the same service again.` });
        }

        let sellPrice = 0.500;
        let costPrice = 0.400;
        let appName = 'OTP App';
        let groupName = 'Operators Group';
        let pkrRate = 278.50; // default fallback

        // 1. Fetch dynamic pricing from database services table
        let expiryDuration = 4;
        let validityPeriod = 4;
        let numberSegment = null;
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
                validityPeriod = sRow.validity_period || 4;
                numberSegment = sRow.number_segment || null;
            } else {
                return NextResponse.json({ success: false, message: 'This service product is currently unavailable.' });
            }

            // Fetch dynamic system expiry config & exchange rate from settings table
            try {
                const { data: configRows } = await supabase
                    .from('settings')
                    .select('key, value')
                    .in('key', ['otp_expiry_duration', 'exchange_rate_PKR']);

                if (configRows) {
                    const expiryRow = configRows.find(r => r.key === 'otp_expiry_duration');
                    const rateRow = configRows.find(r => r.key === 'exchange_rate_PKR');
                    if (expiryRow) {
                        expiryDuration = parseInt(expiryRow.value) || 4;
                    }
                    if (rateRow) {
                        const parsedRate = parseFloat(rateRow.value);
                        if (!isNaN(parsedRate)) {
                            pkrRate = parsedRate;
                        }
                    }
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
        const sellPricePKR = sellPrice * pkrRate;
        if (user.balance < sellPricePKR) {
            return NextResponse.json({ success: false, message: 'Insufficient balance. Please deposit funds.', error_type: 'LOW_BALANCE' });
        }

        let orderId = '';
        let number = '';
        let smsUrl = null;

        // Check if custom stock is available in stock_adding table in Supabase first!
        let customStockItem = null;
        if (!isMock && supabase) {
            try {
                const { data: stockCandidate } = await supabase
                    .from('stock_adding')
                    .select('*')
                    .eq('service_id', service.toString())
                    .eq('status', 'available')
                    .order('id', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (stockCandidate) {
                    // Claim stock item atomically
                    const { data: claimedItem, error: claimErr } = await supabase
                        .from('stock_adding')
                        .update({
                            status: 'used',
                            used_at: new Date().toISOString()
                        })
                        .eq('id', stockCandidate.id)
                        .eq('status', 'available')
                        .select()
                        .maybeSingle();

                    if (!claimErr && claimedItem) {
                        customStockItem = claimedItem;
                    }
                }
            } catch (err) {
                console.error('Error querying custom stock_adding table:', err.message);
            }
        }

        if (customStockItem) {
            orderId = `MANUAL-${Math.floor(100000 + Math.random() * 900000)}-${Date.now()}`;
            number = customStockItem.phone_number;
            smsUrl = customStockItem.sms_url;

            // Move out of stock_adding table by deleting the claimed row
            try {
                await supabase
                    .from('stock_adding')
                    .delete()
                    .eq('id', customStockItem.id);
            } catch (err) {
                console.error('Failed to delete claimed stock_adding row:', err.message);
            }
        } else if (isMock) {
            const randDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
            number = `+1 ${randDigits.substring(0,3)}-${randDigits.substring(3,6)}-${randDigits.substring(6)}`;
            orderId = `MOCK-${Math.floor(100000 + Math.random() * 900000)}-${Date.now()}`;
            
            const newMockOrder = {
                order_id: orderId,
                user_id: user.id,
                user_email: user.email,
                country: 'United States',
                service: appName,
                number: number,
                otp: null,
                status: 'PENDING',
                price: sellPricePKR,
                cost_price: costPrice,
                sms_url: null,
                is_bulk: is_bulk === true,
                created_at: new Date().toISOString()
            };
            mockOrders.unshift(newMockOrder);
        } else {
            // Call live gateway to buy a number
            let buyUrl = `${apiBase.replace(/\/$/, '')}/api/v1/get?key=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(service)}&num=1&time=${validityPeriod}`;
            if (numberSegment && numberSegment.trim() !== '') {
                const seg = numberSegment.trim();
                buyUrl += `&phone=${encodeURIComponent(seg)}&prefix=${encodeURIComponent(seg)}&segment=${encodeURIComponent(seg)}`;
            }
            const buyResponse = await makeRequest(buyUrl);

            if (!buyResponse) {
                return NextResponse.json({ success: false, message: 'API purchase gateway timed out.' });
            }

            try {
                const buyJson = JSON.parse(buyResponse);
                if (buyJson.code === 200 && buyJson.data && buyJson.data.sn) {
                    orderId = buyJson.data.sn;
                    let rawNum = buyJson.data.number[0];
                    if (rawNum && !rawNum.startsWith('+')) {
                        rawNum = '+' + rawNum;
                    }
                    number = rawNum;
                } else {
                    return NextResponse.json({ success: false, message: buyJson.message || 'Gateway purchase failed.' });
                }
            } catch (e) {
                return NextResponse.json({ success: false, message: 'Gateway error matching purchase response format.' });
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

        let trackingKey = 'MOCKKEY12345';

        // 3. Save Order and Deduct User Balance in Transaction
        if (!isMock && supabase) {
            const newBalance = user.balance - sellPricePKR;

            const { error: balanceError } = await supabase
                .from('profiles')
                .update({
                    balance: newBalance,
                    spend: user.balance - newBalance + parseFloat(user.spend || 0),
                    total_orders: 1 + parseInt(user.total_orders || 0)
                })
                .eq('id', user.id);

            if (balanceError) {
                console.error('Failed to deduct user balance:', balanceError.message);
                return NextResponse.json({ success: false, message: 'Payment deduction error.' });
            }

            trackingKey = (() => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                let result = '';
                for (let i = 0; i < 12; i++) {
                    result += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return result;
            })();

            const { error: orderError } = await supabase
                .from('orders')
                .insert([{
                    order_id: orderId,
                    user_id: user.id,
                    country: groupName,
                    service: appName,
                    number: number,
                    status: 'PENDING',
                    price: sellPricePKR,
                    cost_price: costPrice,
                    sms_url: smsUrl,
                    product_id: service,
                    tracking_key: trackingKey
                }]);

            if (orderError) {
                console.error('Failed to save user order details:', orderError.message);
            }
        }

        // Record successful purchase for cooldown tracking
        recentPurchases.set(purchaseKey, Date.now());

        return NextResponse.json({
            success: true,
            order_id: orderId,
            country: isMock ? 'United States' : groupName,
            service: appName,
            number: number,
            price: sellPricePKR.toFixed(3),
            sms_url: smsUrl,
            tracking_key: trackingKey
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
