import { NextResponse } from 'next/server';
import supabase, { isMock, mockOrders } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function GET(request) {
    try {
        const user = await verifyAuth(request);

        if (isMock || !supabase) {
            const userMockOrders = mockOrders.filter(o => o.user_id === user.id);
            const formatted = userMockOrders.map(o => ({
                ...o,
                formatted_time: new Date(o.created_at).toLocaleString()
            }));
            return NextResponse.json({ success: true, orders: formatted });
        }

        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            return NextResponse.json({ success: false, message: error.message });
        }

        const formatted = data.map(o => ({
            ...o,
            formatted_time: new Date(o.created_at).toLocaleString()
        }));

        return NextResponse.json({ success: true, orders: formatted });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
