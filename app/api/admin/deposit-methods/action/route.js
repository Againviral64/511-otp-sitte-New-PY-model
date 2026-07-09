import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';
import { mockDepositMethods } from '../route';

export async function PUT(request) {
    try {
        await verifyAdmin(request);
        const { id, method_name, bank_name, account_title, account_number, instructions, is_active } = await request.json();

        if (!id || !method_name || !bank_name || !account_title || !account_number) {
            return NextResponse.json({ success: false, message: 'Missing required deposit method details.' });
        }

        if (isMock || !supabase) {
            const idx = mockDepositMethods.findIndex(m => m.id == id);
            if (idx !== -1) {
                mockDepositMethods[idx] = {
                    ...mockDepositMethods[idx],
                    method_name,
                    bank_name,
                    account_title,
                    account_number,
                    instructions: instructions || '',
                    is_active: is_active === undefined ? true : !!is_active
                };
                return NextResponse.json({ success: true });
            }
            return NextResponse.json({ success: false, message: 'Deposit method not found.' });
        }

        const { error } = await supabase
            .from('deposit_methods')
            .update({
                method_name,
                bank_name,
                account_title,
                account_number,
                instructions: instructions || '',
                is_active: is_active === undefined ? true : !!is_active
            })
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}

export async function DELETE(request) {
    try {
        await verifyAdmin(request);
        const searchParams = new URL(request.url).searchParams;
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ success: false, message: 'Missing ID parameter.' });
        }

        if (isMock || !supabase) {
            const idx = mockDepositMethods.findIndex(m => m.id == id);
            if (idx !== -1) {
                mockDepositMethods.splice(idx, 1);
                return NextResponse.json({ success: true });
            }
            return NextResponse.json({ success: false, message: 'Deposit method not found.' });
        }

        const { error } = await supabase
            .from('deposit_methods')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
