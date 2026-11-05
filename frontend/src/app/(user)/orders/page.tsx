// Reads the signed-in user's session/order history via the auth cookie —
// must render per-request, not shared across users, so this stays dynamic
// intentionally.
export const dynamic = 'force-dynamic';
import { getUser } from "@/lib/auth/server";
import Link from "next/link";
import { OrdersList } from "@/components/orders/OrdersList";

export async function generateMetadata() {
  return {
    title: `Orders | InveztIN`,
  };
}

const UserOrders = async () => {
  const user = await getUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-4 bg-gray-50">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100">
          <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <h2 className="text-2xl md:text-3xl font-light text-slate-900 text-center">Please Login</h2>
        <p className="text-slate-600 text-center max-w-md font-light text-lg">
          Sign in to view your orders and track your deliveries.
        </p>
        <Link
          href="/login?redirect=/orders"
          className="px-8 py-4 bg-slate-900 text-white rounded-full hover:bg-slate-800 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 font-medium"
        >
          Login Now
        </Link>
      </div>
    );
  }

  return <OrdersList />;
};

export default UserOrders;
