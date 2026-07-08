import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function GET(request) {
    try {
        const user = await verifyAdmin(request);

        if (isMock || !supabase) {
            return NextResponse.json({ success: true, otp_expiry_duration: 5 });
        }

        const { data: configRow } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'otp_expiry_duration')
            .maybeSingle();
 
        const duration = configRow ? parseInt(configRow.value) : 4;
        return NextResponse.json({ success: true, otp_expiry_duration: duration });
    } catch (e) {
        return NextResponse.json({ success: false, message: 'Failed to retrieve settings: ' + e.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const user = await verifyAdmin(request);
        const { duration } = await request.json();
        const durationVal = parseInt(duration);

        if (isNaN(durationVal) || durationVal < 1) {
            return NextResponse.json({ success: false, message: 'Please specify a valid positive countdown timeout duration in minutes.' });
        }

        if (isMock || !supabase) {
            return NextResponse.json({ success: true, message: 'Mock settings updated.' });
        }

        const { data: existing } = await supabase
            .from('settings')
            .select('key')
            .eq('key', 'otp_expiry_duration')
            .maybeSingle();
 
        if (existing) {
            const { error: updError } = await supabase
                .from('settings')
                .update({ value: durationVal.toString() })
                .eq('key', 'otp_expiry_duration');
            if (updError) throw updError;
        } else {
            const { error: insError } = await supabase
                .from('settings')
                .insert([{ key: 'otp_expiry_duration', value: durationVal.toString() }]);
            if (insError) throw insError;
        }

        return NextResponse.json({ success: true, message: 'Configuration saved successfully!' });
    } catch (e) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
