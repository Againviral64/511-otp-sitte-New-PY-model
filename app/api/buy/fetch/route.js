import { NextResponse } from 'next/server';
import supabase, { isMock, mockOrders } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function POST(request) {
    try {
        const user = await verifyAuth(request);
        const { order_id } = await request.json();

        if (!order_id) {
            return NextResponse.json({ success: false, message: 'Missing order_id parameters.' });
        }

        if (isMock || !supabase) {
            const idx = mockOrders.findIndex(o => o.order_id === order_id && o.user_id === user.id);
            if (idx === -1) {
                return NextResponse.json({ success: false, message: 'Mock order not found.' });
            }
            if (mockOrders[idx].status === 'CANCELLED' || mockOrders[idx].status === 'REFUNDED') {
                return NextResponse.json({ success: false, message: 'This order has been refunded and cannot be fetched.' });
            }
            mockOrders[idx].status = 'PENDING';
            mockOrders[idx].created_at = new Date().toISOString();
            return NextResponse.json({ success: true, order: mockOrders[idx] });
        }

        // Fetch order from DB to check status
        const { data: order, error: fetchErr } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', order_id)
            .eq('user_id', user.id)
            .maybeSingle();

        if (fetchErr || !order) {
            return NextResponse.json({ success: false, message: 'Order not found in database.' });
        }

        if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
            return NextResponse.json({ success: false, message: 'This order has been refunded and cannot be fetched.' });
        }

        // Reset created_at so the timeout starts fresh, keep status as PENDING
        const { error: updateErr } = await supabase
            .from('orders')
            .update({ 
                created_at: new Date().toISOString(),
                status: 'PENDING'
            })
            .eq('order_id', order_id);

        if (updateErr) {
            return NextResponse.json({ success: false, message: updateErr.message });
        }

        // Return updated order
        const { data: updatedOrder, error: fetchUpdatedErr } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', order_id)
            .maybeSingle();

        if (fetchUpdatedErr || !updatedOrder) {
            return NextResponse.json({ success: false, message: 'Re-activated order details could not be retrieved.' });
        }

        return NextResponse.json({ success: true, order: updatedOrder });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
