import { NextResponse } from 'next/server';
import supabase, { isMock, mockDeposits } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function POST(request) {
    try {
        const user = await verifyAuth(request);
        const { method, amount, tx_id, screenshot_url, currency } = await request.json();

        if (!method || !amount || !tx_id) {
            return NextResponse.json({ success: false, message: 'Missing payment details.' });
        }

        if (isMock || !supabase) {
            const newMockDep = {
                id: `DEP-${Math.floor(100000 + Math.random() * 900000)}`,
                user_id: user.id,
                user_email: user.email,
                method,
                amount: parseFloat(amount),
                currency: currency || 'USD',
                tx_id,
                screenshot_url,
                status: 'PENDING',
                created_at: new Date().toISOString()
            };
            mockDeposits.unshift(newMockDep);
            return NextResponse.json({ success: true });
        }

        let insertErr;
        try {
            const { error } = await supabase
                .from('deposits')
                .insert([{
                    user_id: user.id,
                    method,
                    amount: parseFloat(amount),
                    currency: currency || 'USD',
                    tx_id,
                    screenshot_url,
                    status: 'PENDING'
                }]);
            insertErr = error;
        } catch (dbErr) {
            const { error } = await supabase
                .from('deposits')
                .insert([{
                    user_id: user.id,
                    method,
                    amount: parseFloat(amount),
                    tx_id,
                    screenshot_url,
                    status: 'PENDING'
                }]);
            insertErr = error;
        }

        if (insertErr) {
            if (insertErr.code === '23505') {
                return NextResponse.json({ success: false, message: 'This Transaction ID (TxID) has already been submitted.' });
            }
            return NextResponse.json({ success: false, message: insertErr.message });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
