import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

// Local mock database in memory for mock mode
export let mockDepositMethods = [
    { id: 1, method_name: 'Easypaisa', account_title: 'Zain Ali', account_number: '0314-5551234', bank_name: 'Easypaisa', instructions: 'Easypaisa transfer instructions here', is_active: true },
    { id: 2, method_name: 'JazzCash', account_title: 'Muhammad Ahmed', account_number: '0311-1234567', bank_name: 'JazzCash', instructions: 'JazzCash transfer instructions here', is_active: true },
    { id: 3, method_name: 'Zindagi', account_title: 'Ali Khan', account_number: '0322-1234567', bank_name: 'Zindagi', instructions: '', is_active: true }
];

export async function GET(request) {
    try {
        await verifyAdmin(request);

        if (isMock || !supabase) {
            return NextResponse.json({ success: true, methods: mockDepositMethods });
        }

        const { data, error } = await supabase
            .from('deposit_methods')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) throw error;
        return NextResponse.json({ success: true, methods: data });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}

export async function POST(request) {
    try {
        await verifyAdmin(request);
        const { method_name, bank_name, account_title, account_number, instructions, is_active } = await request.json();

        if (!method_name || !bank_name || !account_title || !account_number) {
            return NextResponse.json({ success: false, message: 'Missing required deposit method details.' });
        }

        if (isMock || !supabase) {
            const newMethod = {
                id: mockDepositMethods.length + 1,
                method_name,
                bank_name,
                account_title,
                account_number,
                instructions: instructions || '',
                is_active: is_active === undefined ? true : !!is_active,
                created_at: new Date().toISOString()
            };
            mockDepositMethods.push(newMethod);
            return NextResponse.json({ success: true });
        }

        const { error } = await supabase
            .from('deposit_methods')
            .insert([{
                method_name,
                bank_name,
                account_title,
                account_number,
                instructions: instructions || '',
                is_active: is_active === undefined ? true : !!is_active
            }]);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
