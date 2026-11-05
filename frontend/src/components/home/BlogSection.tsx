"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FaCalendar, FaUser, FaArrowRight } from "react-icons/fa";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1";

interface Blog {
    _id: string;
    title: string;
    slug: string;
    excerpt: string;
    featuredImage: string;
    author: string;
    category: string;
    publishedAt: string;
}

export const BlogSection = () => {
    const [blogs, setBlogs] = useState<Blog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchLatestBlogs = async () => {
            try {
                setLoading(true);
                setError(false);

                // Fetch more blogs so we can shuffle and show different ones each refresh
                const response = await fetch(`${API_BASE_URL}/blogs/latest?limit=20`);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    throw new Error("Server returned non-JSON response");
                }

                const data = await response.json();

                if (data.success && data.blogs && data.blogs.length > 0) {
                    // Fisher-Yates shuffle for random order on every page load
                    const shuffled = [...data.blogs];
                    for (let i = shuffled.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    }
                    // Show 3 random blogs
                    setBlogs(shuffled.slice(0, 3));
                } else {
                    setBlogs([]);
                }
            } catch (err) {
                console.error("Error fetching latest blogs:", err);
                setError(true);
                setBlogs([]);
            } finally {
                setLoading(false);
            }
        };

        fetchLatestBlogs();
    }, []);

    const formatDate = (dateString: string) => {
        if (!dateString) return "";
        return new Date(dateString).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
        });
    };

    return (
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-gradient-to-b from-white to-gray-50">
            {/* Section Header */}
            <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-3">
                    Latest from Our Blog
                </h2>
                <p className="text-slate-600 text-lg max-w-2xl mx-auto">
                    Expert tips, design inspiration, and industry insights to help you make
                    the best choices
                </p>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-10">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="bg-white rounded-2xl shadow-md overflow-hidden animate-pulse"
                        >
                            <div className="h-56 bg-gray-200" />
                            <div className="p-6 space-y-3">
                                <div className="h-4 bg-gray-200 rounded w-1/2" />
                                <div className="h-6 bg-gray-200 rounded" />
                                <div className="h-6 bg-gray-200 rounded w-3/4" />
                                <div className="h-4 bg-gray-200 rounded" />
                                <div className="h-4 bg-gray-200 rounded w-5/6" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Error State */}
            {!loading && error && (
                <div className="text-center py-12">
                    <p className="text-slate-500">
                        Unable to load blogs right now. Please try again later.
                    </p>
                </div>
            )}

            {/* No Blogs State */}
            {!loading && !error && blogs.length === 0 && (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">📝</div>
                    <p className="text-slate-500 text-lg">
                        No published blogs yet. Check back soon!
                    </p>
                </div>
            )}

            {/* Blog Grid */}
            {!loading && !error && blogs.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-10 cursor-pointer">
                    {blogs.map((blog) => (
                        <Link
                            key={blog._id}
                            href={`/blogs/${blog.slug}`}
                            className="group block bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden hover:-translate-y-2"
                        >
                            <article>
                                {/* Blog Image */}
                                <div className="relative h-56  overflowhidden bg-gradient-to-br from-orange-100 to-orange-200">
                                    {blog.featuredImage ? (
                                        <img
                                            src={blog.featuredImage}
                                            alt={blog.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="text-center">
                                                <div className="text-6xl mb-2">📝</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Category Badge */}
                                    <div className="absolute top-4 left-4">
                                        <span className="px-3 py-1 bg-orange-500 text-white text-xs font-semibold rounded-full">
                                            {blog.category}
                                        </span>
                                    </div>
                                </div>

                                {/* Blog Content */}
                                <div className="p-6">
                                    {/* Meta Info */}
                                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                                        <div className="flex items-center gap-1">
                                            <FaCalendar className="text-orange-500" />
                                            <span>{formatDate(blog.publishedAt)}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <FaUser className="text-orange-500" />
                                            <span>{blog.author}</span>
                                        </div>
                                    </div>

                                    {/* Title */}
                                    <h3 className="text-xl font-bold text-slate-800 mb-3 group-hover:text-orange-600 transition-colors line-clamp-2">
                                        {blog.title}
                                    </h3>

                                    {/* Excerpt */}
                                    <p className="text-slate-600 text-sm mb-4 line-clamp-3">
                                        {blog.excerpt}
                                    </p>

                                    {/* Read More */}
                                    <div className="flex items-center justify-end">
                                        <span className="flex items-center gap-2 text-orange-600 font-semibold text-sm group-hover:gap-3 transition-all">
                                            Read More
                                            <FaArrowRight className="text-xs" />
                                        </span>
                                    </div>
                                </div>
                            </article>
                        </Link>
                    ))}
                </div>
            )}

            {/* View All Blogs Button */}
            <div className="text-center mt-4">
                <Link
                    href="/blogs"
                    className="inline-flex items-center gap-2 px-8 py-3 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition-colors shadow-lg hover:shadow-xl"
                >
                    View All Articles
                    <FaArrowRight />
                </Link>
            </div>
        </section>
    );
};
