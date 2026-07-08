import { NextResponse } from 'next/server';
import supabase, { isMock, apiBase, apiToken, makeRequest, mockServices, mockOrders } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function POST(request) {
    try {
        const user = await verifyAuth(request);
        const { country, service } = await request.json();

        if (!country || !service) {
            return NextResponse.json({ success: false, message: 'Please select both Category and Service.' });
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
                return NextResponse.json({ success: false, message: 'This service product is currently unavailable.' });
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
        if (user.balance < sellPricePKR) {
            return NextResponse.json({ success: false, message: 'Insufficient balance. Please deposit funds.', error_type: 'LOW_BALANCE' });
        }

        let orderId = '';
        let number = '';
        let smsUrl = null;

        if (isMock) {
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
                sms_url: null,
                product_id: service,
                created_at: new Date().toISOString()
            };
            mockOrders.unshift(newMockOrder);
        } else {
            // Call live gateway to buy a number (use lease code time=4 for Whatsapp/FB rent lease length)
            const buyUrl = `${apiBase.replace(/\/$/, '')}/api/v1/get?key=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(service)}&num=1&time=4`;
            const buyResponse = await makeRequest(buyUrl);

            if (!buyResponse) {
                return NextResponse.json({ success: false, message: 'API purchase gateway timed out.' });
            }

            try {
                const buyJson = JSON.parse(buyResponse);
                if (buyJson.code === 200 && buyJson.data && buyJson.data.sn) {
                    orderId = buyJson.data.sn;
                    number = buyJson.data.number[0];
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
                    product_id: service
                }]);

            if (orderError) {
                console.error('Failed to save user order details:', orderError.message);
            }
        }

        return NextResponse.json({
            success: true,
            order_id: orderId,
            country: isMock ? 'United States' : groupName,
            service: appName,
            number: number,
            price: sellPricePKR.toFixed(3),
            sms_url: smsUrl
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
