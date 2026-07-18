import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

function getKarachiDateString(dateInput) {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Karachi',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date(dateInput));
    } catch (e) {
        // Fallback to local date string ISO format
        return new Date(dateInput).toISOString().split('T')[0];
    }
}

function getKarachiDateBoundaries(range, startParam, endParam) {
    // Get current time in Karachi
    const nowInKarachi = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
    
    let startDateStr = '';
    let endDateStr = '';

    if (range === 'today') {
        startDateStr = getKarachiDateString(nowInKarachi);
        endDateStr = startDateStr;
    } else if (range === 'yesterday') {
        const yesterday = new Date(nowInKarachi);
        yesterday.setDate(yesterday.getDate() - 1);
        startDateStr = getKarachiDateString(yesterday);
        endDateStr = startDateStr;
    } else if (range === '7days') {
        const past = new Date(nowInKarachi);
        past.setDate(past.getDate() - 6);
        startDateStr = getKarachiDateString(past);
        endDateStr = getKarachiDateString(nowInKarachi);
    } else if (range === '30days') {
        const past = new Date(nowInKarachi);
        past.setDate(past.getDate() - 29);
        startDateStr = getKarachiDateString(past);
        endDateStr = getKarachiDateString(nowInKarachi);
    } else if (range === 'custom') {
        startDateStr = startParam;
        endDateStr = endParam || startParam;
    }

    // Convert local boundaries to UTC ISO strings for Supabase query
    const startUTC = new Date(`${startDateStr}T00:00:00+05:00`).toISOString();
    const endUTC = new Date(`${endDateStr}T23:59:59+05:00`).toISOString();

    return { startUTC, endUTC, startDateStr, endDateStr };
}

export async function GET(request) {
    try {
        await verifyAdmin(request);

        const { searchParams } = new URL(request.url);
        const range = searchParams.get('range') || 'today';
        const startParam = searchParams.get('start_date') || '';
        const endParam = searchParams.get('end_date') || '';

        // Fetch PKR exchange rate dynamically from settings table
        let pkrRate = 278.50;
        let overallMultiplier = 1.0;
        let ordersMultiplier = 1.0;
        let lifetimeMultiplier = 1.0;
        let liabilityMultiplier = 1.0;

        if (!isMock && supabase) {
            const { data: exchangeRateSetting } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'exchange_rate_PKR')
                .maybeSingle();
            if (exchangeRateSetting) {
                pkrRate = parseFloat(exchangeRateSetting.value) || 278.50;
            }

            try {
                const { data: fakeDataRows, error: fakeError } = await supabase
                    .from('fake_data')
                    .select('key, value');

                if (!fakeError && fakeDataRows) {
                    const fakeMap = {};
                    fakeDataRows.forEach(r => {
                        fakeMap[r.key] = parseFloat(r.value);
                    });

                    const overall = (fakeMap.overall_percentage !== undefined ? fakeMap.overall_percentage : 100.0) / 100.0;
                    const ordersPct = (fakeMap.orders_percentage !== undefined ? fakeMap.orders_percentage : 100.0) / 100.0;
                    const lifetimePct = (fakeMap.lifetime_percentage !== undefined ? fakeMap.lifetime_percentage : 100.0) / 100.0;
                    const liabilityPct = (fakeMap.liability_percentage !== undefined ? fakeMap.liability_percentage : 100.0) / 100.0;

                    overallMultiplier = overall;
                    ordersMultiplier = ordersPct * overall;
                    lifetimeMultiplier = lifetimePct * overall;
                    liabilityMultiplier = liabilityPct * overall;
                }
            } catch (err) {
                console.warn('Failed to query fake_data table:', err.message);
            }
        }

        if (isMock || !supabase) {
            const mockDates = [];
            for (let i = 29; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                mockDates.push(getKarachiDateString(d));
            }
            return NextResponse.json({
                success: true,
                stats: {
                    total_liability: 3500.00,
                    orders_today: range === 'yesterday' ? 8 : 12,
                    revenue_today: range === 'yesterday' ? 320.00 : 450.00,
                    cost_today: range === 'yesterday' ? 220.00 : 320.00,
                    profit_today: range === 'yesterday' ? 100.00 : 130.00,
                    orders_lifetime: 1450,
                    revenue_lifetime: 54000.00,
                    cost_lifetime: 39000.00,
                    profit_lifetime: 15000.00,
                    users_with_balance: 146,
                    users_no_balance: 216,
                    users_low_balance: 71,
                    signups_in_range: range === 'yesterday' ? 40 : 64,
                    signups_today: 64,
                    signups_yesterday: 40
                },
                daily_stats: {
                    labels: mockDates,
                    revenue: mockDates.map((_, idx) => 100 + idx * 5 + Math.random() * 50),
                    orders: mockDates.map((_, idx) => 5 + Math.floor(idx / 3) + Math.floor(Math.random() * 8)),
                    signups: mockDates.map(() => Math.floor(Math.random() * 5)),
                    cost: mockDates.map((_, idx) => 80 + idx * 4 + Math.random() * 40),
                    profit: mockDates.map((_, idx) => 20 + idx * 1 + Math.random() * 10)
                }
            });
        }

        // 1. Calculate Date boundaries in Karachi Timezone
        const { startUTC, endUTC } = getKarachiDateBoundaries(range, startParam, endParam);

        // 3. Fetch aggregated range stats (try RPC first, fallback to client-side if RPC doesn't exist)
        let ordersTodayCount = 0;
        let revenueToday = 0;
        let costToday = 0;
        let rpcSuccessful = false;

        try {
            const { data: rangeStats, error: rangeStatsErr } = await supabase
                .rpc('get_range_stats', {
                    start_time: startUTC,
                    end_time: endUTC
                });

            if (rangeStatsErr) {
                console.warn('RPC get_range_stats error, falling back:', rangeStatsErr.message);
            } else if (rangeStats && rangeStats[0]) {
                const statsRow = rangeStats[0];
                ordersTodayCount = parseInt(statsRow.total_orders || 0);
                revenueToday = parseFloat(statsRow.total_revenue || 0);
                costToday = parseFloat(statsRow.total_cost_usd || 0) * pkrRate;
                rpcSuccessful = true;
            }
        } catch (rpcErr) {
            console.warn('RPC get_range_stats catch error, falling back:', rpcErr.message);
        }

        // Fallback to client-side select if RPC failed or didn't exist
        if (!rpcSuccessful) {
            console.log('Falling back to client-side paginated orders aggregation...');
            let allRangeOrders = [];
            let page = 0;
            const pageSize = 1000;
            
            while (true) {
                const { data: rangeOrders, error: rangeOrdersErr } = await supabase
                    .from('orders')
                    .select('price, status, cost_price')
                    .gte('created_at', startUTC)
                    .lte('created_at', endUTC)
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (rangeOrdersErr || !rangeOrders || rangeOrders.length === 0) {
                    break;
                }

                allRangeOrders = allRangeOrders.concat(rangeOrders);
                if (rangeOrders.length < pageSize) {
                    break;
                }
                page++;
            }

            ordersTodayCount = allRangeOrders.length;
            allRangeOrders.forEach(o => {
                if (o.status === 'COMPLETED') {
                    revenueToday += parseFloat(o.price || 0);
                    const unitCost = parseFloat(o.cost_price || 0);
                    costToday += unitCost * pkrRate;
                }
            });
        }

        // 4. Fetch daily statistics aggregation logic for the last 30 days
        const chartDates = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            chartDates.push(getKarachiDateString(d));
        }

        const thirtyOneDaysAgo = new Date();
        thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

        const ordersGrouped = {};
        const revenueGrouped = {};
        const costGrouped = {};
        const signupsGrouped = {};
        chartDates.forEach(d => {
            ordersGrouped[d] = 0;
            revenueGrouped[d] = 0;
            costGrouped[d] = 0;
            signupsGrouped[d] = 0;
        });

        let dailyRpcSuccessful = false;
        try {
            const { data: dbDailyStats, error: dailyErr } = await supabase
                .rpc('get_daily_stats', {
                    start_time: thirtyOneDaysAgo.toISOString()
                });

            if (!dailyErr && dbDailyStats) {
                dbDailyStats.forEach(row => {
                    const d = row.date_label;
                    if (ordersGrouped[d] !== undefined) {
                        ordersGrouped[d] = parseInt(row.total_orders || 0);
                        revenueGrouped[d] = parseFloat(row.total_revenue || 0);
                        costGrouped[d] = parseFloat(row.total_cost_usd || 0) * pkrRate;
                    }
                });
                dailyRpcSuccessful = true;
            }
        } catch (e) {
            console.warn('RPC get_daily_stats failed, falling back:', e.message);
        }

        // Fallback for daily stats
        if (!dailyRpcSuccessful) {
            console.log('Falling back to client-side paginated daily stats aggregation...');
            let allDbOrders = [];
            let page = 0;
            const pageSize = 1000;
            
            while (true) {
                const { data: dbOrders, error } = await supabase
                    .from('orders')
                    .select('created_at, price, status, cost_price')
                    .gte('created_at', thirtyOneDaysAgo.toISOString())
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (error || !dbOrders || dbOrders.length === 0) {
                    break;
                }

                allDbOrders = allDbOrders.concat(dbOrders);
                if (dbOrders.length < pageSize) {
                    break;
                }
                page++;
            }

            allDbOrders.forEach(o => {
                const dateStr = getKarachiDateString(o.created_at);
                if (ordersGrouped[dateStr] !== undefined) {
                    ordersGrouped[dateStr]++;
                    if (o.status === 'COMPLETED') {
                        revenueGrouped[dateStr] += parseFloat(o.price || 0);
                        const unitCost = parseFloat(o.cost_price || 0);
                        costGrouped[dateStr] += unitCost * pkrRate;
                    }
                }
            });
        }

        let signupsRpcSuccessful = false;
        try {
            const { data: dbDailySignups, error: signupsErr } = await supabase
                .rpc('get_daily_signups', {
                    start_time: thirtyOneDaysAgo.toISOString()
                });

            if (!signupsErr && dbDailySignups) {
                dbDailySignups.forEach(row => {
                    const d = row.date_label;
                    if (signupsGrouped[d] !== undefined) {
                        signupsGrouped[d] = parseInt(row.total_signups || 0);
                    }
                });
                signupsRpcSuccessful = true;
            }
        } catch (e) {
            console.warn('RPC get_daily_signups failed, falling back:', e.message);
        }

        // Fallback for daily signups
        if (!signupsRpcSuccessful) {
            console.log('Falling back to client-side paginated daily signups aggregation...');
            let allDbSignups = [];
            let page = 0;
            const pageSize = 1000;
            
            while (true) {
                const { data: dbSignups, error } = await supabase
                    .from('profiles')
                    .select('created_at')
                    .gte('created_at', thirtyOneDaysAgo.toISOString())
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (error || !dbSignups || dbSignups.length === 0) {
                    break;
                }

                allDbSignups = allDbSignups.concat(dbSignups);
                if (dbSignups.length < pageSize) {
                    break;
                }
                page++;
            }

            allDbSignups.forEach(u => {
                const dateStr = getKarachiDateString(u.created_at);
                if (signupsGrouped[dateStr] !== undefined) {
                    signupsGrouped[dateStr]++;
                }
            });
        }

        // 5. Fetch lifetime statistics from admin_overview view
        const { data: statsData, error: viewError } = await supabase
            .from('admin_overview')
            .select('*')
            .maybeSingle();

        if (viewError) {
            console.error('Failed to query admin_overview view:', viewError.message);
            return NextResponse.json({ success: false, message: 'Overview view query error.' });
        }

        const stats = statsData || {
            orders_lifetime: 0,
            revenue_lifetime: 0,
            cost_lifetime: 0,
            profit_lifetime: 0,
            total_liability: 0,
            today_deposits: 0,
            yesterday_deposits: 0,
            lifetime_deposits: 0
        };

        const revenueLifetime = parseFloat(stats.revenue_lifetime || 0);
        const costLifetime = parseFloat(stats.cost_lifetime || 0);

        // 5.5 Query real-time user accounts insights
        const nowInKarachi = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
        const todStr = getKarachiDateString(nowInKarachi);
        const todStartUTC = new Date(`${todStr}T00:00:00+05:00`).toISOString();
        const todEndUTC = new Date(`${todStr}T23:59:59+05:00`).toISOString();

        const yesterdayLocal = new Date(nowInKarachi);
        yesterdayLocal.setDate(yesterdayLocal.getDate() - 1);
        const yestStr = getKarachiDateString(yesterdayLocal);
        const yestStartUTC = new Date(`${yestStr}T00:00:00+05:00`).toISOString();
        const yestEndUTC = new Date(`${yestStr}T23:59:59+05:00`).toISOString();

        const { count: usersWithBalance } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gt('balance', 0);

        const { count: usersNoBalance } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .or('balance.eq.0,balance.is.null');

        const { count: usersLowBalance } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gt('balance', 0)
            .lt('balance', 15);

        const { count: signupsInRange } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startUTC)
            .lte('created_at', endUTC);

        const { count: signupsToday } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', todStartUTC)
            .lte('created_at', todEndUTC);

        const { count: signupsYesterday } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', yestStartUTC)
            .lte('created_at', yestEndUTC);

        const finalOrdersToday = Math.round(ordersTodayCount * ordersMultiplier);
        const finalRevenueToday = revenueToday * ordersMultiplier;
        const finalCostToday = costToday * ordersMultiplier;

        const finalOrdersLifetime = Math.round(parseInt(stats.orders_lifetime || 0) * lifetimeMultiplier);
        const finalRevenueLifetime = revenueLifetime * lifetimeMultiplier;
        const finalCostLifetime = costLifetime * lifetimeMultiplier;

        const finalLiability = parseFloat(stats.total_liability || 0) * liabilityMultiplier;

        const finalTodayDeposits = parseFloat(stats.today_deposits || 0) * ordersMultiplier;
        const finalYesterdayDeposits = parseFloat(stats.yesterday_deposits || 0) * ordersMultiplier;
        const finalLifetimeDeposits = parseFloat(stats.lifetime_deposits || 0) * lifetimeMultiplier;

        const finalUsersWithBalance = Math.round((usersWithBalance || 0) * liabilityMultiplier);
        const finalUsersNoBalance = Math.round((usersNoBalance || 0) * liabilityMultiplier);
        const finalUsersLowBalance = Math.round((usersLowBalance || 0) * liabilityMultiplier);

        const finalSignupsInRange = Math.round((signupsInRange || 0) * ordersMultiplier);
        const finalSignupsToday = Math.round((signupsToday || 0) * ordersMultiplier);
        const finalSignupsYesterday = Math.round((signupsYesterday || 0) * ordersMultiplier);

        return NextResponse.json({
            success: true,
            stats: {
                total_liability: parseFloat(finalLiability.toFixed(3)),
                orders_today: finalOrdersToday,
                revenue_today: parseFloat(finalRevenueToday.toFixed(3)),
                cost_today: parseFloat(finalCostToday.toFixed(3)),
                profit_today: parseFloat((finalRevenueToday - finalCostToday).toFixed(3)),
                orders_lifetime: finalOrdersLifetime,
                revenue_lifetime: parseFloat(finalRevenueLifetime.toFixed(3)),
                cost_lifetime: parseFloat(finalCostLifetime.toFixed(3)),
                profit_lifetime: parseFloat((finalRevenueLifetime - finalCostLifetime).toFixed(3)),
                today_deposits: parseFloat(finalTodayDeposits.toFixed(3)),
                yesterday_deposits: parseFloat(finalYesterdayDeposits.toFixed(3)),
                lifetime_deposits: parseFloat(finalLifetimeDeposits.toFixed(3)),
                users_with_balance: finalUsersWithBalance,
                users_no_balance: finalUsersNoBalance,
                users_low_balance: finalUsersLowBalance,
                signups_in_range: finalSignupsInRange,
                signups_today: finalSignupsToday,
                signups_yesterday: finalSignupsYesterday
            },
            daily_stats: {
                labels: chartDates,
                revenue: chartDates.map(d => parseFloat((revenueGrouped[d] * ordersMultiplier).toFixed(2))),
                orders: chartDates.map(d => Math.round(ordersGrouped[d] * ordersMultiplier)),
                signups: chartDates.map(d => Math.round(signupsGrouped[d] * ordersMultiplier)),
                cost: chartDates.map(d => parseFloat((costGrouped[d] * ordersMultiplier).toFixed(2))),
                profit: chartDates.map(d => parseFloat(((revenueGrouped[d] - costGrouped[d]) * ordersMultiplier).toFixed(2)))
            }
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
