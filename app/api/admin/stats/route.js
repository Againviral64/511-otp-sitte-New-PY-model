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
            }
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
