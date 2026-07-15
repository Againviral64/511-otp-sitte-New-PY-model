import { NextResponse } from 'next/server';
import supabase, { isMock, apiBase, apiToken, makeRequest, mockGroups, mockServices } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function GET(request) {
    try {
        await verifyAdmin(request);

        if (isMock || !supabase) {
            return NextResponse.json({
                success: true,
                countries: mockGroups,
                services: mockServices.map(s => ({ ...s, enabled: true }))
            });
        }

        const goodsUrl = `${apiBase.replace(/\/$/, '')}/api/v1/goods?key=${encodeURIComponent(apiToken)}`;
        const response = await makeRequest(goodsUrl);
        
        let apiGroups = [];
        let apiServices = [];

        if (response) {
            try {
                const json = JSON.parse(response);
                if (json.code === 200 && Array.isArray(json.data)) {
                    apiGroups = json.data.map(group => ({
                        code: group.group_id.toString(),
                        name: group.group_name,
                        flag: group.group_name.includes('美国') ? '🇺🇸' : '🌐'
                    }));

                    json.data.forEach(group => {
                        group.list.forEach(item => {
                            apiServices.push({
                                code: item.id.toString(),
                                name: item.name,
                                cost_price: parseFloat(item.unit_price),
                                price: parseFloat(item.unit_price) + 0.10,
                                stock: parseInt(item.stock),
                                group_id: group.group_id.toString(),
                                group_name: group.group_name,
                                conf_price: Array.isArray(item.conf_price) ? item.conf_price : []
                            });
                        });
                    });
                }
            } catch (e) {
                console.error('Failed to parse goods response:', e.message);
            }
        }

        const { data: dbServices } = await supabase.from('services').select('*');
        const dbServicesFiltered = dbServices ? dbServices.filter(db => db.group_name !== 'SYSTEM_CONFIG') : [];

        const servicesWithFlags = apiServices.map(s => {
            const dbMatch = dbServicesFiltered.find(db => db.service_id === s.code);
            return {
                ...s,
                parent_group_name: s.group_name,
                group_name: dbMatch ? dbMatch.group_name : (s.group_name || 'Standard Operators'),
                cost_price: dbMatch ? parseFloat(dbMatch.cost_price) : s.cost_price,
                price: dbMatch ? parseFloat(dbMatch.sell_price) : s.price,
                validity_period: dbMatch ? (dbMatch.validity_period || 4) : 4,
                enabled: !!dbMatch
            };
        });

        const finalServices = servicesWithFlags.length > 0 ? servicesWithFlags : dbServicesFiltered.map(db => ({
            code: db.service_id,
            name: db.app_name,
            group_id: '3',
            group_name: db.group_name || 'Standard Operators',
            cost_price: parseFloat(db.cost_price),
            price: parseFloat(db.sell_price),
            stock: db.stock,
            enabled: true
        }));

        const finalGroups = apiGroups.length > 0 ? apiGroups : [...new Set(dbServicesFiltered.map(db => db.group_name))].map(name => ({
            code: '3',
            name: name,
            flag: name.includes('美国') ? '🇺🇸' : '🌐'
        }));

        return NextResponse.json({
            success: true,
            countries: finalGroups,
            services: finalServices
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
