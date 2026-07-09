import { NextResponse } from 'next/server';
import supabase, { isMock, mockDeposits } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function GET(request) {
    try {
        await verifyAdmin(request);

        if (isMock || !supabase) {
            const history = mockDeposits.filter(d => d.status !== 'PENDING');
            return NextResponse.json({ success: true, deposits: history });
        }

        const { data, error } = await supabase
            .from('deposits')
            .select(`
                id,
                user_id,
                method,
                amount,
                currency,
                tx_id,
                screenshot_url,
                status,
                created_at,
                profiles (
                    email
                )
            `)
            .neq('status', 'PENDING')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) return NextResponse.json({ success: false, message: error.message });

        const mapped = data.map(d => ({
            id: d.id,
            user_id: d.user_id,
            user_email: d.profiles ? d.profiles.email : 'Unknown Partner',
            method: d.method,
            amount: d.amount,
            currency: d.currency || 'USD',
            tx_id: d.tx_id,
            screenshot_url: d.screenshot_url,
            status: d.status,
            created_at: d.created_at
        }));

        return NextResponse.json({ success: true, deposits: mapped });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
