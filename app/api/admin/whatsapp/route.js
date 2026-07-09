import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

// Global variable for mock settings persistence in dev mode
let mockWhatsappSettings = {
    whatsapp_number: '923001234567',
    default_message: 'Hello Nova OTP Team,\nI need assistance regarding my account.',
    is_enabled: true
};

export async function GET(request) {
    try {
        await verifyAdmin(request);

        if (isMock || !supabase) {
            return NextResponse.json({ success: true, settings: mockWhatsappSettings });
        }

        const { data, error } = await supabase
            .from('whatsapp_settings')
            .select('whatsapp_number, default_message, is_enabled')
            .eq('id', 1)
            .maybeSingle();

        if (error) throw error;

        const settings = data || mockWhatsappSettings;
        return NextResponse.json({ success: true, settings });
    } catch (e) {
        return NextResponse.json({ success: false, message: 'Failed to retrieve settings: ' + e.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        await verifyAdmin(request);
        const { whatsapp_number, default_message, is_enabled } = await request.json();

        // Validation: Only digits, length between 10 and 15
        const numberStr = whatsapp_number ? whatsapp_number.toString().trim() : '';
        if (!/^\d{10,15}$/.test(numberStr)) {
            return NextResponse.json({ success: false, message: 'Invalid WhatsApp Number. Only digits are allowed (no +, -, spaces, or brackets), with length between 10 and 15 digits.' });
        }

        if (!default_message || default_message.trim() === '') {
            return NextResponse.json({ success: false, message: 'Default message cannot be empty.' });
        }

        if (isMock || !supabase) {
            mockWhatsappSettings = {
                whatsapp_number: numberStr,
                default_message,
                is_enabled: !!is_enabled
            };
            return NextResponse.json({ success: true, message: 'Mock settings updated successfully!' });
        }

        const { data: existing } = await supabase
            .from('whatsapp_settings')
            .select('id')
            .eq('id', 1)
            .maybeSingle();

        if (existing) {
            const { error } = await supabase
                .from('whatsapp_settings')
                .update({
                    whatsapp_number: numberStr,
                    default_message,
                    is_enabled: !!is_enabled,
                    updated_at: new Date().toISOString()
                })
                .eq('id', 1);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('whatsapp_settings')
                .insert([{
                    id: 1,
                    whatsapp_number: numberStr,
                    default_message,
                    is_enabled: !!is_enabled,
                    updated_at: new Date().toISOString()
                }]);
            if (error) throw error;
        }

        return NextResponse.json({ success: true, message: 'WhatsApp configuration updated successfully!' });
    } catch (e) {
        return NextResponse.json({ success: false, message: 'Failed to update settings: ' + e.message }, { status: 500 });
    }
}
