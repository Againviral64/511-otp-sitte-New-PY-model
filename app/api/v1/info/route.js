import { NextResponse } from 'next/server';
import supabase, { isMock, mockBalance } from '@/lib/db';

export async function GET(request) {
    const searchParams = new URL(request.url).searchParams;
    const key = searchParams.get('key');

    if (!key) {
        return NextResponse.json({ code: 500, data: [], message: '密钥不能为空' });
    }

    if (isMock || !supabase) {
        return NextResponse.json({
            code: 200,
            data: { id: 111, username: 'mock_reseller', balance: mockBalance.toFixed(3) },
            message: 'OK'
        });
    }

    try {
        const { data: prof, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('api_key', key)
            .maybeSingle();

        if (error || !prof) {
            return NextResponse.json({ code: 500, data: [], message: 'Invalid API Key' });
        }

        return NextResponse.json({
            code: 200,
            data: {
                id: prof.id,
                username: prof.email,
                balance: parseFloat(prof.balance).toFixed(3)
            },
            message: 'OK'
        });
    } catch (e) {
        return NextResponse.json({ code: 500, data: [], message: e.message });
    }
}
