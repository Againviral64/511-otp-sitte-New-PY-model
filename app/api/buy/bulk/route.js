import { NextResponse } from 'next/server';
import supabase, { isMock, apiBase, apiToken, makeRequest, mockServices, mockOrders } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';
import { checkRateLimit, RATE_LIMITS, getClientKey } from '@/lib/rate-limit';

// Extend timeout for Next.js serverless function (bulk can take long with many orders)
export const maxDuration = 120;

// Extended timeout version of makeRequest for bulk operations (25s vs 10s)
async function makeBulkRequest(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: AbortSignal.timeout(25000)
        });
        return await response.text();
    } catch (err) {
        console.error('[Bulk] makeBulkRequest error:', err.message);
        return null;
    }
}

function generateTrackingKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export async function POST(request) {
    try {
        // Rate limit check
        const clientKey = getClientKey(request);
        const limit = checkRateLimit(`buy:bulk:${clientKey}`, RATE_LIMITS.BUY.maxRequests, RATE_LIMITS.BUY.windowMs);
        if (!limit.allowed) {
            return NextResponse.json({ success: false, message: `Too many requests. Please wait ${Math.ceil(limit.retryAfterMs / 1000)} seconds.` }, { status: 429 });
        }

        const user = await verifyAuth(request);
        const { country, service, quantity } = await request.json();

        const qty = parseInt(quantity);
        if (!country || !service || isNaN(qty) || qty < 1 || qty > 100) {
            return NextResponse.json({ success: false, message: 'Invalid request parameters or quantity (must be 1-100).' });
        }

        let sellPrice = 0.500;
        let costPrice = 0.400;
        let appName = 'OTP App';
        let groupName = 'Operators Group';

        // 1. Fetch dynamic pricing from database services table
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
                return NextResponse.json({ success: false, message: 'This service product is currently unavailable.' });
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
        const totalCostPKR = sellPricePKR * qty;

        if (user.balance < totalCostPKR) {
            return NextResponse.json({ success: false, message: 'Insufficient balance. Please deposit funds.', error_type: 'LOW_BALANCE' });
        }

        const successfulOrders = [];
        const failedOrders = [];

        // 3. Purchase loop
        for (let i = 0; i < qty; i++) {
            let orderId = '';
            let number = '';
            let smsUrl = null;

            if (isMock) {
                const randDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
                number = `+1 ${randDigits.substring(0,3)}-${randDigits.substring(3,6)}-${randDigits.substring(6)}`;
                orderId = `MOCK-BLK-${Math.floor(100000 + Math.random() * 900000)}-${Date.now()}`;
                
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
                    sms_url: null,
                    product_id: service,
                    is_bulk: true,
                    created_at: new Date().toISOString()
                };
                mockOrders.unshift(newMockOrder);
                
                successfulOrders.push({
                    order_id: orderId,
                    number: number,
                    tracking_key: `MOCKKEY${Math.floor(10000 + Math.random() * 90000)}`
                });
            } else {
                // Call live gateway to buy a number
                const buyUrl = `${apiBase.replace(/\/$/, '')}/api/v1/get?key=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(service)}&num=1&time=4`;
                console.log(`[Bulk] Purchasing order ${i + 1}/${qty}, URL: ${buyUrl.replace(apiToken, '***')}`);
                const buyResponse = await makeBulkRequest(buyUrl);

                if (!buyResponse) {
                    console.error(`[Bulk] Order ${i + 1}: Gateway returned null/empty response (timeout)`);
                    failedOrders.push({ reason: 'API purchase gateway timed out.' });
                    continue;
                }

                console.log(`[Bulk] Order ${i + 1} raw response: ${buyResponse.substring(0, 300)}`);

                try {
                    const buyJson = JSON.parse(buyResponse);
                    if (buyJson.code === 200 && buyJson.data && buyJson.data.sn) {
                        orderId = buyJson.data.sn;
                        let rawNum = buyJson.data.number[0];
                        if (rawNum && !rawNum.startsWith('+')) {
                            rawNum = '+' + rawNum;
                        }
                        number = rawNum;
                        console.log(`[Bulk] Order ${i + 1} SUCCESS: ID=${orderId}, Number=${number}`);
                    } else {
                        console.error(`[Bulk] Order ${i + 1} FAILED: code=${buyJson.code}, message=${buyJson.message}`);
                        failedOrders.push({ reason: buyJson.message || 'Gateway purchase failed.' });
                        continue;
                    }
                } catch (e) {
                    console.error(`[Bulk] Order ${i + 1} JSON PARSE ERROR: ${e.message}, raw: ${buyResponse.substring(0, 200)}`);
                    failedOrders.push({ reason: 'Gateway error matching purchase response format.' });
                    continue;
                }

                // Fetch Order checking URL immediately
                const orderUrl = `${apiBase.replace(/\/$/, '')}/api/v1/order?key=${encodeURIComponent(apiToken)}&sn=${encodeURIComponent(orderId)}`;
                const orderResponse = await makeBulkRequest(orderUrl);
                if (orderResponse && orderResponse.includes('|')) {
                    const parts = orderResponse.split('|');
                    if (parts.length >= 2) {
                        smsUrl = parts[1].trim();
                    }
                }

                // Save Order in Supabase immediately so Python poller can see it
                let trackingKey = generateTrackingKey();
                let orderSaved = false;
                let saveRetries = 0;
                const maxSaveRetries = 3;

                while (!orderSaved && saveRetries < maxSaveRetries) {
                    saveRetries++;
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
                            sms_url: smsUrl,
                            product_id: service,
                            tracking_key: trackingKey
                        }]);

                    if (orderError) {
                        console.error(`[Bulk] Failed to save order ${orderId} (attempt ${saveRetries}):`, orderError.message);
                        if (orderError.message && orderError.message.includes('duplicate') && saveRetries < maxSaveRetries) {
                            // Tracking key collision — generate a new one and retry
                            trackingKey = generateTrackingKey();
                            continue;
                        }
                        if (saveRetries >= maxSaveRetries) {
                            failedOrders.push({ reason: `Database save error after ${maxSaveRetries} attempts.` });
                        }
                    } else {
                        orderSaved = true;
                        successfulOrders.push({
                            order_id: orderId,
                            number: number,
                            tracking_key: trackingKey
                        });
                    }
                }
            }

            // Small delay between gateway calls to avoid rate limiting
            if (i < qty - 1 && !isMock) {
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        }

        // 4. Update balance for successfully placed orders
        const successfulCount = successfulOrders.length;
        if (successfulCount > 0) {
            const actualCostPKR = sellPricePKR * successfulCount;
            const newBalance = user.balance - actualCostPKR;

            if (!isMock && supabase) {
                const { error: balanceError } = await supabase
                    .from('profiles')
                    .update({
                        balance: newBalance,
                        spend: actualCostPKR + parseFloat(user.spend || 0),
                        total_orders: successfulCount + parseInt(user.total_orders || 0)
                    })
                    .eq('id', user.id);

                if (balanceError) {
                    console.error('Failed to update bulk order user balance:', balanceError.message);
                }
            }
        }

        return NextResponse.json({
            success: true,
            successfulCount: successfulCount,
            failedCount: failedOrders.length,
            orders: successfulOrders,
            price_each: sellPricePKR
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
