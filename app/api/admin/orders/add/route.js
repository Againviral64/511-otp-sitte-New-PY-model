import { NextResponse } from 'next/server';
import supabase, { isMock, mockOrders } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

function generateTrackingKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateRandomSuffix(len = 4) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export async function POST(request) {
    try {
        const adminUser = await verifyAdmin(request);
        const body = await request.json();
        const { orders_text } = body;

        if (!orders_text || typeof orders_text !== 'string' || orders_text.trim() === '') {
            return NextResponse.json({ success: false, message: 'Please provide valid order entries.' });
        }

        const lines = orders_text.split('\n');
        const parsedEntries = [];

        for (let rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;

            const parts = line.split('|');
            if (parts.length >= 2) {
                let numPart = parts[0].trim().replace(/[\s\-]/g, '');
                let urlPart = parts.slice(1).join('|').trim();

                if (numPart.length >= 5 && urlPart.length >= 5) {
                    if (!numPart.startsWith('+')) {
                        numPart = '+' + numPart;
                    }
                    parsedEntries.push({
                        number: numPart,
                        sms_url: urlPart
                    });
                }
            }
        }

        if (parsedEntries.length === 0) {
            return NextResponse.json({
                success: false,
                message: 'No valid lines found. Expected format per line: +13092863999|https://sms-555.com/url_hash'
            });
        }

        // 1. Resolve Facebook service cost & price
        let appName = 'Facebook';
        let groupName = 'Social Media';
        let productId = '9';
        let costPrice = 0.400; // USD
        let sellPriceUSD = 0.500; // USD

        let pkrRate = 278.50;

        if (!isMock && supabase) {
            // Query Facebook service from services table
            const { data: services } = await supabase
                .from('services')
                .select('*');

            if (services && services.length > 0) {
                const fbService = services.find(s => 
                    (s.app_name && s.app_name.toLowerCase().includes('facebook')) ||
                    s.service_id === '9'
                );
                if (fbService) {
                    appName = fbService.app_name || 'Facebook';
                    groupName = fbService.group_name || 'Social Media';
                    productId = fbService.service_id || '9';
                    costPrice = parseFloat(fbService.cost_price || 0.400);
                    sellPriceUSD = parseFloat(fbService.sell_price || 0.500);
                }
            }

            // Fetch PKR exchange rate setting
            const { data: exchangeRateSetting } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'exchange_rate_PKR')
                .maybeSingle();

            if (exchangeRateSetting && !isNaN(parseFloat(exchangeRateSetting.value))) {
                pkrRate = parseFloat(exchangeRateSetting.value);
            }
        }

        const pricePKR = sellPriceUSD * pkrRate;

        // 2. Prepare orders array for batch insertion
        const timestamp = Date.now();
        const ordersToInsert = [];

        for (let idx = 0; idx < parsedEntries.length; idx++) {
            const entry = parsedEntries[idx];
            const orderId = `MANUAL-${timestamp}-${idx + 1}-${generateRandomSuffix(4)}`;
            const trackingKey = generateTrackingKey();

            ordersToInsert.push({
                order_id: orderId,
                user_id: adminUser.id,
                country: groupName,
                service: appName,
                number: entry.number,
                status: 'PENDING',
                price: pricePKR,
                cost_price: costPrice,
                sms_url: entry.sms_url,
                product_id: productId,
                tracking_key: trackingKey
            });
        }

        if (isMock || !supabase) {
            ordersToInsert.forEach(o => {
                mockOrders.unshift({
                    ...o,
                    user_email: adminUser.email,
                    created_at: new Date().toISOString()
                });
            });
            return NextResponse.json({
                success: true,
                message: `[MOCK MODE] Successfully added ${ordersToInsert.length} orders!`,
                added_count: ordersToInsert.length,
                orders: ordersToInsert
            });
        }

        // Batch insert into Supabase orders table
        const { data: insertedData, error: insertError } = await supabase
            .from('orders')
            .insert(ordersToInsert)
            .select();

        if (insertError) {
            console.error('Failed to insert manual bulk orders:', insertError.message);
            return NextResponse.json({
                success: false,
                message: `Failed to insert orders into database: ${insertError.message}`
            });
        }

        return NextResponse.json({
            success: true,
            message: `Successfully added ${ordersToInsert.length} orders to database!`,
            added_count: ordersToInsert.length,
            orders: insertedData || ordersToInsert
        });

    } catch (err) {
        console.error('Admin order-adding error:', err);
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
