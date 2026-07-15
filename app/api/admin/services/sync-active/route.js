import { NextResponse } from 'next/server';
import supabase, { isMock, apiBase, apiToken, makeRequest } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function POST(request) {
    try {
        await verifyAdmin(request);
        const { service_ids } = await request.json();

        if (!Array.isArray(service_ids)) {
            return NextResponse.json({ success: false, message: 'Invalid service list payload.' });
        }

        if (isMock || !supabase) {
            return NextResponse.json({ success: true, message: 'Mock synced successfully.' });
        }

        const { data: dbServices } = await supabase.from('services').select('*');
        const dbServicesFiltered = dbServices ? dbServices.filter(db => db.group_name !== 'SYSTEM_CONFIG') : [];

        const goodsUrl = `${apiBase.replace(/\/$/, '')}/api/v1/goods?key=${encodeURIComponent(apiToken)}`;
        const response = await makeRequest(goodsUrl);
        
        let apiServices = [];
        let apiGroups = [];
        if (response) {
            try {
                const json = JSON.parse(response);
                if (json.code === 200 && Array.isArray(json.data)) {
                    apiGroups = json.data.map(group => ({
                        code: group.group_id.toString(),
                        name: group.group_name
                    }));
                    json.data.forEach(group => {
                        group.list.forEach(item => {
                            apiServices.push({
                                code: item.id.toString(),
                                name: item.name,
                                cost_price: parseFloat(item.unit_price),
                                price: parseFloat(item.unit_price) + 0.10,
                                stock: parseInt(item.stock),
                                group_id: group.group_id.toString()
                            });
                        });
                    });
                }
            } catch (e) {
                console.error(e);
            }
        }

        const toDeleteIds = dbServicesFiltered
            .filter(db => !service_ids.includes(db.service_id))
            .map(db => db.service_id);

        if (toDeleteIds.length > 0) {
            const { error: delErr } = await supabase
                .from('services')
                .delete()
                .in('service_id', toDeleteIds);
            if (delErr) throw delErr;
        }

        const existingIds = dbServicesFiltered.map(db => db.service_id);
        const toInsertIds = service_ids.filter(id => !existingIds.includes(id));

        if (toInsertIds.length > 0) {
            const rowsToInsert = toInsertIds.map(id => {
                const liveMatch = apiServices.find(s => s.code === id);
                if (liveMatch) {
                    const grpName = apiGroups.find(g => g.code === liveMatch.group_id)?.name || 'Default Operator';
                    return {
                        service_id: id,
                        group_name: grpName,
                        app_name: liveMatch.name,
                        cost_price: liveMatch.cost_price,
                        sell_price: liveMatch.price,
                        stock: liveMatch.stock,
                        validity_period: 4
                    };
                } else {
                    return {
                        service_id: id,
                        group_name: 'Custom Operator',
                        app_name: 'Custom App',
                        cost_price: 0.10,
                        sell_price: 0.20,
                        stock: 100,
                        validity_period: 4
                    };
                }
            });

            const { error: insErr } = await supabase
                .from('services')
                .insert(rowsToInsert);
            if (insErr) throw insErr;
        }

        return NextResponse.json({ success: true, message: 'Services selection synchronized successfully.' });
    } catch (err) {
        console.error('Failed to sync active services:', err.message);
        return NextResponse.json({ success: false, message: 'Database synchronization failed.' }, { status: 500 });
    }
}
