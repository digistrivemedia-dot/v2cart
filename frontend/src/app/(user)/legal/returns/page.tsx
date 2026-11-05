import { config } from "@/constants/config";

export default function ReturnsAndRefunds() {
    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-white rounded-lg shadow-sm p-8 md:p-12">
                    <h1 className="text-4xl font-bold text-slate-900 mb-4">Returns & Refund Policy</h1>
                    <p className="text-sm text-slate-500 mb-8">Last updated: January 31, 2026</p>

                    <div className="prose prose-slate max-w-none">
                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">1. Return Policy Overview</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                At {config.appName}, we want you to be completely satisfied with your purchase. We strive to ensure
                                quality and customer satisfaction across every product listed on our marketplace.
                            </p>
                            <p className="text-slate-600 leading-relaxed">
                                This policy outlines the conditions under which returns and refunds are accepted for products
                                purchased through our platform.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">2. Return Eligibility</h2>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">2.1 Eligible Returns</h3>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                Returns are accepted under the following conditions:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li><strong>Manufacturing Defects:</strong> Products with visible defects or manufacturing flaws</li>
                                <li><strong>Wrong Product Delivered:</strong> Incorrect color, size, or item received</li>
                                <li><strong>Damaged in Transit:</strong> Products damaged during shipping (must be reported within 48 hours)</li>
                                <li><strong>Quantity Mismatch:</strong> Incorrect quantity delivered</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">2.2 Non-Eligible Returns</h3>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                The following items cannot be returned:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>Products that have been used, altered, or installed</li>
                                <li>Products damaged due to improper handling or storage after delivery</li>
                                <li>Custom-ordered or made-to-order products</li>
                                <li>Clearance or sale items (unless defective)</li>
                                <li>Products for which the return window (7 days) has expired</li>
                                <li>Opened consumable or perishable items</li>
                                <li>Minor variations within acceptable industry standards</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">3. Return Process</h2>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">Step 1: Contact Us</h3>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                Contact our customer service within 7 days of delivery:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Email: {config.contact.email}</li>
                                <li>Phone: {config.contact.phone}</li>
                                <li>Provide order number, product details, and reason for return</li>
                                <li>Include photos of defective or damaged items</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">Step 2: Return Authorization</h3>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                Our team will review your request and provide:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Return Merchandise Authorization (RMA) number</li>
                                <li>Return shipping instructions</li>
                                <li>Pickup scheduling (if applicable)</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">Step 3: Package and Ship</h3>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Pack items securely in original packaging</li>
                                <li>Include all accessories, manuals, and documentation</li>
                                <li>Attach RMA number to the package</li>
                                <li>Ship via approved carrier or wait for pickup</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">Step 4: Inspection and Processing</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Once we receive your return, we will inspect the items and process your refund or replacement within 5-7 business days.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">4. Refund Policy</h2>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">4.1 Refund Methods</h3>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                Approved refunds will be processed to:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Original payment method (credit/debit card, UPI, etc.)</li>
                                <li>Store credit (if preferred)</li>
                                <li>Bank transfer (for cash payments)</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">4.2 Refund Timeline</h3>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Refund initiated within 5-7 business days after inspection</li>
                                <li>Credit card refunds: 5-10 business days</li>
                                <li>UPI/Net Banking: 3-5 business days</li>
                                <li>Bank transfer: 7-10 business days</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">4.3 Refund Amount</h3>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>Full refund for defective or wrong products</li>
                                <li>Shipping charges refunded only if error was on our part</li>
                                <li>Return shipping costs may be deducted for non-defective returns</li>
                                <li>Restocking fee of 10% may apply for certain returns</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">5. Exchange Policy</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                We offer exchanges for:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Defective products (same or similar product)</li>
                                <li>Wrong items delivered (correct product)</li>
                                <li>Different color/variant (subject to availability and price difference)</li>
                            </ul>
                            <p className="text-slate-600 leading-relaxed">
                                Exchange requests must be made within 7 days of delivery. Exchanges are subject to product availability.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">6. Damaged or Defective Items</h2>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">6.1 Reporting Damage</h3>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                For damaged items during delivery:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Inspect packages immediately upon delivery</li>
                                <li>Note any visible damage on the delivery receipt</li>
                                <li>Take photos of damaged packaging and products</li>
                                <li>Report damage within 48 hours to {config.contact.email}</li>
                            </ul>

                            <div className="bg-red-50 border-l-4 border-red-400 p-4">
                                <p className="text-slate-700 font-medium mb-2">Inspect on Delivery</p>
                                <p className="text-slate-600 text-sm leading-relaxed">
                                    All products must be inspected and verified <strong>immediately at the time of delivery</strong>.
                                    Once the delivery is accepted without raising a concern, it will be considered the customer&apos;s responsibility thereafter.
                                </p>
                            </div>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">7. Cancellation Policy</h2>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">7.1 Order Cancellation</h3>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                You can cancel your order:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Within 24 hours of order placement (full refund)</li>
                                <li>Before shipment (full refund minus processing fee)</li>
                                <li>After shipment (subject to return policy)</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">7.2 Cancellation by {config.appName}</h3>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                We reserve the right to cancel orders if:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>Product is out of stock or discontinued</li>
                                <li>Pricing error occurred</li>
                                <li>Payment verification fails</li>
                                <li>Delivery address is unserviceable</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">8. Contact for Returns</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                For return or refund inquiries, please contact our customer service team:
                            </p>
                            <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                                <p className="text-slate-700 font-medium mb-3">{config.appName} - Returns Department</p>
                                <p className="text-slate-600 text-sm"><strong>Email:</strong> {config.contact.email}</p>
                                <p className="text-slate-600 text-sm mt-1"><strong>Phone:</strong> {config.contact.phone}</p>
                                <p className="text-slate-600 text-sm mt-1"><strong>Hours:</strong> Monday - Saturday, 9:00 AM - 6:00 PM</p>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
