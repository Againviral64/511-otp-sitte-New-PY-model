import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function POST(request) {
    try {
        const user = await verifyAuth(request);
        const { name } = await request.json();

        if (!name || name.trim() === '') {
            return NextResponse.json({ success: false, message: 'Name cannot be empty.' });
        }

        if (isMock || !supabase) {
            return NextResponse.json({ success: true, message: 'Settings saved locally.' });
        }

        const { error } = await supabase
            .from('profiles')
            .update({ name: name.trim() })
            .eq('id', user.id);

        if (error) return NextResponse.json({ success: false, message: error.message });

        return NextResponse.json({ success: true, message: 'Profile updated successfully!' });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
