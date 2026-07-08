import { NextResponse } from 'next/server';
import supabase, { isMock, mockDeposits } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function GET(request) {
    try {
        const user = await verifyAuth(request);

        if (isMock || !supabase) {
            const userDeps = mockDeposits.filter(d => d.user_id === user.id);
            return NextResponse.json({ success: true, deposits: userDeps });
        }

        const { data, error } = await supabase
            .from('deposits')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) return NextResponse.json({ success: false, message: error.message });
        return NextResponse.json({ success: true, deposits: data });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
