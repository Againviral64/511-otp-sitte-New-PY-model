import { NextResponse } from 'next/server';
import supabase, { isMock, apiBase, apiToken, makeRequest, mockOrders } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function GET(request) {
    try {
        const user = await verifyAuth(request);
        const searchParams = new URL(request.url).searchParams;
        const order_id = searchParams.get('order_id');

        if (!order_id) {
            return NextResponse.json({ success: false, message: 'Missing order_id parameters' });
        }

        if (isMock || !supabase) {
            const localIdx = mockOrders.findIndex(o => o.order_id === order_id && o.user_id === user.id);
            if (localIdx === -1) {
                return NextResponse.json({ success: false, message: 'Mock order not found.' });
            }
            const orderRow = mockOrders[localIdx];
            if (orderRow.status === 'PENDING') {
                const elapsed = (Date.now() - new Date(orderRow.created_at).getTime()) / 1000;
                if (elapsed >= 10 && elapsed <= 300) {
                    orderRow.status = 'COMPLETED';
                    orderRow.otp = `${Math.floor(100000 + Math.random() * 900000)}`;
                    orderRow.full_message = `[Mock Service] Your verification code is ${orderRow.otp}.`;
                    orderRow.received_at = new Date().toISOString();
                }
            }
            const displayStatus = orderRow.status === 'CANCELLED' ? 'REFUNDED' : orderRow.status;
            
            const mock_sms_messages = [];
            if (orderRow.status === 'COMPLETED' && orderRow.full_message) {
                mock_sms_messages.push({
                    text: orderRow.full_message,
                    otp: orderRow.otp,
                    time: orderRow.received_at || new Date().toISOString()
                });
            }

            return NextResponse.json({
                success: true,
                status: displayStatus,
                otp: orderRow.status === 'COMPLETED' ? orderRow.otp : null,
                full_message: orderRow.full_message || null,
                sms_messages: mock_sms_messages,
                tracking_key: orderRow.tracking_key || 'MOCKKEY12345'
            });
        }

        // Fetch direct from Supabase
        const { data: order, error } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', order_id)
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ success: false, message: `Database read error: ${error.message}` });
        }

        if (!order) {
            return NextResponse.json({ success: false, message: 'Order not found in DB.' });
        }

        let displayStatus = order.status === 'CANCELLED' ? 'REFUNDED' : order.status;
        
        // Build messages list — try message_1..10 columns first, fall back to sms_messages JSONB
        const sms_messages = [];
        for (let i = 1; i <= 10; i++) {
            const msgVal = order[`message_${i}`];
            if (msgVal) {
                // Parse OTP from message
                const otpMatch = msgVal.match(/\b\d{4,8}\b/);
                const msgOtp = otpMatch ? otpMatch[0] : null;
                sms_messages.push({
                    text: msgVal,
                    otp: msgOtp,
                    time: order.created_at
                });
            }
        }
        if (sms_messages.length === 0 && Array.isArray(order.sms_messages)) {
            sms_messages.push(...order.sms_messages);
        }

        // Determine displayOtp: from the latest message or fall back to order.otp
        let displayOtp = (order.otp === '------' || order.otp === 'Not Received' || order.otp === 'Waiting...' || !order.otp) ? null : order.otp;
        if (sms_messages.length > 0) {
            const latestMsg = sms_messages[sms_messages.length - 1];
            if (latestMsg.otp) {
                displayOtp = latestMsg.otp;
            }
            if (displayStatus !== 'REFUNDED') {
                displayStatus = 'COMPLETED';
            }

            // Self-heal DB status to COMPLETED
            if (order.status === 'PENDING') {
                supabase
                    .from('orders')
                    .update({ status: 'COMPLETED', otp: displayOtp || order.otp })
                    .eq('order_id', order_id)
                    .then(({ error }) => {
                        if (error) console.error('Failed to self-heal order status to COMPLETED:', error);
                    });
            }
        }

        return NextResponse.json({
            success: true,
            status: displayStatus,
            otp: displayOtp,
            full_message: sms_messages.length > 0 ? sms_messages[sms_messages.length - 1].text : (order.full_message || null),
            sms_messages: sms_messages,
            tracking_key: order.tracking_key
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
