import { NextResponse } from 'next/server';
import supabase, { isMock, mockDeposits } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function POST(request) {
    try {
        await verifyAdmin(request);
        const { deposit_id, action } = await request.json();

        if (!deposit_id || !action || !['APPROVED', 'REJECTED'].includes(action)) {
            return NextResponse.json({ success: false, message: 'Invalid deposit review action.' });
        }

        if (isMock || !supabase) {
            const idx = mockDeposits.findIndex(d => d.id === deposit_id);
            if (idx !== -1) {
                mockDeposits[idx].status = action;
                return NextResponse.json({ success: true });
            }
            return NextResponse.json({ success: false, message: 'Deposit request not found.' });
        }

        const { data: dep, error: fetchErr } = await supabase
            .from('deposits')
            .select('*')
            .eq('id', deposit_id)
            .maybeSingle();

        if (fetchErr || !dep) {
            return NextResponse.json({ success: false, message: 'Deposit request not found.' });
        }

        if (dep.status !== 'PENDING') {
            return NextResponse.json({ success: false, message: 'This deposit has already been processed.' });
        }

        if (action === 'APPROVED') {
            const { data: prof } = await supabase
                .from('profiles')
                .select('balance')
                .eq('id', dep.user_id)
                .maybeSingle();

            const exchangeRates = {
                PKR: 278.50,
                USD: 1.0,
                INR: 83.40,
                BDT: 117.20,
                NPR: 133.50,
                RUB: 88.30
            };

            const depositCurrency = dep.currency || 'USD';
            const rate = exchangeRates[depositCurrency] || 1.0;
            const pkrAmountToAdd = parseFloat(dep.amount) * (278.50 / rate);

            const currentBal = prof ? parseFloat(prof.balance) : 0.000;
            const targetBal = currentBal + pkrAmountToAdd;

            const { error: profErr } = await supabase
                .from('profiles')
                .update({ balance: targetBal })
                .eq('id', dep.user_id);

            if (profErr) {
                return NextResponse.json({ success: false, message: 'Failed to increment user balance profile.' });
            }
        }

        const { error: depErr } = await supabase
            .from('deposits')
            .update({ status: action })
            .eq('id', deposit_id);

        if (depErr) return NextResponse.json({ success: false, message: depErr.message });

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
