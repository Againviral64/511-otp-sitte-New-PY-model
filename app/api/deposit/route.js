import { NextResponse } from 'next/server';
import supabase, { isMock, mockDeposits } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';
import { checkRateLimit, RATE_LIMITS, getClientKey } from '@/lib/rate-limit';
import { sanitizeText, sanitizeTxId, validateAmount } from '@/lib/sanitize';

export async function POST(request) {
    try {
        // Rate limit check
        const clientKey = getClientKey(request);
        const limit = checkRateLimit(`deposit:${clientKey}`, RATE_LIMITS.DEPOSIT.maxRequests, RATE_LIMITS.DEPOSIT.windowMs);
        if (!limit.allowed) {
            return NextResponse.json({ success: false, message: `Too many deposit requests. Please wait ${Math.ceil(limit.retryAfterMs / 1000)} seconds.` }, { status: 429 });
        }

        const user = await verifyAuth(request);
        const { method, amount, tx_id, screenshot_url, currency, proof_image, payment_note } = await request.json();

        if (!method || !amount) {
            if (!amount) {
                return NextResponse.json({ success: false, message: 'Please enter the deposit amount.' });
            }
        }

        const finalMethod = method || 'Direct Transfer';

        // Validate and sanitize inputs
        const amountCheck = validateAmount(amount, 1, 50000);
        if (!amountCheck.valid) {
            return NextResponse.json({ success: false, message: amountCheck.message });
        }

        let cleanTxId;
        if (!tx_id || tx_id.trim() === '') {
            // Generate a unique value to satisfy the unique database constraint on tx_id/account_name
            cleanTxId = `NP-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
        } else {
            cleanTxId = sanitizeTxId(tx_id);
            if (!cleanTxId || cleanTxId.length < 3) {
                return NextResponse.json({ success: false, message: 'Invalid Account Name format. Must be at least 3 characters.' });
            }
        }

        const cleanMethod = sanitizeText(finalMethod);
        const cleanNote = payment_note ? sanitizeText(payment_note).substring(0, 500) : null;

        if (isMock || !supabase) {
            const newMockDep = {
                id: `DEP-${Math.floor(100000 + Math.random() * 900000)}`,
                user_id: user.id,
                user_email: user.email,
                method: cleanMethod,
                amount: amountCheck.value,
                currency: currency || 'USD',
                tx_id: cleanTxId,
                screenshot_url: proof_image || screenshot_url || null,
                proof_image: proof_image || null,
                payment_note: cleanNote,
                status: 'PENDING',
                created_at: new Date().toISOString()
            };
            mockDeposits.unshift(newMockDep);
            return NextResponse.json({ success: true });
        }

        let insertErr;
        try {
            // Try inserting using 'account_name' first (in case table has been renamed)
            const { error } = await supabase
                .from('deposits')
                .insert([{
                    user_id: user.id,
                    method: cleanMethod,
                    amount: amountCheck.value,
                    currency: currency || 'USD',
                    account_name: cleanTxId,
                    screenshot_url: proof_image || screenshot_url || null,
                    proof_image: proof_image || null,
                    payment_note: cleanNote,
                    status: 'PENDING'
                }]);
            if (error && (error.code === 'PGRST204' || error.message.includes('account_name') || error.message.includes('column'))) {
                throw new Error('Fallback to tx_id');
            }
            insertErr = error;
        } catch (dbErr) {
            // Fall back to original 'tx_id' column schema
            try {
                const { error } = await supabase
                    .from('deposits')
                    .insert([{
                        user_id: user.id,
                        method: cleanMethod,
                        amount: amountCheck.value,
                        currency: currency || 'USD',
                        tx_id: cleanTxId,
                        screenshot_url: proof_image || screenshot_url || null,
                        proof_image: proof_image || null,
                        payment_note: cleanNote,
                        status: 'PENDING'
                    }]);
                insertErr = error;
            } catch (fallbackErr) {
                const { error } = await supabase
                    .from('deposits')
                    .insert([{
                        user_id: user.id,
                        method: cleanMethod,
                        amount: amountCheck.value,
                        currency: currency || 'USD',
                        tx_id: cleanTxId,
                        screenshot_url: proof_image || screenshot_url || null,
                        status: 'PENDING'
                    }]);
                insertErr = error;
            }
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

