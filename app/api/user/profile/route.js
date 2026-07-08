import { NextResponse } from 'next/server';
import supabase, { isMock, mockBalance } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function GET(request) {
    try {
        const user = await verifyAuth(request);
        
        if (!supabase) {
            return NextResponse.json({
                success: true,
                profile: {
                    email: user.email,
                    name: user.name || 'User',
                    balance: mockBalance,
                    role: user.role,
                    currency: user.currency || 'PKR',
                    is_admin: user.role === 'admin'
                }
            });
        }

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (error || !profile) {
            return NextResponse.json({ success: false, message: 'Failed to retrieve profile stats.' });
        }

        const { data: adminProfile } = await supabase
            .from('admin_profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();

        const is_admin = (profile.role && profile.role.toLowerCase() === 'admin') || !!adminProfile;

        return NextResponse.json({ 
            success: true, 
            profile: {
                ...profile,
                balance: isMock ? mockBalance : parseFloat(profile.balance || 0),
                is_admin: is_admin
            }
        });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
