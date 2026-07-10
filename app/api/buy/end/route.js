import { NextResponse } from 'next/server';
import supabase, { isMock, mockOrders } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function POST(request) {
    try {
        const user = await verifyAuth(request);
        const body = await request.json();
        const { order_id } = body;

        if (!order_id) {
            return NextResponse.json({ success: false, message: 'Missing order_id' });
        }

        if (isMock || !supabase) {
            const idx = mockOrders.findIndex(o => o.order_id === order_id && o.user_id === user.id);
            if (idx === -1) {
                return NextResponse.json({ success: false, message: 'Mock order not found' });
            }
            const order = mockOrders[idx];
            const finalStatus = (order.otp && order.otp !== '------' && order.otp !== 'Not Received') ? 'COMPLETED' : 'PENDING';
            const finalOtpVal = finalStatus === 'COMPLETED' ? order.otp : null;
            mockOrders[idx].status = finalStatus;
            mockOrders[idx].otp = finalOtpVal;
            return NextResponse.json({ success: true, status: finalStatus, otp: finalOtpVal });
        }

        const { data: order, error: fetchErr } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', order_id)
            .eq('user_id', user.id)
            .maybeSingle();

        if (fetchErr || !order) {
            return NextResponse.json({ success: false, message: 'Order not found in database' });
        }

        const finalStatus = (order.otp && order.otp !== '------' && order.otp !== 'Not Received') ? 'COMPLETED' : 'PENDING';
        const finalOtpVal = finalStatus === 'COMPLETED' ? order.otp : null;

        const { error: updateErr } = await supabase
            .from('orders')
            .update({ status: finalStatus, otp: finalOtpVal })
            .eq('order_id', order_id);

        if (updateErr) {
            return NextResponse.json({ success: false, message: updateErr.message });
        }

        return NextResponse.json({ success: true, status: finalStatus, otp: finalOtpVal });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
