"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

export async function getAllSliders() {
    try {
        const response = await fetch(`${API_BASE_URL}/sliders`, {
            next: { revalidate: 300 }, // Cache for 5 minutes
        });

        if (!response.ok) {
            throw new Error('Failed to fetch sliders');
        }

        const data = await response.json();
        return data.sliders || [];
    } catch (error) {
        console.error('Error fetching sliders:', error);
        return [];
    }
}

export async function getAdminSliders() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return { success: false, sliders: [], error: 'Unauthorized' };
        }

        const response = await fetch(`${API_BASE_URL}/admin/sliders`, {
            headers: {
                'Cookie': `token=${token}`,
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            throw new Error('Failed to fetch admin sliders');
        }

        const data = await response.json();
        return { success: true, sliders: data.sliders || [] };
    } catch (error) {
        console.error('Error fetching admin sliders:', error);
        return { success: false, sliders: [], error: 'Failed to fetch sliders' };
    }
}

export async function createSlider(formData: any) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return { success: false, error: 'Unauthorized' };
        }

        const response = await fetch(`${API_BASE_URL}/admin/slider/new`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token=${token}`,
            },
            body: JSON.stringify(formData),
        });

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const textResponse = await response.text();
            console.error('Non-JSON response:', textResponse.substring(0, 500));
            return { success: false, error: 'Server returned an invalid response. Please check if the backend server is running.' };
        }

        const data = await response.json();

        if (!response.ok) {
            return { success: false, error: data.message || 'Failed to create slider' };
        }

        revalidatePath('/');
        revalidatePath('/admin/settings');

        return { success: true, slider: data.slider };
    } catch (error: any) {
        console.error('Error creating slider:', error);
        return { success: false, error: error.message || 'Failed to create slider' };
    }
}

export async function updateSlider(id: string, formData: any) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return { success: false, error: 'Unauthorized' };
        }

        const response = await fetch(`${API_BASE_URL}/admin/slider/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token=${token}`,
            },
            body: JSON.stringify(formData),
        });

        const data = await response.json();

        if (!response.ok) {
            return { success: false, error: data.message || 'Failed to update slider' };
        }

        revalidatePath('/');
        revalidatePath('/admin/settings');

        return { success: true, slider: data.slider };
    } catch (error: any) {
        console.error('Error updating slider:', error);
        return { success: false, error: error.message || 'Failed to update slider' };
    }
}

export async function deleteSlider(id: string) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return { success: false, error: 'Unauthorized' };
        }

        const response = await fetch(`${API_BASE_URL}/admin/slider/${id}`, {
            method: 'DELETE',
            headers: {
                'Cookie': `token=${token}`,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            return { success: false, error: data.message || 'Failed to delete slider' };
        }

        revalidatePath('/');
        revalidatePath('/admin/settings');

        return { success: true, message: 'Slider deleted successfully' };
    } catch (error: any) {
        console.error('Error deleting slider:', error);
        return { success: false, error: error.message || 'Failed to delete slider' };
    }
}
