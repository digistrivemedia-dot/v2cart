"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { FaChevronLeft, FaChevronRight, FaVolumeMute, FaVolumeUp } from "react-icons/fa";
import { getAllSliders } from "@/app/actions/sliderActions";

// Default slides (fallback)
const defaultSlides = [
  {
    id: 1,
    mediaType: "image" as const,
    image: { url: "/banner1.png" },
    title: "Big Savings\nBigger Happiness",
    subtitle: "Best prices on top brands — delivered fast.",
    ctaText: "Shop Now",
    ctaLink: "/search",
  },
  {
    id: 2,
    mediaType: "image" as const,
    image: { url: "/banner2.png" },
    title: "Your Trusted\nMarketplace",
    subtitle: "Wide range. Competitive pricing. Fast delivery.",
    ctaText: "Shop Now",
    ctaLink: "/search",
  },
  {
    id: 3,
    mediaType: "image" as const,
    image: { url: "/banner3.png" },
    title: "Click. Cart.\nCelebrate.",
    subtitle: "Thousands of products, one seamless experience.",
    ctaText: "Explore Now",
    ctaLink: "/search",
  },
];

interface SliderItem {
  _id?: string;
  id?: number;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  mediaType: 'image' | 'video';
  image?: { url: string };
  video?: { url: string };
}

export const HeroSlider = () => {
  const [slides, setSlides] = useState<SliderItem[]>(defaultSlides);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [loading, setLoading] = useState(true);
  const videoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});

  // Fetch sliders on mount — fall back to local banners silently
  useEffect(() => {
    getAllSliders()
      .then((sliders) => { if (sliders?.length > 0) setSlides(sliders); })
      .catch(() => {/* keep default slides */})
      .finally(() => setLoading(false));
  }, []);

  // Auto-play slider
  useEffect(() => {
    if (!isAutoPlaying || loading) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlaying, slides.length, loading]);

  // Handle video playback
  useEffect(() => {
    const currentVideo = videoRefs.current[currentSlide];
    if (currentVideo && slides[currentSlide].mediaType === 'video') {
      currentVideo.play().catch(err => console.error("Video play error:", err));
    }

    // Pause other videos
    Object.entries(videoRefs.current).forEach(([index, video]) => {
      if (video && parseInt(index) !== currentSlide) {
        video.pause();
      }
    });
  }, [currentSlide, slides]);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    setIsAutoPlaying(false);
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
    setIsAutoPlaying(false);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
    setIsAutoPlaying(false);
  };

  const toggleMute = () => {
    const currentVideo = videoRefs.current[currentSlide];
    if (currentVideo) {
      currentVideo.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  if (loading) {
    return <div className="h-52 sm:h-64 w-full bg-slate-200 animate-pulse rounded-xl" />;
  }

  return (
    /* White margin wrapper — gives the 2px breathing room + rounded corners */
    <div className="px-2 pt-2">
    <section
      className="relative h-52 sm:h-64 md:h-72 overflow-hidden rounded-2xl"
    >
      {/* Slides */}
      {slides.map((slide, index) => {
        const slideId = slide._id || slide.id;
        return (
          <div
            key={slideId}
            className={`absolute inset-0 transition-opacity duration-700 ${index === currentSlide ? "opacity-100 z-10" : "opacity-0 z-0"}`}
          >
            {/* Background Media */}
            <div className="absolute inset-0">
              {slide.mediaType === 'image' && slide.image ? (
                <>
                  <Image
                    src={slide.image.url}
                    alt={slide.title}
                    fill
                    className="object-cover"
                    priority={index === 0}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-brand-navy/55 via-brand-navy/35 to-brand-navy/10" />
                </>
              ) : slide.mediaType === 'video' && slide.video ? (
                <>
                  <video
                    ref={(el) => { videoRefs.current[index] = el; }}
                    src={slide.video.url}
                    className="w-full h-full object-cover"
                    loop
                    muted={isMuted}
                    playsInline
                    autoPlay={index === currentSlide}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-brand-navy/55 via-brand-navy/35 to-brand-navy/10" />
                  {index === currentSlide && (
                    <button
                      onClick={toggleMute}
                      className="absolute top-3 right-3 z-30 bg-black/40 hover:bg-black/60 p-2 rounded-full transition-colors"
                      aria-label={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted ? <FaVolumeMute className="text-white text-sm" /> : <FaVolumeUp className="text-white text-sm" />}
                    </button>
                  )}
                </>
              ) : null}
            </div>

            {/* Content */}
            <div className="relative h-full w-full px-6 sm:px-10 lg:px-16 flex items-center">
              <div>
                <p className="text-brand-gold text-xs sm:text-sm font-semibold uppercase tracking-widest mb-1 animate-fade-in">
                  Upto 70% OFF
                </p>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white leading-tight mb-3 animate-fade-in drop-shadow whitespace-pre-line">
                  {slide.title}
                </h1>
                <Link
                  href={slide.ctaLink}
                  className="inline-block px-6 py-2 bg-brand-gold hover:bg-brand-gold-light text-white font-bold text-sm rounded-lg transition-all duration-200 shadow-lg hover:scale-105 animate-fade-in-delay"
                >
                  {slide.ctaText}
                </Link>
              </div>
            </div>
          </div>
        );
      })}

      {/* Nav Arrows */}
      <button
        onClick={prevSlide}
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-white/20 hover:bg-white/40 backdrop-blur-sm p-2 rounded-full transition-colors"
        aria-label="Previous slide"
      >
        <FaChevronLeft className="text-white text-sm" />
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-white/20 hover:bg-white/40 backdrop-blur-sm p-2 rounded-full transition-colors"
        aria-label="Next slide"
      >
        <FaChevronRight className="text-white text-sm" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`h-1.5 rounded-full transition-all duration-300 ${index === currentSlide ? "bg-brand-gold w-6" : "bg-white/50 hover:bg-white/75 w-1.5"}`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes fade-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .animate-fade-in { animation: fade-in 0.6s ease-out forwards; }
        .animate-fade-in-delay { opacity:0; animation: fade-in 0.6s ease-out 0.2s forwards; }
      `}</style>
    </section>
    </div>
  );
};
