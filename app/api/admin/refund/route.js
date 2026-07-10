import { NextResponse } from 'next/server';
import supabase, { isMock, mockOrders, mockBalance } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function POST(request) {
    try {
        await verifyAdmin(request);
        const { order_id } = await request.json();

        if (!order_id) {
            return NextResponse.json({ success: false, message: 'Missing order_id parameters.' });
        }

        if (isMock || !supabase) {
            const idx = mockOrders.findIndex(o => o.order_id === order_id);
            if (idx === -1) {
                return NextResponse.json({ success: false, message: 'Mock order not found.' });
            }
            if (mockOrders[idx].status !== 'PENDING' && mockOrders[idx].status !== 'EXPIRED') {
                return NextResponse.json({ success: false, message: `Only PENDING or EXPIRED orders can be refunded. Current status is ${mockOrders[idx].status}.` });
            }
            mockOrders[idx].status = 'CANCELLED'; // Translated to REFUNDED in UI
            // In mock mode, update the mockBalance (which resides globally in local memory)
            // Note: Since mockBalance is exported from db.js as 'export let mockBalance = 3500.000',
            // mutating it here would require a setter. However, we can also modify profiles in database.
            // But in Mock mode there is no DB, so let's check: how can we increment the simulated balance?
            // Actually, let's export a setter in db.js if we want to change it. But wait!
            // Do we have to update mockBalance? Let's check: in Mock mode, is the balance read from somewhere else?
            // Yes, let's see. If we can't mutate mockBalance because it's a read-only import binding,
            // wait, we can just define a helper or update the profile object if it was mock.
            // Wait, we can mutate standard object properties, but mockBalance is a primitive number.
            // Let's check: is there a mock users profiles store?
            // Let's check verifyAuth in lib/middleware.js. It returns:
            // `{ id: '00000000-0000-0000-0000-000000000000', email: 'partner@novatix.com', role: 'admin', balance: 3500.0, currency: 'PKR' }`
            // So mock balance is hardcoded in verifyAuth mock response anyway!
            // But we should still update the order status in mockOrders.
            return NextResponse.json({ success: true, message: 'Mock order refunded successfully!' });
        }

        // Fetch order from DB to verify it is PENDING
        const { data: order, error: fetchErr } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', order_id)
            .maybeSingle();

        if (fetchErr || !order) {
            return NextResponse.json({ success: false, message: 'Order not found in database.' });
        }

        if (order.status !== 'PENDING' && order.status !== 'EXPIRED') {
            return NextResponse.json({ success: false, message: `Only PENDING or EXPIRED orders can be refunded. Current status is ${order.status}.` });
        }

        // Retrieve user profile to update wallet
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('balance, spend, total_orders')
            .eq('id', order.user_id)
            .maybeSingle();

        if (profileErr || !profile) {
            return NextResponse.json({ success: false, message: 'User profile not found.' });
        }

        // Perform transaction logic
        // 1. Mark order as CANCELLED (which maps to REFUNDED)
        const { error: updateOrderErr } = await supabase
            .from('orders')
            .update({ status: 'CANCELLED' })
            .eq('order_id', order_id);

        if (updateOrderErr) {
            return NextResponse.json({ success: false, message: `Failed to update order status: ${updateOrderErr.message}` });
        }

        // 2. Refund wallet balance and update profile stats
        const { error: updateProfileErr } = await supabase
            .from('profiles')
            .update({
                balance: parseFloat(profile.balance) + parseFloat(order.price),
                spend: Math.max(0, parseFloat(profile.spend) - parseFloat(order.price)),
                total_orders: Math.max(0, parseInt(profile.total_orders) - 1)
            })
            .eq('id', order.user_id);

        if (updateProfileErr) {
            // Rollback order status update if profile fails
            await supabase
                .from('orders')
                .update({ status: 'PENDING' })
                .eq('order_id', order_id);

            return NextResponse.json({ success: false, message: `Failed to update user profile: ${updateProfileErr.message}` });
        }

        return NextResponse.json({ success: true, message: 'Order refunded successfully.' });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
