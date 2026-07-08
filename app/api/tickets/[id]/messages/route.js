import { NextResponse } from 'next/server';
import supabase, { isMock } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

// Local Memory mock messages fallback
let mockTicketMessages = [];

export async function GET(request, { params }) {
    try {
        const user = await verifyAuth(request);
        const { id } = await params;
        const ticketId = parseInt(id);

        if (isMock || !supabase) {
            const ticketMessages = mockTicketMessages.filter(m => m.ticket_id === ticketId);
            return NextResponse.json({ success: true, messages: ticketMessages });
        }

        const { data: ticket } = await supabase
            .from('tickets')
            .select('user_id')
            .eq('id', ticketId)
            .maybeSingle();

        if (!ticket || ticket.user_id !== user.id) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
        }

        const { data, error } = await supabase
            .from('ticket_messages')
            .select(`
                id,
                ticket_id,
                sender_id,
                message,
                created_at,
                profiles (
                    email
                )
            `)
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (error) return NextResponse.json({ success: false, message: error.message });

        const mapped = data.map(m => ({
            id: m.id,
            ticket_id: m.ticket_id,
            sender_id: m.sender_id,
            sender_email: m.profiles ? m.profiles.email : 'System Support',
            message: m.message,
            created_at: m.created_at
        }));

        return NextResponse.json({ success: true, messages: mapped });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}

export async function POST(request, { params }) {
    try {
        const user = await verifyAuth(request);
        const { id } = await params;
        const ticketId = parseInt(id);
        const { message } = await request.json();

        if (!message || message.trim() === '') {
            return NextResponse.json({ success: false, message: 'Message cannot be empty.' });
        }

        if (isMock || !supabase) {
            const newMessage = {
                id: mockTicketMessages.length + 1,
                ticket_id: ticketId,
                sender_id: user.id,
                sender_email: user.email,
                message: message.trim(),
                created_at: new Date().toISOString()
            };
            mockTicketMessages.push(newMessage);
            return NextResponse.json({ success: true });
        }

        const { data: ticket } = await supabase
            .from('tickets')
            .select('user_id')
            .eq('id', ticketId)
            .maybeSingle();

        if (!ticket || ticket.user_id !== user.id) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
        }

        const { error } = await supabase
            .from('ticket_messages')
            .insert([{
                ticket_id: ticketId,
                sender_id: user.id,
                message: message.trim()
            }]);

        if (error) return NextResponse.json({ success: false, message: error.message });

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
