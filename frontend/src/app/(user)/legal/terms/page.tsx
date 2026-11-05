import { config } from "@/constants/config";

export default function TermsAndConditions() {
    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-white rounded-lg shadow-sm p-8 md:p-12">
                    <h1 className="text-4xl font-bold text-slate-900 mb-4">Terms and Conditions</h1>
                    <p className="text-sm text-slate-500 mb-8">Last updated: January 31, 2026</p>

                    <div className="prose prose-slate max-w-none">
                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">1. Agreement to Terms</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                Welcome to {config.appName}. By accessing and using our website, you accept and agree to be bound by these
                                Terms and Conditions. If you do not agree to these terms, please do not use our website or services.
                            </p>
                            <p className="text-slate-600 leading-relaxed">
                                These terms apply to all visitors, users, and customers who access or use our marketplace platform, including
                                buyers, vendors, and investors.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">2. Product Information</h2>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">2.1 Product Descriptions</h3>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                We strive to provide accurate descriptions, specifications, and images of every product listed on the platform. However:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Colors may vary slightly due to screen settings and lighting conditions</li>
                                <li>Product listings are provided by independent vendors and may contain minor variations</li>
                                <li>Dimensions and specifications are approximate and may vary within industry standards</li>
                                <li>Product images are for illustrative purposes only</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">2.2 Product Availability</h3>
                            <p className="text-slate-600 leading-relaxed">
                                All products are subject to availability. We reserve the right to discontinue any listing at any time.
                                If a product becomes unavailable after you place an order, we will notify you and offer alternatives or a full refund.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">3. Pricing and Payment</h2>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">3.1 Pricing</h3>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>All prices are listed in Indian Rupees (₹) unless otherwise stated</li>
                                <li>Prices are subject to change without notice</li>
                                <li>The price charged will be the price displayed at the time of order placement</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">3.2 Payment Methods</h3>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                We accept the following payment methods:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Credit/Debit Cards (Visa, Mastercard, RuPay)</li>
                                <li>UPI (Google Pay, PhonePe, Paytm)</li>
                                <li>Net Banking</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">3.3 Payment Security</h3>
                            <p className="text-slate-600 leading-relaxed">
                                All payments are processed through secure, encrypted payment gateways. We do not store your complete
                                card information on our servers.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">4. Orders and Confirmation</h2>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>Order confirmation will be sent to your registered email address</li>
                                <li>We reserve the right to refuse or cancel any order for any reason</li>
                                <li>Orders may be cancelled if payment is not received or verified</li>
                                <li>Custom orders and special requests are subject to vendor approval</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">5. Delivery</h2>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>Delivery times are estimates and not guaranteed</li>
                                <li>Delivery charges vary based on location and order value</li>
                                <li>Customer must be present to receive and inspect the delivery</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">6. Quality and Inspection</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                Customers must inspect products upon delivery:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Check for visible damage, defects, or incorrect items</li>
                                <li>Report any issues immediately to the delivery personnel</li>
                                <li>Note discrepancies on the delivery receipt</li>
                                <li>Claims for damaged or defective products must be made within 48 hours of delivery</li>
                            </ul>

                            <div className="bg-red-50 border-l-4 border-red-400 p-4">
                                <p className="text-slate-700 font-medium mb-2">Inspect on Delivery</p>
                                <p className="text-slate-600 text-sm leading-relaxed">
                                    All products must be inspected and verified <strong>immediately at the time of delivery</strong>.
                                    Once delivery is accepted without raising a concern, it will be considered the customer&apos;s responsibility thereafter.
                                </p>
                            </div>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">7. Warranty</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                Where applicable, products come with a manufacturer&apos;s warranty covering manufacturing defects:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>Warranty period and coverage varies by product and vendor</li>
                                <li>Warranty covers manufacturing defects only</li>
                                <li>Does not cover damage from improper use or maintenance</li>
                                <li>Does not cover normal wear and tear</li>
                                <li>Warranty claims require proof of purchase</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">8. User Accounts</h2>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                When you create an account with us:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>You must provide accurate and complete information</li>
                                <li>You are responsible for maintaining account security</li>
                                <li>You must not share your account credentials</li>
                                <li>You are responsible for all activities under your account</li>
                                <li>We reserve the right to suspend or terminate accounts for violations</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">9. Vendors and Investors</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                In addition to the terms above, vendors and investors using their respective dashboards agree to:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>Provide accurate business/payout details during registration</li>
                                <li>List only products they are authorized to sell (vendors)</li>
                                <li>Understand that investment returns are not guaranteed and depend on product sales (investors)</li>
                                <li>Comply with all applicable platform approval processes</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">10. Intellectual Property</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                All content on this website, including images, text, logos, and designs, is the property of {config.appName}
                                or our vendors and is protected by copyright and trademark laws.
                            </p>
                            <p className="text-slate-600 leading-relaxed">
                                You may not reproduce, distribute, or use any content without written permission.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">11. Limitation of Liability</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                To the maximum extent permitted by law:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>We are not liable for indirect, incidental, or consequential damages</li>
                                <li>Our total liability is limited to the purchase price of the product</li>
                                <li>We are not responsible for delays caused by circumstances beyond our control</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">12. Governing Law</h2>
                            <p className="text-slate-600 leading-relaxed">
                                These Terms and Conditions are governed by the laws of India. Any disputes shall be subject to the
                                exclusive jurisdiction of the applicable courts in India.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">13. Changes to Terms</h2>
                            <p className="text-slate-600 leading-relaxed">
                                We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting.
                                Your continued use of the website constitutes acceptance of the modified terms.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">14. Contact Information</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                For questions about these Terms and Conditions, please contact us:
                            </p>
                            <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                                <p className="text-slate-700 font-medium mb-3">{config.appName}</p>
                                <p className="text-slate-600 text-sm"><strong>Email:</strong> {config.contact.email}</p>
                                <p className="text-slate-600 text-sm mt-1"><strong>Phone:</strong> {config.contact.phone}</p>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
