import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function POST(request) {
    try {
        const user = await verifyAuth(request);
        const newKey = 'nova_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        if (isMock || !supabase) {
            return NextResponse.json({ success: true, api_key: newKey });
        }

        const { error } = await supabase
            .from('profiles')
            .update({ api_key: newKey })
            .eq('id', user.id);

        if (error) return NextResponse.json({ success: false, message: error.message });

        return NextResponse.json({ success: true, api_key: newKey });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
