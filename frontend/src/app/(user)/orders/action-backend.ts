"use server";

import { getApiUrl } from "@/lib/utils/api";

export interface BackendOrder {
    _id: string;
    shippingInfo: {
        address: string;
        city: string;
        state: string;
        country: string;
        pincode: number;
        phoneNo: number;
    };
    orderItems: Array<{
        name: string;
        price: number;
        quantity: number;
        image: string;
        product: string;
    }>;
    user: string;
    paymentInfo: {
        id: string;
        status: string;
    };
    paidAt: string;
    totalPrice: number;
    couponUsed?: string;
    couponCode?: string;
    discountAmount?: number;
    orderStatus: string;
    deliveredAt?: string;
    shippedAt?: string;
    createdAt: string;
}

export const getUserOrders = async (): Promise<BackendOrder[] | null> => {
    try {
        // Get token from localStorage (this won't work in server component)
        // We need to pass it from client or use cookies
        const response = await fetch(`${getApiUrl()}/orders/me`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', // This will send cookies
            cache: 'no-store', // Don't cache orders
        });

        if (!response.ok) {
            console.error('Failed to fetch orders:', response.status);
            return null;
        }

        const data = await response.json();

        if (data.success && data.orders) {
            return data.orders;
        }

        return null;
    } catch (error) {
        console.error("Error fetching orders:", error);
        return null;
    }
};

export const getOrder = async (orderId: string): Promise<BackendOrder | null> => {
    try {
        const response = await fetch(`${getApiUrl()}/order/${orderId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            cache: 'no-store',
        });

        if (!response.ok) {
            console.error('Failed to fetch order:', response.status);
            return null;
        }

        const data = await response.json();

        if (data.success && data.order) {
            return data.order;
        }

        return null;
    } catch (error) {
        console.error("Error fetching order:", error);
        return null;
    }
};
