"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { HiArrowLeft, HiCalendar, HiUser, HiEye, HiTag, HiClock, HiShare } from "react-icons/hi";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

interface Blog {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImage: string;
  author: string;
  category: string;
  tags: string[];
  views: number;
  publishedAt: string;
}

export default function BlogPostPage() {
  const params = useParams();
  const router = useRouter();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [relatedBlogs, setRelatedBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.slug) {
      fetchBlog();
    }
  }, [params.slug]);

  const fetchBlog = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/blog/slug/${params.slug}`);
      const data = await response.json();

      if (data.success) {
        setBlog(data.blog);
        fetchRelatedBlogs(data.blog._id);
      } else {
        router.push('/blogs');
      }
    } catch (error) {
      console.error('Error fetching blog:', error);
      router.push('/blogs');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedBlogs = async (blogId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/blog/${blogId}/related`);
      const data = await response.json();

      if (data.success) {
        setRelatedBlogs(data.blogs);
      }
    } catch (error) {
      console.error('Error fetching related blogs:', error);
    }
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

  const handleShare = () => {
    if (navigator.share && blog) {
      navigator.share({
        title: blog.title,
        text: blog.excerpt,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-slate-200 border-t-slate-900 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm">Loading article...</p>
        </div>
      </div>
    );
  }

  if (!blog) {
    return null;
  }

  const readingTime = Math.ceil(blog.content.split(' ').length / 200);

  return (
    <div className="min-h-screen bg-white">
      {/* Back Button - Cleaner */}
      <div className="border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <Link
            href="/blogs"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors font-medium text-sm group"
          >
            <HiArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Articles
          </Link>
        </div>
      </div>

      {/* Article Header */}
      <article className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        {/* Category Badge */}
        <div className="mb-6">
          <span className={`px-4 py-2 ${getCategoryColor(blog.category)} text-white text-sm font-semibold rounded-lg shadow-sm`}>
            {blog.category}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-slate-900 leading-tight tracking-tight">
          {blog.title}
        </h1>

        {/* Excerpt */}
        <p className="text-xl md:text-2xl text-slate-600 mb-10 leading-relaxed">
          {blog.excerpt}
        </p>

        {/* Meta Info - More Refined */}
        <div className="flex flex-wrap items-center gap-6 pb-10 mb-10 border-b border-slate-100">
          {/* Author */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
              {blog.author.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{blog.author}</p>
              <p className="text-xs text-slate-500">Author</p>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-10 bg-slate-200"></div>

          {/* Date & Stats */}
          <div className="flex flex-wrap items-center gap-5 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <HiCalendar className="w-4 h-4 text-slate-400" />
              <time dateTime={blog.publishedAt}>
                {new Date(blog.publishedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  timeZone: 'UTC'
                })}
              </time>
            </div>
            <div className="flex items-center gap-2">
              <HiClock className="w-4 h-4 text-slate-400" />
              <span>{readingTime} min read</span>
            </div>
            <div className="flex items-center gap-2">
              <HiEye className="w-4 h-4 text-slate-400" />
              <span>{blog.views} views</span>
            </div>
          </div>

          {/* Share Button */}
          <button
            onClick={handleShare}
            className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all font-medium text-sm"
          >
            <HiShare className="w-4 h-4" />
            <span>Share</span>
          </button>
        </div>

        {/* Featured Image */}
        {blog.featuredImage && (
          <div className="relative h-[400px] md:h-[500px] rounded-2xl overflow-hidden mb-12 shadow-xl">
            <img
              src={blog.featuredImage}
              alt={blog.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Blog Content - Enhanced Typography */}
        <div
          className="prose prose-lg md:prose-xl max-w-none
            prose-headings:font-bold prose-headings:text-slate-900 prose-headings:tracking-tight
            prose-h1:text-4xl prose-h1:mb-6 prose-h1:mt-12
            prose-h2:text-3xl prose-h2:mb-5 prose-h2:mt-10
            prose-h3:text-2xl prose-h3:mb-4 prose-h3:mt-8
            prose-p:text-slate-700 prose-p:leading-relaxed prose-p:mb-6
            prose-a:text-orange-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline hover:prose-a:text-orange-700
            prose-strong:text-slate-900 prose-strong:font-semibold
            prose-ul:my-6 prose-ul:list-disc prose-ul:pl-6
            prose-ol:my-6 prose-ol:list-decimal prose-ol:pl-6
            prose-li:text-slate-700 prose-li:my-2
            prose-img:rounded-2xl prose-img:shadow-lg prose-img:my-8
            prose-blockquote:border-l-4 prose-blockquote:border-orange-500 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-slate-600 prose-blockquote:my-8
            prose-code:bg-slate-100 prose-code:text-slate-800 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm prose-code:font-mono
            prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-xl prose-pre:p-6 prose-pre:my-8
          "
          dangerouslySetInnerHTML={{ __html: blog.content }}
        />

        {/* Tags Section - Refined */}
        {blog.tags.length > 0 && (
          <div className="mt-16 pt-10 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Tagged With</h3>
            <div className="flex flex-wrap gap-2">
              {blog.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-4 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-100 hover:border-slate-300 transition-all cursor-pointer"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </article>

      {/* Related Articles - Improved */}
      {relatedBlogs.length > 0 && (
        <div className="bg-slate-50 py-16 mt-16">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-10">Related Articles</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedBlogs.map((relatedBlog) => (
                <Link
                  key={relatedBlog._id}
                  href={`/blogs/${relatedBlog.slug}`}
                  className="group bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-300 overflow-hidden"
                >
                  <div className="relative h-48 overflow-hidden bg-slate-50">
                    {relatedBlog.featuredImage ? (
                      <img
                        src={relatedBlog.featuredImage}
                        alt={relatedBlog.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <HiTag className="w-12 h-12" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <span className={`px-3 py-1.5 ${getCategoryColor(relatedBlog.category)} text-white text-xs font-semibold rounded-lg shadow-lg`}>
                        {relatedBlog.category}
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="font-bold text-lg text-slate-900 mb-2 line-clamp-2 group-hover:text-slate-700 transition-colors leading-snug">
                      {relatedBlog.title}
                    </h3>
                    <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                      {relatedBlog.excerpt}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
