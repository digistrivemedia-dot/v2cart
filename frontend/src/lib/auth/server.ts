import { cookies } from 'next/headers';

/**
 * Server-side authentication utilities
 * Reads user data from cookies set during login
 */

export async function getUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return null;
    }

    // In a real app, you would verify the token with your backend
    // For now, we'll decode it if it's a JWT or use a simple approach
    // Since we store user in localStorage on client, we need to use cookies here

    const userCookie = cookieStore.get('user')?.value;
    if (userCookie) {
      try {
        return JSON.parse(userCookie);
      } catch {
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

export async function getSession() {
  const user = await getUser();

  if (!user) {
    return null;
  }

  return {
    user,
    session: {
      id: user.id || 'session',
      expiresAt: new Date(Date.now() + 86400000),
    },
  };
}

export async function requireAuth() {
  const user = await getUser();

  if (!user) {
    return null;
  }

  return user;
}

export async function isAdmin() {
  const user = await getUser();
  return user?.role === 'admin';
}
