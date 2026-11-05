"use server";

import { cookies } from "next/headers";

export async function getAllOrders() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            console.error('No auth token found');
            return [];
        }

        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'}/admin/orders`,
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
            console.error('Failed to fetch orders:', response.status, errorText);
            return [];
        }

        const data = await response.json();
        console.log('Orders data:', data);
        return data.orders || [];
    } catch (error) {
        console.error("Error fetching orders:", error);
        return [];
    }
}
