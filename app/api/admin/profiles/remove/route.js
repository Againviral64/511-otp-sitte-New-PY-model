import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function POST(request) {
    try {
        const user = await verifyAdmin(request);
        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({ success: false, message: 'Missing user ID.' });
        }

        if (user.id === id) {
            return NextResponse.json({ success: false, message: 'You cannot revoke your own admin permissions.' });
        }

        if (isMock || !supabase) {
            return NextResponse.json({ success: true });
        }

        const { error } = await supabase
            .from('admin_profiles')
            .delete()
            .eq('id', id);

        if (error) return NextResponse.json({ success: false, message: error.message });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
