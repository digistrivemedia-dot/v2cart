import { config } from "@/constants/config";

export default function ShippingPolicy() {
    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-white rounded-lg shadow-sm p-8 md:p-12">
                    <h1 className="text-4xl font-bold text-slate-900 mb-4">Shipping & Delivery Policy</h1>
                    <p className="text-sm text-slate-500 mb-8">Last updated: January 31, 2026</p>

                    <div className="prose prose-slate max-w-none">
                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">1. Shipping Overview</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                At {config.appName}, we are committed to delivering your orders safely and on time.
                                We take care to package every product appropriately for its size and fragility.
                            </p>
                            <p className="text-slate-600 leading-relaxed">
                                This policy outlines our shipping procedures, delivery timelines, and important information about receiving your order.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">2. Shipping Coverage</h2>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">2.1 Delivery Locations</h3>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                We currently deliver to:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>All major cities across India</li>
                                <li>Most tier-2 and tier-3 cities</li>
                                <li>Select rural areas (subject to courier serviceability)</li>
                            </ul>
                            <p className="text-slate-600 leading-relaxed">
                                Please enter your PIN code at checkout to verify delivery availability in your area.
                            </p>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">2.2 Non-Serviceable Areas</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Some remote locations may not be serviceable. We will notify you within 24 hours if we cannot deliver to your address
                                and offer alternative solutions or a full refund.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">3. Delivery Timeline</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                Estimated delivery timelines depend on your location, the vendor, and product availability:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Standard delivery: 3-7 business days for most locations</li>
                                <li>Remote areas: 7-12 business days</li>
                                <li>You will receive an estimated delivery date at checkout and a confirmation once your order ships</li>
                            </ul>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-blue-900 font-medium mb-1 text-sm">Need urgent delivery?</p>
                                <p className="text-slate-700 text-sm leading-relaxed">
                                    Contact customer support after placing your order and we will do our best to accommodate urgent requests based on availability.
                                </p>
                            </div>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">4. Shipping Charges</h2>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li><strong>Orders above ₹2,000:</strong> Free standard shipping</li>
                                <li><strong>Orders below ₹2,000:</strong> A flat shipping fee applies, shown at checkout before payment</li>
                                <li><strong>Bulk or oversized orders:</strong> Shipping cost calculated based on weight and destination</li>
                            </ul>
                            <p className="text-slate-600 leading-relaxed">
                                Exact shipping charges are always displayed at checkout before you complete your order.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">5. Packaging and Handling</h2>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                We take care in packaging every order to prevent damage in transit:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>Original manufacturer packaging retained where possible</li>
                                <li>Additional protective packaging for fragile items</li>
                                <li>Sturdy outer boxes suited to the product</li>
                                <li>&quot;Fragile&quot; and &quot;Handle with Care&quot; labels where applicable</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">6. Order Tracking</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                Stay updated on your order status:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Order confirmation email with order number</li>
                                <li>Shipping confirmation with tracking number</li>
                                <li>Real-time tracking via courier partner website</li>
                                <li>SMS and email updates at each delivery milestone</li>
                                <li>Track order status in your account dashboard</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">7. Delivery Process</h2>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">7.1 Before Delivery</h3>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Delivery partner will call before arrival where possible</li>
                                <li>Ensure someone is available to receive the delivery</li>
                                <li>Keep your order number and ID proof ready</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">7.2 During Delivery</h3>
                            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 mb-4">
                                <p className="text-slate-700 font-medium mb-2">Important: Inspect Before Accepting</p>
                                <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                    <li>Check the package(s) against the invoice</li>
                                    <li>Inspect outer packaging for visible damage</li>
                                    <li>Report damage immediately and take photos before accepting</li>
                                    <li>Do not accept delivery if major damage is visible</li>
                                </ul>
                            </div>

                            <div className="bg-red-50 border-l-4 border-red-400 p-6">
                                <p className="text-slate-700 font-medium mb-2">Inspect on Delivery</p>
                                <p className="text-slate-600 text-sm leading-relaxed">
                                    All products must be inspected and verified <strong>immediately at the time of delivery</strong>.
                                    Once delivery is accepted without raising a concern, it will be considered the customer&apos;s responsibility thereafter.
                                </p>
                            </div>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">7.3 After Delivery</h3>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                                <li>Store products as recommended for the item type</li>
                                <li>Report any hidden damage within 48 hours</li>
                                <li>Retain packaging materials until you are satisfied with the product</li>
                            </ul>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">8. Delivery Attempts</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                Our delivery partners will make up to 3 delivery attempts:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li><strong>1st Attempt:</strong> Scheduled delivery date</li>
                                <li><strong>2nd Attempt:</strong> Next business day</li>
                                <li><strong>3rd Attempt:</strong> Within 2 business days</li>
                            </ul>
                            <p className="text-slate-600 leading-relaxed">
                                If all attempts fail, the order will be returned to the vendor. You may be charged return shipping fees for re-delivery.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">9. Delivery Issues</h2>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">9.1 Damaged Delivery</h3>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                If your order arrives damaged:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Note damage on the delivery receipt</li>
                                <li>Take clear photos of damaged items and packaging</li>
                                <li>Contact us immediately at {config.contact.email}</li>
                                <li>We will arrange replacement or refund within 48 hours</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">9.2 Missing Items</h3>
                            <p className="text-slate-600 leading-relaxed mb-3">
                                If you receive fewer items than ordered:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mb-4">
                                <li>Check the delivery receipt for quantity</li>
                                <li>Contact us within 24 hours</li>
                                <li>Provide order number and delivery receipt</li>
                                <li>We will ship missing items at no extra cost</li>
                            </ul>

                            <h3 className="text-xl font-medium text-slate-700 mb-3 mt-6">9.3 Delayed Delivery</h3>
                            <p className="text-slate-600 leading-relaxed">
                                If your order is delayed beyond the estimated delivery date, please contact our customer service.
                                We will track your shipment and provide updates.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">10. International Shipping</h2>
                            <p className="text-slate-600 leading-relaxed">
                                Currently, we only ship within India. International shipping is not available at this time.
                            </p>
                        </section>

                        <section className="mb-8">
                            <h2 className="text-2xl font-semibold text-slate-800 mb-4">11. Contact Shipping Support</h2>
                            <p className="text-slate-600 leading-relaxed mb-4">
                                For shipping and delivery inquiries:
                            </p>
                            <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                                <p className="text-slate-700 font-medium mb-3">{config.appName} - Shipping Department</p>
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
