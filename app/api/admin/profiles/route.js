import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function GET(request) {
    try {
        await verifyAdmin(request);

        if (isMock || !supabase) {
            return NextResponse.json({ success: true, admins: [{ id: '00000000-0000-0000-0000-000000000000', email: 'partner@novatix.com', created_at: new Date().toISOString() }] });
        }

        const { data, error } = await supabase
            .from('admin_profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) return NextResponse.json({ success: false, message: error.message });
        return NextResponse.json({ success: true, admins: data || [] });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
