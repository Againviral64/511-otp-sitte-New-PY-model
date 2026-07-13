import { NextResponse } from 'next/server';

export async function GET() {
    const url = process.env.TRACKING_API_URL || 'https://site-otp-python-backend-api.onrender.com';
    return NextResponse.json({ url });
}
