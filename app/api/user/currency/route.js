import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function POST(request) {
    try {
        const user = await verifyAuth(request);
        const { currency } = await request.json();

        if (!currency || !['PKR', 'USD', 'INR', 'BDT', 'NPR', 'RUB'].includes(currency)) {
            return NextResponse.json({ success: false, message: 'Invalid currency selection.' });
        }

        if (isMock || !supabase) {
            return NextResponse.json({ success: true });
        }

        const { error } = await supabase
            .from('profiles')
            .update({ currency })
            .eq('id', user.id);

        if (error) return NextResponse.json({ success: false, message: error.message });

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
