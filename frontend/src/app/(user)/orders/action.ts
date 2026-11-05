"use server";

import { getApiUrl } from "@/lib/utils/api";
import { OrderWithDetails } from "@/schemas";
import { cookies } from "next/headers";

export const getOrder = async (
  orderId: string
): Promise<OrderWithDetails | null> => {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    if (!token) {
      console.info("No auth token found, cannot fetch order");
      return null;
    }

    const response = await fetch(`${getApiUrl()}/order/${orderId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(`Failed to fetch order ${orderId}, status: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.success && data.order) {
      // The backend response needs to be transformed to match the frontend's OrderWithDetails schema
      const order = data.order;

      console.log('📦 Backend order data:', order);

      return {
        id: order._id,
        orderNumber: order._id.slice(-8).toUpperCase(),
        userId: order.user?._id || order.user || 'unknown',
        user: {
          id: order.user?._id || order.user || 'unknown',
          name: order.user?.name || 'Guest User',
          email: order.user?.email || 'no-email@example.com',
        },
        customerInfo: {
          id: order._id,
          orderId: order._id,
          name: order.user?.name || 'Guest User',
          email: order.user?.email || 'no-email@example.com',
          phone: order.shippingInfo?.phoneNo?.toString() || '',
          address: {
            line1: order.shippingInfo?.address || '',
            city: order.shippingInfo?.city || '',
            state: order.shippingInfo?.state || '',
            postal_code: order.shippingInfo?.pincode?.toString() || '',
            country: order.shippingInfo?.country || 'India',
          },
          totalPrice: order.totalPrice || 0,
        },
        orderProducts: (order.orderItems || []).map((item: any) => ({
          id: item._id || item.product,
          orderId: order._id,
          variantId: item.product,
          quantity: item.quantity || 1,
          size: "600x600",
          variant: {
            id: item.product,
            productId: item.product,
            color: "Default",
            stripeId: "stripe_id_placeholder",
            images: [{ id: 1, url: item.image || '', alt: item.name || 'Product' }],
            product: {
              id: item.product,
              name: item.name || 'Product',
              description: "Product description",
              price: item.price || 0,
              stripeId: "stripe_id_placeholder",
              category: "uncategorized",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        })),
        deliveryDate: new Date(order.deliveredAt || order.createdAt).toISOString(),
        createdAt: new Date(order.createdAt).toISOString(),
        updatedAt: new Date(order.updatedAt || order.createdAt).toISOString(),
      };
    }

    return null;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Error fetching order:", errorMessage);
    return null;
  }
};

export const getUserOrders = async (): Promise<OrderWithDetails[] | null> => {
  // This function is not used by the order details page, 
  // but it's good practice to have it here.
  // The actual implementation is in the OrdersList component for now.
  return [];
};