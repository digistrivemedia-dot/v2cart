"use client";

import { useState } from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";

export const FAQSection = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: "How do you ensure the quality of your products?",
      answer: "Every product on InveztIN is sourced from vetted vendors and undergoes quality checks before it's listed. We partner with sellers known for reliability and consistent quality — so you get exactly what you ordered.",
    },
    {
      question: "Do you offer delivery support?",
      answer: "Yes! We provide doorstep delivery to your address. You can track your order status from your account at any time after checkout.",
    },
    {
      question: "What is your return and exchange policy?",
      answer: "We accept returns or exchanges within 7 days of purchase for unused, unopened products in original packaging. In case of any manufacturing defects, we work directly with the vendor to ensure a swift replacement. Please contact our team with your order details and we'll sort it out promptly.",
    },
    {
      question: "Can your team help me choose the right product?",
      answer: "Absolutely! Reach out via the WhatsApp or Call buttons on any product page or contact our support team, and we'll help you find the right fit for your needs and budget.",
    },
    {
      question: "How do I get in touch with support?",
      answer: "You can reach us via the contact details in the footer, or use the WhatsApp or Call buttons on any product page. Our team typically responds within one business day.",
    },
  ];

  return (
    <div className="bg-slate-900 text-white rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-6">FAQ&apos;s</h2>
      <div className="space-y-3">
        {faqs.map((faq, index) => (
          <div key={index} className="border border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full flex justify-between items-center p-4 hover:bg-slate-800 transition-colors text-left"
            >
              <span className="font-semibold pr-4">{faq.question}</span>
              {openIndex === index ? (
                <FaChevronUp className="flex-shrink-0 text-orange-500" />
              ) : (
                <FaChevronDown className="flex-shrink-0 text-slate-400" />
              )}
            </button>
            {openIndex === index && (
              <div className="px-4 pb-4 text-slate-300 bg-slate-800">
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
