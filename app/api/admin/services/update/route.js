import { NextResponse } from 'next/server';
import supabase, { isMock, mockServices } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function POST(request) {
    try {
        await verifyAdmin(request);
        const { service_id, cost_price, sell_price, app_name, group_name } = await request.json();

        if (!service_id || isNaN(cost_price) || isNaN(sell_price)) {
            return NextResponse.json({ success: false, message: 'Please provide valid service code and pricing inputs.' });
        }

        if (isMock || !supabase) {
            const idx = mockServices.findIndex(s => s.code === service_id);
            if (idx !== -1) {
                mockServices[idx].price = parseFloat(sell_price);
                mockServices[idx].cost_price = parseFloat(cost_price);
                return NextResponse.json({ success: true });
            }
            return NextResponse.json({ success: false, message: 'Mock service not found.' });
        }

        const { data: sRow } = await supabase
            .from('services')
            .select('id')
            .eq('service_id', service_id)
            .maybeSingle();

        if (sRow) {
            const { error } = await supabase
                .from('services')
                .update({ cost_price: parseFloat(cost_price), sell_price: parseFloat(sell_price) })
                .eq('service_id', service_id);

            if (error) return NextResponse.json({ success: false, message: error.message });
        } else {
            const { error } = await supabase
                .from('services')
                .insert([{
                    service_id,
                    group_name: group_name || 'Manual Import',
                    app_name: app_name || 'Manual App',
                    cost_price: parseFloat(cost_price),
                    sell_price: parseFloat(sell_price),
                    stock: 100
                }]);

            if (error) return NextResponse.json({ success: false, message: error.message });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
