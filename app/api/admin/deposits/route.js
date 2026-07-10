import { NextResponse } from 'next/server';
import supabase, { isMock, mockDeposits } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function GET(request) {
    try {
        await verifyAdmin(request);

        if (isMock || !supabase) {
            const pending = mockDeposits.filter(d => d.status === 'PENDING');
            return NextResponse.json({ success: true, deposits: pending });
        }

        let data, error;
        const { data: selectData, error: selectErr } = await supabase
            .from('deposits')
            .select('*, profiles(email)')
            .eq('status', 'PENDING')
            .order('created_at', { ascending: true });
        
        data = selectData;
        error = selectErr;

        if (error) return NextResponse.json({ success: false, message: error.message });

        const mapped = data.map(d => ({
            id: d.id,
            user_id: d.user_id,
            user_email: d.profiles ? d.profiles.email : 'Unknown Partner',
            method: d.method,
            amount: d.amount,
            currency: d.currency || 'USD',
            tx_id: d.account_name !== undefined ? d.account_name : d.tx_id,
            screenshot_url: d.screenshot_url,
            proof_image: d.proof_image || d.screenshot_url || null,
            payment_note: d.payment_note || null,
            status: d.status,
            created_at: d.created_at
        }));

        return NextResponse.json({ success: true, deposits: mapped });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
