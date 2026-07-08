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
                .eq('user_id', user.id)
                .maybeSingle();

            if (error) {
                return NextResponse.json({ success: false, message: `Database read error: ${error.message}` });
            }

            if (!data) {
                return NextResponse.json({ success: false, message: 'Order not found in DB.' });
            }

            if (data.status !== 'PENDING') {
                return NextResponse.json({ success: true, status: data.status, otp: data.otp });
            }

            orderRow = data;
            if (data.sms_url) {
                targetSmsUrl = data.sms_url;
                isManualLink = true;
            }
        } else {
            const localIdx = mockOrders.findIndex(o => o.order_id === order_id && o.user_id === user.id);
            if (localIdx === -1) {
                return NextResponse.json({ success: false, message: 'Mock order not found.' });
            }
            if (mockOrders[localIdx].status !== 'PENDING') {
                return NextResponse.json({ success: true, status: mockOrders[localIdx].status, otp: mockOrders[localIdx].otp });
            }
            orderRow = mockOrders[localIdx];
            if (mockOrders[localIdx].sms_url) {
                targetSmsUrl = mockOrders[localIdx].sms_url;
                isManualLink = true;
            }
        }

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

        if (status === 'PENDING') {
            const elapsedSec = (Date.now() - new Date(orderRow.created_at).getTime()) / 1000;
            if (elapsedSec > 300) {
                status = 'EXPIRED';
                otp = 'Not Received';
            }
        }

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

        return NextResponse.json({ success: true, status, otp });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
