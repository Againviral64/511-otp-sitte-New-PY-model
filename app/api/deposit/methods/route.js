import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';

export async function GET() {
    try {
        if (isMock || !supabase) {
            // Mock data fallback
            const mockMethods = [
                { id: 1, method_name: 'Easypaisa', account_title: 'Zain Ali', account_number: '0314-5551234', bank_name: 'Easypaisa', instructions: 'Easypaisa transfer instructions here', is_active: true },
                { id: 2, method_name: 'JazzCash', account_title: 'Muhammad Ahmed', account_number: '0311-1234567', bank_name: 'JazzCash', instructions: 'JazzCash transfer instructions here', is_active: true },
                { id: 3, method_name: 'Zindagi', account_title: 'Ali Khan', account_number: '0322-1234567', bank_name: 'Zindagi', instructions: '', is_active: true }
            ];
            return NextResponse.json({ success: true, methods: mockMethods });
        }

        const { data, error } = await supabase
            .from('deposit_methods')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return NextResponse.json({ success: true, methods: data });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}
