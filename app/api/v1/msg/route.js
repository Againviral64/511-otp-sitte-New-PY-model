import { NextResponse } from 'next/server';
import supabase, { isMock, apiBase, apiToken, makeRequest } from '@/lib/db';

export async function GET(request) {
    const searchParams = new URL(request.url).searchParams;
    const key = searchParams.get('key');
    const id = searchParams.get('id');
    const number = searchParams.get('number');

    if (!key || !id || !number) {
        return NextResponse.json({ code: 500, data: [], message: 'Missing parameters (key, id and number are required)' });
    }

    if (isMock || !supabase) {
        return NextResponse.json({
            code: 200,
            data: {
                time: new Date().toISOString().replace('T', ' ').substring(0, 19),
                msg: `[Verification] Your OTP code is ${Math.floor(1000 + Math.random() * 9000)}`,
                from: number
            },
            message: 'OK'
        });
    }

    try {
        const { data: prof, error: profErr } = await supabase
            .from('profiles')
            .select('id')
            .eq('api_key', key)
            .maybeSingle();

        if (profErr || !prof) {
            return NextResponse.json({ code: 500, data: [], message: 'Invalid API Key' });
        }

        const cleanedNumber = number.replace(/\s+/g, '');
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', prof.id)
            .eq('product_id', id)
            .ilike('number', `%${cleanedNumber}%`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (orderErr || !order) {
            return NextResponse.json({ code: 500, data: [], message: 'Order matching this number not found' });
        }

        if (order.status === 'COMPLETED' && order.otp) {
            return NextResponse.json({
                code: 200,
                data: {
                    time: new Date(order.created_at).toISOString().replace('T', ' ').substring(0, 19),
                    msg: `Your verification code is ${order.otp}`,
                    from: order.number
                },
                message: 'OK'
            });
        }

        let status = 'PENDING';
        let otp = null;
        let smsText = 'No message';

        if (order.sms_url) {
            const response = await makeRequest(order.sms_url);
            if (response) {
                const match = response.match(/\b\d{4,8}\b/);
                if (match) {
                    status = 'COMPLETED';
                    otp = match[0];
                    smsText = response;
                }
            }
        } else {
            const msgUrl = `${apiBase.replace(/\/$/, '')}/api/v1/msg?key=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(id)}&number=${encodeURIComponent(cleanedNumber)}`;
            const response = await makeRequest(msgUrl);
            if (response) {
                try {
                    const json = JSON.parse(response);
                    if (json.code === 200 && json.data && json.data.msg) {
                        const match = json.data.msg.match(/\b\d{4,8}\b/);
                        if (match) {
                            status = 'COMPLETED';
                            otp = match[0];
                            smsText = json.data.msg;
                        }
                    }
                } catch (e) {}
            }
        }

        if (status === 'COMPLETED') {
            await supabase
                .from('orders')
                .update({ status: 'COMPLETED', otp: otp })
                .eq('order_id', order.order_id);

            return NextResponse.json({
                code: 200,
                data: {
                    time: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    msg: smsText,
                    from: order.number
                },
                message: 'OK'
            });
        }

        return NextResponse.json({
            code: 222,
            data: [],
            message: 'No message'
        });
    } catch (e) {
        return NextResponse.json({ code: 500, data: [], message: e.message });
    }
}
