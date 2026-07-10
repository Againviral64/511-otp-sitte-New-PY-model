import { NextResponse } from 'next/server';
import supabase, { isMock, mockOrders } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function GET(request) {
    try {
        const user = await verifyAuth(request);
        const searchParams = new URL(request.url).searchParams;
        const page = Math.max(1, parseInt(searchParams.get('page')) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit')) || 50));
        const offset = (page - 1) * limit;

        if (isMock || !supabase) {
            const userMockOrders = mockOrders.filter(o => o.user_id === user.id);
            const paginated = userMockOrders.slice(offset, offset + limit);
            const formatted = paginated.map(o => ({
                ...o,
                formatted_time: new Date(o.created_at).toLocaleString()
            }));
            return NextResponse.json({ success: true, orders: formatted, page, total: userMockOrders.length });
        }

        const { data, error, count } = await supabase
            .from('orders')
            .select('*', { count: 'exact' })
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            return NextResponse.json({ success: false, message: error.message });
        }

        const formatted = data.map(o => ({
            ...o,
            formatted_time: new Date(o.created_at).toLocaleString()
        }));

        return NextResponse.json({ success: true, orders: formatted, page, total: count || 0 });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
