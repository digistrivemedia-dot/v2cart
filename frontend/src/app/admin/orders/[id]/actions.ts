"use server";

import { cookies } from "next/headers";

export async function getOrderDetails(orderId: string) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            console.error('No auth token found');
            return null;
        }

        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'}/order/${orderId}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `token=${token}`,
                },
                cache: 'no-store',
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to fetch order details:', response.status, errorText);
            return null;
        }

        const data = await response.json();
        console.log('Order details:', data);
        return data.order || null;
    } catch (error) {
        console.error("Error fetching order details:", error);
        return null;
    }
}
