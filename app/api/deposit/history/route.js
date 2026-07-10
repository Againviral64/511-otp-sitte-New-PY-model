import { NextResponse } from 'next/server';
import supabase, { isMock, mockDeposits } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function GET(request) {
    try {
        const user = await verifyAuth(request);
        const searchParams = new URL(request.url).searchParams;
        const page = Math.max(1, parseInt(searchParams.get('page')) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit')) || 50));
        const offset = (page - 1) * limit;

        if (isMock || !supabase) {
            const userDeps = mockDeposits.filter(d => d.user_id === user.id);
            const paginated = userDeps.slice(offset, offset + limit);
            return NextResponse.json({ success: true, deposits: paginated, page, total: userDeps.length });
        }

        const { data, error, count } = await supabase
            .from('deposits')
            .select('*', { count: 'exact' })
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) return NextResponse.json({ success: false, message: error.message });
        return NextResponse.json({ success: true, deposits: data, page, total: count || 0 });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
