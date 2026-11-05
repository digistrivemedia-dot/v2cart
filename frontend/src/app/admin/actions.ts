"use server";

import { cookies } from "next/headers";

export async function getAdminDashboardStats() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            console.error('No auth token found');
            return {
                totalProducts: 0,
                totalOrders: 0,
                totalRevenue: 0,
                totalCustomers: 0,
                recentOrders: [],
            };
        }

        const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

        // Fetch products, orders in parallel
        const [productsRes, ordersRes] = await Promise.all([
            fetch(`${baseUrl}/products`, {
                headers: { 'Cookie': `token=${token}` },
                cache: 'no-store',
            }),
            fetch(`${baseUrl}/admin/orders`, {
                headers: { 'Cookie': `token=${token}` },
                cache: 'no-store',
            }),
        ]);

        const productsData = productsRes.ok ? await productsRes.json() : { products: [] };
        const ordersData = ordersRes.ok ? await ordersRes.json() : { orders: [] };

        const products = productsData.products || [];
        const orders = ordersData.orders || [];

        const totalProducts = products.length;
        const totalOrders = orders.length;

        // Count low stock products (stock < 10)
        const lowStockCount = products.filter((p: any) => (p.stock ?? 0) < 10).length;

        // Calculate total revenue
        const totalRevenue = orders.reduce((sum: number, order: any) => {
            return sum + (order.totalPrice || 0);
        }, 0);

        // Get unique customers
        const uniqueCustomers = new Set(orders.map((order: any) => order.user?._id || order.user).filter(Boolean));
        const totalCustomers = uniqueCustomers.size;

        // Get recent orders (last 5)
        const recentOrders = orders
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);

        return {
            totalProducts,
            totalOrders,
            totalRevenue,
            totalCustomers,
            lowStockCount,
            recentOrders,
        };
    } catch (error) {
        console.error("Error fetching admin stats:", error);
        return {
            totalProducts: 0,
            totalOrders: 0,
            totalRevenue: 0,
            totalCustomers: 0,
            lowStockCount: 0,
            recentOrders: [],
        };
    }
}
