import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function GET(request) {
    try {
        await verifyAdmin(request);

        if (isMock || !supabase) {
            return NextResponse.json({
                success: true,
                stats: {
                    total_liability: 3500.00,
                    orders_today: 12,
                    revenue_today: 450.00,
                    cost_today: 320.00,
                    profit_today: 130.00,
                    orders_lifetime: 1450,
                    revenue_lifetime: 54000.00,
                    cost_lifetime: 39000.00,
                    profit_lifetime: 15000.00
                }
            });
        }

        // Daily Statistics aggregation logic for the last 30 days
        let dailyLabels = [];
        let dailyRevenue = [];
        let dailyOrders = [];
        let dailySignups = [];
        let dailyCost = [];
        let dailyProfit = [];

        const dates = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }

        if (isMock || !supabase) {
            dailyLabels = dates;
            dailyRevenue = dates.map((_, idx) => 100 + idx * 5 + Math.random() * 50);
            dailyOrders = dates.map((_, idx) => 5 + Math.floor(idx / 3) + Math.floor(Math.random() * 8));
            dailySignups = dates.map(() => Math.floor(Math.random() * 5));
        } else {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const { data: dbOrders } = await supabase
                .from('orders')
                .select('created_at, price, status, product_id')
                .gte('created_at', thirtyDaysAgo.toISOString());

            // Fetch all services for cost lookup
            const { data: allServices } = await supabase.from('services').select('service_id, cost_price');

            const { data: dbSignups } = await supabase
                .from('profiles')
                .select('created_at')
                .gte('created_at', thirtyDaysAgo.toISOString());

            const ordersGrouped = {};
            const revenueGrouped = {};
            const costGrouped = {};
            const serviceCostMap = {};
            if (allServices) {
                allServices.forEach(s => {
                    serviceCostMap[s.service_id] = parseFloat(s.cost_price || 0);
                });
            }
            dates.forEach(d => {
                ordersGrouped[d] = 0;
                revenueGrouped[d] = 0;
                costGrouped[d] = 0;
            });

            if (dbOrders) {
                dbOrders.forEach(o => {
                    const dateStr = new Date(o.created_at).toISOString().split('T')[0];
                    if (ordersGrouped[dateStr] !== undefined) {
                        ordersGrouped[dateStr]++;
                        if (o.status === 'COMPLETED') {
                            revenueGrouped[dateStr] += parseFloat(o.price || 0);
                            const unitCost = serviceCostMap[o.product_id] || 0;
                            costGrouped[dateStr] += unitCost * 278.50;
                        }
                    }
                });
            }

            const signupsGrouped = {};
            dates.forEach(d => {
                signupsGrouped[d] = 0;
            });

            if (dbSignups) {
                dbSignups.forEach(u => {
                    const dateStr = new Date(u.created_at).toISOString().split('T')[0];
                    if (signupsGrouped[dateStr] !== undefined) {
                        signupsGrouped[dateStr]++;
                    }
                });
            }

            dailyLabels = dates;
            dailyRevenue = dates.map(d => parseFloat(revenueGrouped[d].toFixed(2)));
            dailyOrders = dates.map(d => ordersGrouped[d]);
            dailySignups = dates.map(d => signupsGrouped[d]);
            dailyCost = dates.map(d => parseFloat(costGrouped[d].toFixed(2)));
            dailyProfit = dates.map(d => parseFloat((revenueGrouped[d] - costGrouped[d]).toFixed(2)));
        }

        const { data: statsData, error: viewError } = await supabase
            .from('admin_overview')
            .select('*')
            .maybeSingle();

        if (viewError) {
            console.error('Failed to query admin_overview view:', viewError.message);
            return NextResponse.json({ success: false, message: 'Overview view query error.' });
        }

        const stats = statsData || {
            orders_today: 0,
            revenue_today: 0,
            cost_today: 0,
            profit_today: 0,
            orders_lifetime: 0,
            revenue_lifetime: 0,
            cost_lifetime: 0,
            profit_lifetime: 0,
            total_liability: 0
        };

        const revenueToday = parseFloat(stats.revenue_today || 0);
        const costToday = parseFloat(stats.cost_today || 0);
        const revenueLifetime = parseFloat(stats.revenue_lifetime || 0);
        const costLifetime = parseFloat(stats.cost_lifetime || 0);

        return NextResponse.json({
            success: true,
            stats: {
                total_liability: parseFloat(stats.total_liability || 0),
                orders_today: parseInt(stats.orders_today || 0),
                revenue_today: revenueToday,
                cost_today: costToday,
                profit_today: parseFloat((revenueToday - costToday).toFixed(3)),
                orders_lifetime: parseInt(stats.orders_lifetime || 0),
                revenue_lifetime: revenueLifetime,
                cost_lifetime: costLifetime,
                profit_lifetime: parseFloat((revenueLifetime - costLifetime).toFixed(3))
            },
            daily_stats: {
                labels: dailyLabels,
                revenue: dailyRevenue,
                orders: dailyOrders,
                signups: dailySignups,
                cost: dailyCost,
                profit: dailyProfit
            }
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
