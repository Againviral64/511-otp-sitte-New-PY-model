import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';

export async function GET() {
    if (!isMock && supabase) {
        try {
            await supabase.storage.createBucket('deposit-proofs', {
                public: false,
                fileSizeLimit: 5242880, // 5MB
                allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
            });
        } catch (e) {
            // Silently ignore if bucket already exists
        }
    }
    return NextResponse.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_KEY
    });
}
