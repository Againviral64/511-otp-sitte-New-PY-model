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
                    { id: 'mock-1', email: 'admin@gmail.com', name: 'Super Admin' },
                    { id: 'mock-2', email: 'partner@gmail.com', name: 'Zain Partner' }
                ]
            });
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('id, email, name')
            .order('email', { ascending: true });

        if (error) return NextResponse.json({ success: false, message: error.message });
        return NextResponse.json({ success: true, users: data || [] });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
