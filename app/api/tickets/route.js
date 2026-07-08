import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

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
            .order('created_at', { ascending: false });

        if (error) return NextResponse.json({ success: false, message: error.message });

        return NextResponse.json({ success: true, tickets: data || [] });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}

export async function POST(request) {
    try {
        const user = await verifyAuth(request);
        const { title, category, message } = await request.json();

        if (!title || !category || !message) {
            return NextResponse.json({ success: false, message: 'All fields are required.' });
        }

        if (isMock || !supabase) {
            const ticketId = mockTickets.length + 1;
            const newTicket = {
                id: ticketId,
                user_id: user.id,
                title,
                category,
                status: 'OPEN',
                created_at: new Date().toISOString()
            };
            mockTickets.unshift(newTicket);

            const newMessage = {
                id: mockTicketMessages.length + 1,
                ticket_id: ticketId,
                sender_id: user.id,
                sender_email: user.email,
                message: message.trim(),
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
                title,
                category,
                status: 'OPEN'
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
                message: message.trim()
            }]);

        if (msgError) {
            return NextResponse.json({ success: false, message: msgError.message });
        }

        return NextResponse.json({ success: true, ticket_id: ticket.id });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
