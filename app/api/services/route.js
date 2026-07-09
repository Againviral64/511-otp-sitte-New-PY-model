import { NextResponse } from 'next/server';
import supabase, { isMock, apiBase, apiToken, makeRequest, mockGroups, mockServices } from '@/lib/db';

export const revalidate = 60; // Cache this route for 60 seconds to drastically improve dashboard loading speed

export async function GET() {
    if (isMock || !supabase) {
        return NextResponse.json({
            success: true,
            countries: mockGroups,
            services: mockServices,
            otp_expiry_minutes: 4
        });
    }

    try {
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
                                group_id: group.group_id.toString()
                            });
                        });
                    });
                }
            } catch (e) {
                console.error('Failed to parse live goods response:', e.message);
            }
        }

        const { data: dbServices } = await supabase.from('services').select('*');
        const dbServicesFiltered = dbServices ? dbServices.filter(db => db.group_name !== 'SYSTEM_CONFIG') : [];

        let expiryMinutes = 4;
        try {
            const { data: configRow } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'otp_expiry_duration')
                .maybeSingle();
            if (configRow) {
                expiryMinutes = parseInt(configRow.value) || 4;
            }
        } catch (e) {
            console.error('Failed to query settings table:', e.message);
        }

        const activeServices = apiServices
            .filter(s => dbServicesFiltered.some(db => db.service_id === s.code))
            .map(s => {
                const dbMatch = dbServicesFiltered.find(db => db.service_id === s.code);
                return {
                    code: s.code,
                    name: s.name,
                    group_id: s.group_id,
                    cost_price: dbMatch ? parseFloat(dbMatch.cost_price) : s.cost_price,
                    price: dbMatch ? parseFloat(dbMatch.sell_price) : s.price,
                    stock: s.stock
                };
            });

        if (activeServices.length === 0 && dbServicesFiltered.length > 0) {
            const fallbackServices = dbServicesFiltered.map(db => ({
                code: db.service_id,
                name: db.app_name,
                group_id: '3',
                cost_price: parseFloat(db.cost_price),
                price: parseFloat(db.sell_price),
                stock: db.stock
            }));
            const fallbackGroups = [...new Set(dbServicesFiltered.map(db => db.group_name))].map((name, i) => ({
                code: '3',
                name: name,
                flag: name.includes('美国') ? '🇺🇸' : '🌐'
            }));

            return NextResponse.json({
                success: true,
                countries: fallbackGroups,
                services: fallbackServices,
                otp_expiry_minutes: expiryMinutes
            });
        }

        const filteredGroups = apiGroups.filter(g => activeServices.some(s => s.group_id === g.code));

        return NextResponse.json({
            success: true,
            countries: filteredGroups.length > 0 ? filteredGroups : (apiGroups.length > 0 ? apiGroups : mockGroups),
            services: activeServices,
            otp_expiry_minutes: expiryMinutes
        });
    } catch (err) {
        console.error('Get services failure:', err.message);
        return NextResponse.json({ success: true, countries: mockGroups, services: mockServices, otp_expiry_minutes: 4 });
    }
}
