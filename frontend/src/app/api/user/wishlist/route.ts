import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// In-memory storage for wishlist (in production, use a database)
const wishlistStorage = new Map<string, any[]>();

// CORS headers helper
function setCorsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return setCorsHeaders(new NextResponse(null, { status: 200 }));
}

async function getUserId(request: NextRequest): Promise<string> {
  // Get user ID from session or create a guest session
  const cookieStore = await cookies();
  let userId = cookieStore.get('wishlist_session_id')?.value;

  if (!userId) {
    userId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  return userId;
}

export async function GET(request: NextRequest) {
  const userId = await getUserId(request);
  const items = wishlistStorage.get(userId) || [];

  const response = NextResponse.json({ items });
  response.cookies.set('wishlist_session_id', userId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return setCorsHeaders(response);
}

export async function POST(request: NextRequest) {
  const userId = await getUserId(request);
  const body = await request.json();

  const items = wishlistStorage.get(userId) || [];

  // Check if item already exists
  const existingItem = items.find(item => item.productId === body.productId);

  let item;
  if (!existingItem) {
    item = {
      id: Date.now(),
      userId,
      productId: body.productId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    items.push(item);
    wishlistStorage.set(userId, items);
  } else {
    item = existingItem;
  }

  const response = NextResponse.json({ success: true, items, item });
  response.cookies.set('wishlist_session_id', userId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  });

  return setCorsHeaders(response);
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserId(request);
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');

  if (!productId) {
    const errorResponse = NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    return setCorsHeaders(errorResponse);
  }

  const items = wishlistStorage.get(userId) || [];
  const filteredItems = items.filter(item => item.productId !== productId);

  wishlistStorage.set(userId, filteredItems);

  return setCorsHeaders(NextResponse.json({ success: true, items: filteredItems }));
}
