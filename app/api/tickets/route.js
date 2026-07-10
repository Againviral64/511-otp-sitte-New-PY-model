import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';
import { checkRateLimit, RATE_LIMITS, getClientKey } from '@/lib/rate-limit';
import { sanitizeText, sanitizeAndTruncate } from '@/lib/sanitize';

// Local Memory mock tickets
let mockTickets = [];
let mockTicketMessages = [];

export async function GET(request) {
    try {
        const user = await verifyAuth(request);

        if (isMock || !supabase) {
            const userTickets = mockTickets.filter(t => t.user_id === user.id);
            return NextResponse.json({ success: true, tickets: userTickets });
        }

        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) return NextResponse.json({ success: false, message: error.message });

        return NextResponse.json({ success: true, tickets: data || [] });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}

export async function POST(request) {
    try {
        // Rate limit check
        const clientKey = getClientKey(request);
        const limit = checkRateLimit(`tickets:${clientKey}`, RATE_LIMITS.TICKETS.maxRequests, RATE_LIMITS.TICKETS.windowMs);
        if (!limit.allowed) {
            return NextResponse.json({ success: false, message: `Too many ticket requests. Please wait ${Math.ceil(limit.retryAfterMs / 1000)} seconds.` }, { status: 429 });
        }

        const user = await verifyAuth(request);
        const { title, category, message, proof_image } = await request.json();

        if (!title || !category || !message) {
            return NextResponse.json({ success: false, message: 'All fields are required.' });
        }

        // Sanitize inputs
        const cleanTitle = sanitizeAndTruncate(title, 255);
        const cleanCategory = sanitizeText(category);
        const cleanMessage = sanitizeAndTruncate(message, 2000);

        if (isMock || !supabase) {
            const ticketId = mockTickets.length + 1;
            const newTicket = {
                id: ticketId,
                user_id: user.id,
                title: cleanTitle,
                category: cleanCategory,
                status: 'OPEN',
                proof_image: proof_image || null,
                created_at: new Date().toISOString()
            };
            mockTickets.unshift(newTicket);

            const newMessage = {
                id: mockTicketMessages.length + 1,
                ticket_id: ticketId,
                sender_id: user.id,
                sender_email: user.email,
                message: cleanMessage,
                created_at: new Date().toISOString()
            };
            mockTicketMessages.push(newMessage);

            return NextResponse.json({ success: true, ticket_id: ticketId });
        }

        // Insert ticket
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .insert([{
                user_id: user.id,
                title: cleanTitle,
                category: cleanCategory,
                status: 'OPEN',
                proof_image: proof_image || null
            }])
            .select()
            .maybeSingle();

        if (ticketError || !ticket) {
            return NextResponse.json({ success: false, message: ticketError ? ticketError.message : 'Failed to create ticket.' });
        }

        // Insert initial message
        const { error: msgError } = await supabase
            .from('ticket_messages')
            .insert([{
                ticket_id: ticket.id,
                sender_id: user.id,
                message: cleanMessage
            }]);

        if (msgError) {
            return NextResponse.json({ success: false, message: msgError.message });
        }

        return NextResponse.json({ success: true, ticket_id: ticket.id });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
