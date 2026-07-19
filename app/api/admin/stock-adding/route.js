import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

// In-memory mock storage fallback for local/database-less mode
let mockStockInventory = [];

export async function GET(request) {
    try {
        await verifyAdmin(request);

        if (isMock || !supabase) {
            const totalAvailable = mockStockInventory.filter(s => s.status === 'available').length;
            const totalUsed = mockStockInventory.filter(s => s.status === 'used').length;
            
            const byServiceMap = {};
            mockStockInventory.forEach(item => {
                if (!byServiceMap[item.service_id]) {
                    byServiceMap[item.service_id] = {
                        service_id: item.service_id,
                        service_name: item.service_name,
                        available: 0,
                        used: 0
                    };
                }
                if (item.status === 'available') byServiceMap[item.service_id].available++;
                if (item.status === 'used') byServiceMap[item.service_id].used++;
            });

            return NextResponse.json({
                success: true,
                stock: mockStockInventory,
                summary: {
                    total_available: totalAvailable,
                    total_used: totalUsed,
                    by_service: Object.values(byServiceMap)
                }
            });
        }

        // Fetch stock inventory from Supabase
        const { data: stockData, error: stockErr } = await supabase
            .from('stock_adding')
            .select('*')
            .order('id', { ascending: false });

        if (stockErr) {
            console.error('Failed to fetch stock_adding from DB:', stockErr.message);
            return NextResponse.json({ 
                success: true, 
                stock: [], 
                summary: { total_available: 0, total_used: 0, by_service: [] },
                warning: stockErr.message 
            });
        }

        const items = stockData || [];
        const totalAvailable = items.filter(s => s.status === 'available').length;
        const totalUsed = items.filter(s => s.status === 'used').length;

        const byServiceMap = {};
        items.forEach(item => {
            if (!byServiceMap[item.service_id]) {
                byServiceMap[item.service_id] = {
                    service_id: item.service_id,
                    service_name: item.service_name,
                    available: 0,
                    used: 0
                };
            }
            if (item.status === 'available') byServiceMap[item.service_id].available++;
            if (item.status === 'used') byServiceMap[item.service_id].used++;
        });

        return NextResponse.json({
            success: true,
            stock: items,
            summary: {
                total_available: totalAvailable,
                total_used: totalUsed,
                by_service: Object.values(byServiceMap)
            }
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}

export async function POST(request) {
    try {
        await verifyAdmin(request);

        const body = await request.json();
        const { service_id, service_name, stock_data } = body;

        if (!service_id || !stock_data || typeof stock_data !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing service_id or stock_data input.' });
        }

        const lines = stock_data.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
            return NextResponse.json({ success: false, message: 'No valid stock lines found in input.' });
        }

        let resolvedServiceName = service_name || `Service ${service_id}`;

        // Look up service app_name if not provided
        if (!isMock && supabase && !service_name) {
            const { data: sRow } = await supabase
                .from('services')
                .select('app_name')
                .eq('service_id', service_id.toString())
                .maybeSingle();

            if (sRow && sRow.app_name) {
                resolvedServiceName = sRow.app_name;
            }
        }

        const validRows = [];
        const invalidLines = [];

        lines.forEach((line, index) => {
            let phone = '';
            let smsUrl = '';

            if (line.includes('|')) {
                const parts = line.split('|');
                phone = parts[0].trim();
                smsUrl = parts.slice(1).join('|').trim();
            } else if (line.includes(',')) {
                const parts = line.split(',');
                phone = parts[0].trim();
                smsUrl = parts.slice(1).join(',').trim();
            }

            if (!phone || !smsUrl) {
                invalidLines.push(`Line ${index + 1}: Invalid format (expected PHONE|SMS_URL)`);
                return;
            }

            // Standardize phone number format (+ prefix)
            if (!phone.startsWith('+')) {
                phone = '+' + phone.replace(/[^\d]/g, '');
            }

            validRows.push({
                service_id: service_id.toString(),
                service_name: resolvedServiceName,
                phone_number: phone,
                sms_url: smsUrl,
                status: 'available',
                created_at: new Date().toISOString()
            });
        });

        if (validRows.length === 0) {
            return NextResponse.json({ 
                success: false, 
                message: 'No valid stock lines could be parsed. Format should be: +13092863999|https://sms-555.com/...',
                invalid_lines: invalidLines
            });
        }

        if (isMock || !supabase) {
            validRows.forEach((r, idx) => {
                mockStockInventory.unshift({
                    id: Date.now() + idx,
                    ...r,
                    order_id: null,
                    used_at: null
                });
            });

            return NextResponse.json({
                success: true,
                count: validRows.length,
                message: `Successfully added ${validRows.length} stock items to mock memory.`,
                invalid_count: invalidLines.length
            });
        }

        const { data: inserted, error: insertErr } = await supabase
            .from('stock_adding')
            .insert(validRows)
            .select();

        if (insertErr) {
            console.error('Failed to insert stock_adding into database:', insertErr.message);
            return NextResponse.json({ 
                success: false, 
                message: `Database error saving stock: ${insertErr.message}` 
            });
        }

        return NextResponse.json({
            success: true,
            count: validRows.length,
            message: `Successfully added ${validRows.length} stock items to database!`,
            invalid_count: invalidLines.length,
            inserted: inserted
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}

export async function DELETE(request) {
    try {
        await verifyAdmin(request);

        const searchParams = new URL(request.url).searchParams;
        const id = searchParams.get('id');
        const service_id = searchParams.get('service_id');

        if (isMock || !supabase) {
            if (id) {
                mockStockInventory = mockStockInventory.filter(s => s.id.toString() !== id.toString());
            } else if (service_id) {
                mockStockInventory = mockStockInventory.filter(s => s.service_id !== service_id);
            }
            return NextResponse.json({ success: true, message: 'Stock item deleted from mock inventory.' });
        }

        if (id) {
            const { error: delErr } = await supabase
                .from('stock_adding')
                .delete()
                .eq('id', id);

            if (delErr) {
                return NextResponse.json({ success: false, message: delErr.message });
            }
        } else if (service_id) {
            const { error: delErr } = await supabase
                .from('stock_adding')
                .delete()
                .eq('service_id', service_id)
                .eq('status', 'available');

            if (delErr) {
                return NextResponse.json({ success: false, message: delErr.message });
            }
        } else {
            return NextResponse.json({ success: false, message: 'Missing id or service_id parameter for deletion.' });
        }

        return NextResponse.json({ success: true, message: 'Stock item(s) deleted successfully.' });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
