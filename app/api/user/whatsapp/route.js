import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function GET(request) {
    try {
        await verifyAuth(request);

        if (isMock || !supabase) {
            return NextResponse.json({
                success: true,
                whatsapp_number: '923001234567',
                default_message: 'Hello Nova OTP Team,\nI need assistance regarding my account.',
                is_enabled: true
            });
        }

        const { data, error } = await supabase
            .from('whatsapp_settings')
            .select('whatsapp_number, default_message, is_enabled')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            // Return defaults if table is empty
            return NextResponse.json({
                success: true,
                whatsapp_number: '923001234567',
                default_message: 'Hello Nova OTP Team,\nI need assistance regarding my account.',
                is_enabled: true
            });
        }

        return NextResponse.json({
            success: true,
            whatsapp_number: data.whatsapp_number,
            default_message: data.default_message,
            is_enabled: data.is_enabled
        });
    } catch (e) {
        return NextResponse.json({ success: false, message: 'Failed to retrieve WhatsApp settings: ' + e.message }, { status: 500 });
    }
}
