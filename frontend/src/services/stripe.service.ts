// Mock Stripe service for frontend-only app

export async function createCheckoutSession() {
  console.log("Mock: Create checkout session");
  return { url: "#checkout", sessionId: "mock-session" };
}

export async function createPaymentIntent() {
  console.log("Mock: Create payment intent");
  return { clientSecret: "mock-secret", id: "mock-payment" };
}

export async function fetchCheckoutData(sessionId: string) {
  console.log("Mock: Fetch checkout data", sessionId);
  return {
    success: true,
    orderId: "mock-order-123",
    metadata: {
      orderId: "mock-order-123",
    },
    customer_details: {
      name: "Demo User",
      email: "demo@example.com",
    },
    customerInfo: {
      name: "Demo User",
      email: "demo@example.com",
    },
  };
}
