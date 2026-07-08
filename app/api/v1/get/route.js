import { NextResponse } from 'next/server';
import supabase, { isMock, apiBase, apiToken, makeRequest, mockServices, mockBalance } from '@/lib/db';

export async function GET(request) {
    const searchParams = new URL(request.url).searchParams;
    const key = searchParams.get('key');
    const id = searchParams.get('id');

    if (!key || !id) {
        return NextResponse.json({ code: 500, data: [], message: 'Missing parameters (key and id are required)' });
    }

    if (isMock || !supabase) {
        const mockMatch = mockServices.find(s => s.code === id);
        const price = mockMatch ? mockMatch.price : 0.500;
        
        if (mockBalance < price) {
            return NextResponse.json({ code: 500, data: [], message: 'No balance' });
        }
        return NextResponse.json({
            code: 200,
            data: {
                sn: `MOCK-${Math.floor(100000 + Math.random() * 900000)}-${Date.now()}`,
                number: [`+1${Math.floor(1000000000 + Math.random() * 9000000000)}`]
            },
            message: 'OK'
        });
    }

    try {
        const { data: prof, error: profErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('api_key', key)
            .maybeSingle();

        if (profErr || !prof) {
            return NextResponse.json({ code: 500, data: [], message: 'Invalid API Key' });
        }

        const { data: sRow } = await supabase
            .from('services')
            .select('*')
            .eq('service_id', id)
            .maybeSingle();

        if (!sRow) {
            return NextResponse.json({ code: 500, data: [], message: 'Product not supported or offline' });
        }

        const sellPrice = parseFloat(sRow.sell_price);
        const balance = parseFloat(prof.balance);
        if (balance < sellPrice) {
            return NextResponse.json({ code: 500, data: [], message: 'No balance' });
        }

        const buyUrl = `${apiBase.replace(/\/$/, '')}/api/v1/get?key=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(id)}&num=1&time=4`;
        const buyResponse = await makeRequest(buyUrl);

        if (!buyResponse) {
            return NextResponse.json({ code: 500, data: [], message: 'Gateway timeout' });
        }

        const buyJson = JSON.parse(buyResponse);
        if (buyJson.code !== 200 || !buyJson.data || !buyJson.data.sn) {
            return NextResponse.json({ code: 500, data: [], message: buyJson.message || 'Gateway purchase failed' });
        }

        const orderId = buyJson.data.sn;
        const number = buyJson.data.number[0];
        let smsUrl = null;

        const orderUrl = `${apiBase.replace(/\/$/, '')}/api/v1/order?key=${encodeURIComponent(apiToken)}&sn=${encodeURIComponent(orderId)}`;
        const orderResponse = await makeRequest(orderUrl);
        if (orderResponse && orderResponse.includes('|')) {
            const parts = orderResponse.split('|');
            if (parts.length >= 2) {
                smsUrl = parts[1].trim();
            }
        }

        const newBalance = balance - sellPrice;
        await supabase
            .from('profiles')
            .update({
                balance: newBalance,
                spend: balance - newBalance + parseFloat(prof.spend || 0),
                total_orders: 1 + parseInt(prof.total_orders || 0)
            })
            .eq('id', prof.id);

        await supabase
            .from('orders')
            .insert([{
                order_id: orderId,
                user_id: prof.id,
                country: sRow.group_name,
                service: sRow.app_name,
                number: number,
                status: 'PENDING',
                price: sellPrice,
                sms_url: smsUrl,
                product_id: id
            }]);

        return NextResponse.json({
            code: 200,
            data: {
                sn: orderId,
                number: [number]
            },
            message: 'OK'
        });
    } catch (e) {
        return NextResponse.json({ code: 500, data: [], message: e.message });
    }
}
