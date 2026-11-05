import { config } from "@/constants/config";

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-white rounded-lg shadow-sm p-8 md:p-12">
                    <h1 className="text-4xl font-bold text-slate-900 mb-4">Privacy Policy</h1>
                    <p className="text-sm text-slate-500 mb-8">Last updated: January 31, 2026</p>

                    <div className="prose prose-slate max-w-none">
                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">1. Introduction</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                Welcome to {config.appName}. We are committed to protecting your personal information and your right to privacy.
                                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website
                                and use our marketplace.
                            </p>
                            <p className="text-slate-600 leading-relaxed">
                                By using our website, you agree to the collection and use of information in accordance with this policy.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">2. Information We Collect</h2>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">2.1 Personal Information</h3>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                We collect personal information that you voluntarily provide to us when you:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Register for an account</li>
                                <li>Place an order, list a product as a vendor, or fund a product as an investor</li>
                                <li>Subscribe to our newsletter</li>
                                <li>Contact our customer support</li>
                                <li>Participate in surveys or promotions</li>
                            </ul>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                This information may include: name, email address, phone number, shipping address, billing address, and payment information.
                            </p>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">2.2 Automatically Collected Information</h3>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                When you visit our website, we automatically collect certain information about your device, including:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>IP address and browser type</li>
                                <li>Operating system and device information</li>
                                <li>Pages visited and time spent on pages</li>
                                <li>Referring website addresses</li>
                                <li>Cookies and similar tracking technologies</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">3. How We Use Your Information</h2>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                We use the information we collect to:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>Process and fulfill your orders</li>
                                <li>Send order confirmations and shipping updates</li>
                                <li>Provide customer support and respond to inquiries</li>
                                <li>Send promotional emails about new products and special offers (with your consent)</li>
                                <li>Improve our website, products, and services</li>
                                <li>Detect and prevent fraud or unauthorized activities</li>
                                <li>Comply with legal obligations</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">4. Information Sharing and Disclosure</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                We do not sell, trade, or rent your personal information to third parties. We may share your information with:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li><strong>Service Providers:</strong> Payment processors, shipping companies, and delivery partners</li>
                                <li><strong>Business Partners:</strong> Vendors and manufacturers (only when necessary for order fulfillment)</li>
                                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">5. Data Security</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                We implement appropriate technical and organizational security measures to protect your personal information against
                                unauthorized access, alteration, disclosure, or destruction. This includes:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>SSL encryption for data transmission</li>
                                <li>Secure payment processing through trusted gateways</li>
                                <li>Regular security audits and updates</li>
                                <li>Restricted access to personal information</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">6. Your Privacy Rights</h2>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                You have the right to:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>Access and receive a copy of your personal data</li>
                                <li>Correct inaccurate or incomplete information</li>
                                <li>Request deletion of your personal data</li>
                                <li>Opt-out of marketing communications</li>
                                <li>Object to processing of your personal data</li>
                                <li>Request restriction of processing</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">7. Cookies and Tracking Technologies</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                We use cookies and similar tracking technologies to enhance your browsing experience, analyze website traffic,
                                and personalize content. You can control cookies through your browser settings.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">8. Children's Privacy</h2>
                            <p className="text-slate-600 leading-relaxed">
                                Our services are not intended for individuals under the age of 18. We do not knowingly collect personal
                                information from children.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">9. Changes to This Privacy Policy</h2>
                            <p className="text-slate-600 leading-relaxed">
                                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
                                Privacy Policy on this page and updating the "Last updated" date.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">10. Contact Us</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                If you have any questions about this Privacy Policy or our data practices, please contact us:
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
