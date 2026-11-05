"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { HiSearch, HiFilter, HiCalendar, HiUser, HiEye, HiClock, HiArrowRight, HiTag } from "react-icons/hi";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

interface Blog {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImage: string;
  author: string;
  category: string;
  tags: string[];
  views: number;
  publishedAt: string;
}

const BLOG_CATEGORIES = [
  'All',
  'Product Trends',
  'Installation Tips',
  'Design Ideas',
  'Maintenance Guide',
  'Product Reviews',
  'Industry News',
  'DIY Projects',
  'Case Studies'
];

export default function BlogsPage() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchBlogs();
  }, [selectedCategory, page]);

  const fetchBlogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '9',
      });

      if (selectedCategory !== 'All') {
        params.append('category', selectedCategory);
      }

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(`${API_BASE_URL}/blogs?${params}`);

      // Check if response is ok and content-type is JSON
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error('Response is not JSON:', await response.text());
        throw new Error("Server returned non-JSON response");
      }

      const data = await response.json();

      if (data.success) {
        setBlogs(data.blogs);
        setTotalPages(data.totalPages || 1);
      } else {
        console.error('API returned error:', data.message);
      }
    } catch (error) {
      console.error('Error fetching blogs:', error);
      // Show empty state instead of breaking
      setBlogs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchBlogs();
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Product Trends': 'bg-purple-500',
      'Installation Tips': 'bg-blue-500',
      'Design Ideas': 'bg-green-500',
      'Maintenance Guide': 'bg-yellow-500',
      'Product Reviews': 'bg-red-500',
      'Industry News': 'bg-indigo-500',
      'DIY Projects': 'bg-pink-500',
      'Case Studies': 'bg-teal-500',
    };
    return colors[category] || 'bg-slate-500';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section - Refined and Minimal */}
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
        {/* Subtle Pattern Overlay */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}></div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 py-20 md:py-28">
          <div className="max-w-3xl mx-auto text-center">
            {/* Small Label */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full mb-6">
              <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
              <span className="text-sm font-medium text-orange-100">Insights & Inspiration</span>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight">
              InveztIN blogs 
            </h1>
            <p className="text-xl text-slate-300 mb-10 leading-relaxed">
              Expert advice, buying guides, and the latest product trends
            </p>

            {/* Search Bar - More Refined */}
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
              <div className="relative group">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search articles, tips, and guides..."
                  className="w-full px-6 py-5 pl-14 rounded-2xl text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-2xl transition-all placeholder:text-slate-400"
                />
                <HiSearch className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all font-medium shadow-lg hover:shadow-xl"
                >
                  Search
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-16">
        {/* Category Filter - Cleaner Design for filter */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Filter by Category</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {BLOG_CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => {
                  setSelectedCategory(category);
                  setPage(1);
                }}
                className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  selectedCategory === category
                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Blog Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="w-12 h-12 border-3 border-slate-200 border-t-slate-900 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-500 text-sm">Loading articles...</p>
            </div>
          </div>
        ) : blogs.length === 0 ? (
          <div className="text-center py-32">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <HiTag className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">No Articles Found</h3>
            <p className="text-slate-500">Try adjusting your filters or search query</p>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {blogs.map((blog) => (
                <Link
                  key={blog._id}
                  href={`/blogs/${blog.slug}`}
                  className="group bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-xl transition-all duration-300 overflow-hidden"
                >
                  {/* Image */}
                  <div className="relative h-56 overflow-hidden bg-slate-50">
                    {blog.featuredImage ? (
                      <img
                        src={blog.featuredImage}
                        alt={blog.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <HiTag className="w-16 h-16" />
                      </div>
                    )}
                    {/* Category Badge - More Subtle */}
                    <div className="absolute top-4 left-4">
                      <span className={`px-3 py-1.5 ${getCategoryColor(blog.category)} text-white text-xs font-semibold rounded-lg shadow-lg backdrop-blur-sm`}>
                        {blog.category}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-6">
                    {/* Meta Info */}
                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                      <div className="flex items-center gap-1.5">
                        <HiCalendar className="w-3.5 h-3.5" />
                        <time dateTime={blog.publishedAt}>
                          {new Date(blog.publishedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            timeZone: 'UTC'
                          })}
                        </time>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <HiClock className="w-3.5 h-3.5" />
                        <span>5 min read</span>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="font-bold text-xl text-slate-900 mb-3 line-clamp-2 group-hover:text-slate-700 transition-colors leading-snug">
                      {blog.title}
                    </h3>

                    {/* Excerpt */}
                    <p className="text-sm text-slate-600 mb-5 line-clamp-2 leading-relaxed">
                      {blog.excerpt}
                    </p>

                    {/* Author & Read More */}
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-bold">
                          {blog.author.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-slate-700">{blog.author}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-900 font-medium text-sm group-hover:gap-2.5 transition-all">
                        <span>Read</span>
                        <HiArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination - Refined */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-16">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
                >
                  Previous
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-10 h-10 rounded-xl font-medium transition-all text-sm ${
                        page === p
                          ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
