import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiUrl } from "@/lib/utils/api";

/**
 * Thin proxy over the backend's `/cart` endpoints.
 *
 * The cart is stored on the user document in Mongo, which is what makes it
 * the same cart on the website and in the mobile app. This route exists only
 * so the browser keeps talking to a same-origin URL (and so the JWT is read
 * from the cookie server-side rather than handed to client JS).
 *
 * It previously kept a `Map` in this module: that cart was per-server-process,
 * vanished on every redeploy or restart, was keyed by a guest cookie rather
 * than the account, and was invisible to every other client.
 */

function setCorsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

export async function OPTIONS() {
  return setCorsHeaders(new NextResponse(null, { status: 200 }));
}

async function authHeader(): Promise<Record<string, string> | null> {
  const token = (await cookies()).get('token')?.value;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

/**
 * One call to the backend, one response back to the browser.
 *
 * The backend answers every cart mutation with the whole cart, so this always
 * returns `{ items }` — the shape `useCart` already expects. No session means
 * an empty cart rather than an error: the navbar badge renders for signed-out
 * visitors too.
 */
async function forward(
  path: string,
  init: { method: string; body?: unknown }
): Promise<NextResponse> {
  const auth = await authHeader();
  if (!auth) {
    // Reading without a session is just an empty cart — the navbar badge
    // renders for signed-out visitors. Writing has nowhere to go, and must
    // say so rather than pretending it worked.
    return init.method === 'GET'
      ? setCorsHeaders(NextResponse.json({ items: [] }))
      : setCorsHeaders(
          NextResponse.json({ error: 'Please sign in to use your cart' }, { status: 401 })
        );
  }

  try {
    const response = await fetch(`${getApiUrl()}${path}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', ...auth },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return setCorsHeaders(
        NextResponse.json(
          { error: data?.message || 'Cart request failed' },
          { status: response.status }
        )
      );
    }

    return setCorsHeaders(NextResponse.json({ items: data.cart ?? [], count: data.count ?? 0 }));
  } catch (error) {
    console.error('Cart proxy error:', error);
    return setCorsHeaders(
      NextResponse.json({ error: 'Could not reach the cart service' }, { status: 502 })
    );
  }
}

export async function GET() {
  return forward('/cart', { method: 'GET' });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  // The browser sends `productId`; `size`/`color` describe the variant, which
  // is what the backend uses to tell two lines of the same product apart.
  return forward('/cart', {
    method: 'POST',
    body: {
      product: body.productId,
      quantity: body.quantity || 1,
      variant: {
        size: body.size && body.size !== 'default' ? body.size : undefined,
        color: body.color || undefined,
      },
    },
  });
}

export async function PATCH(request: NextRequest) {
  const { itemId, quantity } = await request.json().catch(() => ({}) as any);

  if (!itemId) {
    return setCorsHeaders(NextResponse.json({ error: 'Item ID required' }, { status: 400 }));
  }

  return forward(`/cart/${itemId}`, { method: 'PUT', body: { quantity } });
}

export async function DELETE(request: NextRequest) {
  const itemId = new URL(request.url).searchParams.get('id');

  // No id means "clear the cart" — the existing `clear` mutation calls DELETE
  // with no query string.
  return forward(itemId ? `/cart/${itemId}` : '/cart', { method: 'DELETE' });
}
