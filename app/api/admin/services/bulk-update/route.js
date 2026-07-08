import { NextResponse } from 'next/server';
import supabase, { isMock, apiBase, apiToken, makeRequest, mockServices } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function POST(request) {
    try {
        await verifyAdmin(request);
        const { markup_percent, group_name } = await request.json();

        if (isNaN(markup_percent) || parseFloat(markup_percent) < 0) {
            return NextResponse.json({ success: false, message: 'Please enter a valid positive markup percentage.' });
        }

        const markupMultiplier = 1 + (parseFloat(markup_percent) / 100);

        if (isMock || !supabase) {
            mockServices.forEach(s => {
                if (!group_name || s.group_id === group_name) {
                    s.price = s.cost_price * markupMultiplier;
                }
            });
            return NextResponse.json({ success: true });
        }

        const goodsUrl = `${apiBase.replace(/\/$/, '')}/api/v1/goods?key=${encodeURIComponent(apiToken)}`;
        const response = await makeRequest(goodsUrl);
        
        let apiServices = [];
        if (response) {
            try {
                const json = JSON.parse(response);
                if (json.code === 200 && Array.isArray(json.data)) {
                    json.data.forEach(group => {
                        group.list.forEach(item => {
                            apiServices.push({
                                code: item.id.toString(),
                                name: item.name,
                                cost_price: parseFloat(item.unit_price),
                                group_name: group.group_name
                            });
                        });
                    });
                }
            } catch (e) {
                console.error('Failed to parse goods response in bulk-update:', e.message);
            }
        }

        const { data: dbServices } = await supabase.from('services').select('*');
        const updatePromises = [];

        if (apiServices.length > 0) {
            for (const s of apiServices) {
                if (group_name && s.group_name !== group_name) {
                    continue;
                }
                const sellPrice = s.cost_price * markupMultiplier;
                const dbMatch = dbServices.find(db => db.service_id === s.code);
                
                if (dbMatch) {
                    updatePromises.push(
                        supabase
                            .from('services')
                            .update({ cost_price: s.cost_price, sell_price: sellPrice })
                            .eq('service_id', s.code)
                    );
                } else {
                    updatePromises.push(
                        supabase
                            .from('services')
                            .insert([{
                                service_id: s.code,
                                group_name: s.group_name,
                                app_name: s.name,
                                cost_price: s.cost_price,
                                sell_price: sellPrice,
                                stock: 100
                            }])
                    );
                }
            }
            await Promise.all(updatePromises);
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Bulk update error:', err.message);
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}
