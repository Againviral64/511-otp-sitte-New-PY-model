import { NextResponse } from 'next/server';
import supabase, { isMock, mockOrders } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function GET(request) {
    try {
        await verifyAdmin(request);
        const searchParams = new URL(request.url).searchParams;
        const user_email = searchParams.get('user_email');

        if (isMock || !supabase) {
            let filtered = mockOrders;
            if (user_email && user_email.trim() !== '') {
                filtered = mockOrders.filter(o => o.user_email === user_email.trim());
            }
            return NextResponse.json({ success: true, orders: filtered });
        }

        let query = supabase
            .from('orders')
            .select(`
                order_id,
                country,
                service,
                number,
                otp,
                status,
                price,
                created_at,
                profiles (
                    email
                )
            `);

        if (user_email && user_email.trim() !== '') {
            const { data: targetProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', user_email.trim())
                .maybeSingle();

            if (targetProfile) {
                query = query.eq('user_id', targetProfile.id);
            } else {
                return NextResponse.json({ success: true, orders: [] });
            }
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            return NextResponse.json({ success: false, message: error.message });
        }

        const mapped = data.map(o => ({
            order_id: o.order_id,
            country: o.country,
            service: o.service,
            number: o.number,
            otp: o.otp,
            status: o.status,
            price: o.price,
            created_at: o.created_at,
            user_email: o.profiles ? o.profiles.email : 'Unknown'
        }));

        return NextResponse.json({ success: true, orders: mapped });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
