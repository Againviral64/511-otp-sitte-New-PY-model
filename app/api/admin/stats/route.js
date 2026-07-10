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
                .select('created_at, price, status')
                .gte('created_at', thirtyDaysAgo.toISOString());

            const { data: dbSignups } = await supabase
                .from('profiles')
                .select('created_at')
                .gte('created_at', thirtyDaysAgo.toISOString());

            const ordersGrouped = {};
            const revenueGrouped = {};
            dates.forEach(d => {
                ordersGrouped[d] = 0;
                revenueGrouped[d] = 0;
            });

            if (dbOrders) {
                dbOrders.forEach(o => {
                    const dateStr = new Date(o.created_at).toISOString().split('T')[0];
                    if (ordersGrouped[dateStr] !== undefined) {
                        ordersGrouped[dateStr]++;
                        if (o.status === 'COMPLETED') {
                            revenueGrouped[dateStr] += parseFloat(o.price || 0);
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

        return NextResponse.json({
            success: true,
            stats: {
                total_liability: parseFloat(stats.total_liability || 0),
                orders_today: parseInt(stats.orders_today || 0),
                revenue_today: parseFloat(stats.revenue_today || 0),
                cost_today: parseFloat(stats.cost_today || 0),
                profit_today: parseFloat(stats.profit_today || 0),
                orders_lifetime: parseInt(stats.orders_lifetime || 0),
                revenue_lifetime: parseFloat(stats.revenue_lifetime || 0),
                cost_lifetime: parseFloat(stats.cost_lifetime || 0),
                profit_lifetime: parseFloat(stats.profit_lifetime || 0)
            },
            daily_stats: {
                labels: dailyLabels,
                revenue: dailyRevenue,
                orders: dailyOrders,
                signups: dailySignups
            }
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
