import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_KEY
    });
}
