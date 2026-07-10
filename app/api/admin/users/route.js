import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function GET(request) {
    try {
        await verifyAdmin(request);

        if (isMock || !supabase) {
            return NextResponse.json({
                success: true,
                users: [
                    { id: 'mock-1', email: 'admin@gmail.com', name: 'Super Admin', role: 'admin', balance: 3500.0, status: 'ACTIVE', created_at: new Date().toISOString() },
                    { id: 'mock-2', email: 'partner@gmail.com', name: 'Zain Partner', role: 'user', balance: 120.0, status: 'ACTIVE', created_at: new Date().toISOString() },
                    { id: 'mock-3', email: 'spammer@gmail.com', name: 'Abusive User', role: 'user', balance: 0.0, status: 'BANNED', created_at: new Date().toISOString() }
                ]
            });
        }

        let { data, error } = await supabase
            .from('profiles')
            .select('id, email, name, role, balance, status, created_at')
            .order('email', { ascending: true });

        // Resilient fallback if user has not run migration schema yet
        if (error && error.message.includes('column "status" does not exist')) {
            const fallback = await supabase
                .from('profiles')
                .select('id, email, name, role, balance, created_at')
                .order('email', { ascending: true });
            
            if (fallback.error) throw fallback.error;
            data = fallback.data.map(u => ({ ...u, status: 'ACTIVE' }));
        } else if (error) {
            throw error;
        }

        return NextResponse.json({ success: true, users: data || [] });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}

export async function POST(request) {
    try {
        await verifyAdmin(request);
        const { user_id, action, status, amount, reason } = await request.json();

        if (!user_id || !action) {
            return NextResponse.json({ success: false, message: 'Missing user_id or action.' });
        }

        if (isMock || !supabase) {
            return NextResponse.json({ success: true });
        }

        if (action === 'TOGGLE_STATUS') {
            if (!status || !['ACTIVE', 'SUSPENDED', 'BANNED'].includes(status)) {
                return NextResponse.json({ success: false, message: 'Invalid status value.' });
            }
            const { error } = await supabase
                .from('profiles')
                .update({ status: status })
                .eq('id', user_id);

            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        if (action === 'ADJUST_BALANCE') {
            const adjAmount = parseFloat(amount);
            if (isNaN(adjAmount) || adjAmount === 0) {
                return NextResponse.json({ success: false, message: 'Invalid amount value.' });
            }

            const { data: prof, error: getErr } = await supabase
                .from('profiles')
                .select('balance')
                .eq('id', user_id)
                .maybeSingle();

            if (getErr || !prof) {
                return NextResponse.json({ success: false, message: 'User profile not found.' });
            }

            const newBal = parseFloat(prof.balance || 0) + adjAmount;
            const { error: updateErr } = await supabase
                .from('profiles')
                .update({ balance: newBal })
                .eq('id', user_id);

            if (updateErr) throw updateErr;

            // Log adjustment inside manual deposits tracking table (Base amount is in USD equiv)
            // Divide by 278.50 to get USD value
            const { error: logErr } = await supabase
                .from('deposits')
                .insert([{
                    user_id: user_id,
                    method: 'ADMIN_ADJUSTMENT',
                    amount: adjAmount / 278.50,
                    tx_id: `ADJ-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
                    status: 'APPROVED',
                    payment_note: reason || 'Manual Admin Balance Adjustment'
                }]);

            if (logErr) {
                console.error('Failed to log admin balance adjustment to deposits:', logErr.message);
            }

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false, message: 'Unsupported user action.' });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
