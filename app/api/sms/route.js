import { NextResponse } from 'next/server';
import supabase, { isMock, apiBase, apiToken, makeRequest, mockOrders } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function GET(request) {
    try {
        const user = await verifyAuth(request);
        const searchParams = new URL(request.url).searchParams;
        const order_id = searchParams.get('order_id');

        if (!order_id) {
            return NextResponse.json({ success: false, message: 'Missing order_id parameters' });
        }

        let status = 'PENDING';
        let otp = null;
        let targetSmsUrl = null;
        let isManualLink = false;
        let orderRow = null;

        if (!isMock && supabase) {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('order_id', order_id)
                .eq('user_id', user.id)
                .maybeSingle();

            if (error) {
                return NextResponse.json({ success: false, message: `Database read error: ${error.message}` });
            }

            if (!data) {
                return NextResponse.json({ success: false, message: 'Order not found in DB.' });
            }

            if (data.status !== 'PENDING') {
                return NextResponse.json({ success: true, status: data.status, otp: data.otp });
            }

            orderRow = data;
            if (data.sms_url) {
                targetSmsUrl = data.sms_url;
                isManualLink = true;
            }
        } else {
            const localIdx = mockOrders.findIndex(o => o.order_id === order_id && o.user_id === user.id);
            if (localIdx === -1) {
                return NextResponse.json({ success: false, message: 'Mock order not found.' });
            }
            if (mockOrders[localIdx].status !== 'PENDING') {
                return NextResponse.json({ success: true, status: mockOrders[localIdx].status, otp: mockOrders[localIdx].otp });
            }
            orderRow = mockOrders[localIdx];
            if (mockOrders[localIdx].sms_url) {
                targetSmsUrl = mockOrders[localIdx].sms_url;
                isManualLink = true;
            }
        }

        let foundOtp = null;
        let fullMessage = null;

        if (isManualLink || targetSmsUrl) {
            const response = await makeRequest(targetSmsUrl);
            if (response && !response.toLowerCase().includes('no message') && !response.toLowerCase().includes('no sms')) {
                fullMessage = response;
                const parts = response.split('|');
                if (parts.length > 1 && parts[0].trim().match(/^\d{4,8}$/)) {
                    foundOtp = parts[0].trim();
                } else {
                    const match = response.match(/\b\d{4,8}\b/);
                    foundOtp = match ? match[0] : null;
                }
            }
        } else {
            if (isMock) {
                const elapsed = (Date.now() - new Date(orderRow.created_at).getTime()) / 1000;
                if (elapsed >= 10 && elapsed <= 300) {
                    const simulatedOtp = `${Math.floor(100000 + Math.random() * 900000)}`;
                    if (!orderRow.otp || orderRow.otp === '------' || orderRow.otp === 'Not Received' || orderRow.otp === 'Waiting...') {
                        foundOtp = simulatedOtp;
                        fullMessage = `[Mock Service] Your verification code is ${simulatedOtp}. Do not share this code with anyone.`;
                    }
                }
            } else {
                const productId = orderRow.product_id;
                const phoneNumber = orderRow.number.replace(/\s+/g, '');
                const msgUrl = `${apiBase.replace(/\/$/, '')}/api/v1/msg?key=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(productId)}&number=${encodeURIComponent(phoneNumber)}`;
                const response = await makeRequest(msgUrl);

                if (response) {
                    try {
                        const json = JSON.parse(response);
                        if (json.code === 200 && json.data && json.data.msg) {
                            fullMessage = json.data.msg;
                            const match = json.data.msg.match(/\b\d{4,8}\b/);
                            foundOtp = match ? match[0] : null;
                        }
                    } catch (e) {
                        // Fallthrough
                    }
                }
            }
        }

        const elapsedSec = (Date.now() - new Date(orderRow.created_at).getTime()) / 1000;
        const isExpired = elapsedSec > 300;

        let finalOtpVal = orderRow.otp || '------';
        if (foundOtp) {
            if (!orderRow.otp || orderRow.otp === '------' || orderRow.otp === 'Not Received') {
                finalOtpVal = foundOtp;
            } else {
                const existingOtps = orderRow.otp.split(',').map(x => x.trim());
                if (!existingOtps.includes(foundOtp)) {
                    finalOtpVal = orderRow.otp + ', ' + foundOtp;
                }
            }
        }

        if (isExpired) {
            status = (finalOtpVal && finalOtpVal !== '------' && finalOtpVal !== 'Not Received' && finalOtpVal !== 'Waiting...') ? 'COMPLETED' : 'EXPIRED';
            if (finalOtpVal === '------') finalOtpVal = 'Not Received';
            
            if (!isMock && supabase) {
                const updatePayload = { status: status, otp: finalOtpVal };
                if (fullMessage) {
                    updatePayload.full_message = fullMessage;
                    updatePayload.received_at = new Date().toISOString();
                }
                try {
                    const { error } = await supabase
                        .from('orders')
                        .update(updatePayload)
                        .eq('order_id', order_id);
                    
                    if (error) {
                        await supabase
                            .from('orders')
                            .update({ status: status, otp: finalOtpVal })
                            .eq('order_id', order_id);
                    }
                } catch (e) {
                    await supabase
                        .from('orders')
                        .update({ status: status, otp: finalOtpVal })
                        .eq('order_id', order_id);
                }

                if (status === 'EXPIRED') {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('balance, spend, total_orders')
                        .eq('id', orderRow.user_id)
                        .maybeSingle();
                    if (profile) {
                        await supabase
                            .from('profiles')
                            .update({
                                balance: parseFloat(profile.balance) + parseFloat(orderRow.price),
                                spend: Math.max(0, parseFloat(profile.spend) - parseFloat(orderRow.price)),
                                total_orders: Math.max(0, parseInt(profile.total_orders) - 1)
                            })
                            .eq('id', orderRow.user_id);
                    }
                }
            } else {
                const localIdx = mockOrders.findIndex(o => o.order_id === order_id);
                if (localIdx !== -1) {
                    mockOrders[localIdx].status = status;
                    mockOrders[localIdx].otp = finalOtpVal;
                    if (fullMessage) {
                        mockOrders[localIdx].full_message = fullMessage;
                        mockOrders[localIdx].received_at = new Date().toISOString();
                    }
                }
            }
        } else {
            status = 'PENDING';
            if (foundOtp) {
                status = 'COMPLETED';
                if (!isMock && supabase) {
                    const updatePayload = { status: 'COMPLETED', otp: finalOtpVal };
                    if (fullMessage) {
                        updatePayload.full_message = fullMessage;
                        updatePayload.received_at = new Date().toISOString();
                    }
                    try {
                        const { error } = await supabase
                            .from('orders')
                            .update(updatePayload)
                            .eq('order_id', order_id);
                        
                        if (error) {
                            await supabase
                                .from('orders')
                                .update({ status: 'COMPLETED', otp: finalOtpVal })
                                .eq('order_id', order_id);
                        }
                    } catch (e) {
                        await supabase
                            .from('orders')
                            .update({ status: 'COMPLETED', otp: finalOtpVal })
                            .eq('order_id', order_id);
                    }
                } else {
                    const localIdx = mockOrders.findIndex(o => o.order_id === order_id);
                    if (localIdx !== -1) {
                        mockOrders[localIdx].status = 'COMPLETED';
                        mockOrders[localIdx].otp = finalOtpVal;
                        if (fullMessage) {
                            mockOrders[localIdx].full_message = fullMessage;
                            mockOrders[localIdx].received_at = new Date().toISOString();
                        }
                    }
                }
            }
        }

        return NextResponse.json({ success: true, status, otp: finalOtpVal, full_message: fullMessage || orderRow.full_message || null });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
}
