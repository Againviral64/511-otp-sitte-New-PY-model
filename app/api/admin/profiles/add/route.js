import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAdmin } from '@/lib/middleware';

export async function POST(request) {
    try {
        await verifyAdmin(request);
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ success: false, message: 'Please specify the email to add.' });
        }
        const cleanEmail = email.trim().toLowerCase();

        if (isMock || !supabase) {
            return NextResponse.json({ success: true, message: 'Added admin profile (Mock Mode).' });
        }

        const { data: userProfile, error: userError } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (userError || !userProfile) {
            return NextResponse.json({ success: false, message: 'User profile with this email was not found. They must sign up first.' });
        }

        const { error: insertError } = await supabase
            .from('admin_profiles')
            .insert([{ id: userProfile.id, email: userProfile.email }]);

        if (insertError) {
            if (insertError.code === '23505') {
                return NextResponse.json({ success: false, message: 'This user is already an admin.' });
            }
            return NextResponse.json({ success: false, message: insertError.message });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
