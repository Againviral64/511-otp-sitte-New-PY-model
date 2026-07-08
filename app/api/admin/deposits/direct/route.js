import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function POST(request) {
    try {
        await verifyAdmin(request);
        const { user_identifier, amount, tx_id, comments } = await request.json();
        const depositAmount = parseFloat(amount);

        if (!user_identifier || isNaN(depositAmount) || depositAmount <= 0) {
            return NextResponse.json({ success: false, message: 'Please specify a valid user identifier and amount.' });
        }

        if (isMock || !supabase) {
            return NextResponse.json({ success: true, message: 'Direct deposit executed, mock balance credited.' });
        }

        let query = supabase.from('profiles').select('*');
        if (user_identifier.includes('@')) {
            query = query.eq('email', user_identifier.trim());
        } else {
            query = query.eq('id', user_identifier.trim());
        }
        
        const { data: targetUser, error: targetError } = await query.maybeSingle();
        if (targetError || !targetUser) {
            return NextResponse.json({ success: false, message: 'Target user profile not found.' });
        }

        const newBalance = parseFloat(targetUser.balance || 0) + depositAmount;
        const { error: balanceUpdateError } = await supabase
            .from('profiles')
            .update({ balance: newBalance })
            .eq('id', targetUser.id);

        if (balanceUpdateError) {
            console.error('Failed to credit user balance:', balanceUpdateError.message);
            return NextResponse.json({ success: false, message: 'Balance credit update transaction failed.' });
        }

        const generatedTxId = tx_id || `ADM-${Date.now()}`;
        const finalComments = comments || 'Direct deposit by admin';
        
        const { error: logError } = await supabase
            .from('deposits')
            .insert([{
                user_id: targetUser.id,
                user_email: targetUser.email,
                amount: depositAmount,
                method: 'ADMIN_DIRECT',
                tx_id: generatedTxId,
                screenshot_url: null,
                status: 'APPROVED',
                created_at: new Date().toISOString()
            }]);

        if (logError) {
            console.error('Direct deposit log insert warning:', logError.message);
        }

        return NextResponse.json({ success: true, message: 'Balance credited successfully!' });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
