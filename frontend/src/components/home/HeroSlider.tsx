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
    image: { url: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=2000" },
    title: "Infinite Potential. Zero Risk.",
    subtitle: "Buy, sell, and invest — all in one marketplace built for vendors, investors, and customers.",
    ctaText: "Explore Collection",
    ctaLink: "/search",
  },
  {
    id: 2,
    mediaType: "image" as const,
    image: { url: "https://images.unsplash.com/photo-1607082349566-187342175e2f?q=80&w=2000" },
    title: "Your Trusted Marketplace",
    subtitle: "Wide range. Competitive pricing. Trusted vendors. Everything you need, in one place.",
    ctaText: "Explore Collection",
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

  // Fetch sliders on mount
  useEffect(() => {
    const fetchSliders = async () => {
      try {
        const sliders = await getAllSliders();
        if (sliders && sliders.length > 0) {
          setSlides(sliders);
        }
      } catch (error) {
        console.error("Error fetching sliders:", error);
        // Keep default slides on error
      } finally {
        setLoading(false);
      }
    };

    fetchSliders();
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
    return <div className="h-screen w-screen bg-slate-100 animate-pulse" />;
  }

  return (
    <section className="relative h-screen w-screen overflow-hidden bg-white -mx-12 sm:-mx-12 lg:-mx-12 xl:-mx-12" style={{ marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)', width: '100vw', maxWidth: '100vw' }}>
      {/* Slides */}
      {slides.map((slide, index) => {
        const slideId = slide._id || slide.id;
        return (
          <div
            key={slideId}
            className={`absolute inset-0 transition-opacity duration-700 ${index === currentSlide ? "opacity-100 z-10" : "opacity-0 z-0"
              }`}
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
                  <div className="absolute inset-0 bg-gradient-to-r from-slate-900/40 to-slate-900/20" />
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
                  <div className="absolute inset-0 bg-gradient-to-r from-slate-900/50 to-slate-900/30" />

                  {/* Mute/Unmute Button for Videos */}
                  {index === currentSlide && (
                    <button
                      onClick={toggleMute}
                      className="absolute top-4 right-4 z-30 bg-black/50 hover:bg-black/70 backdrop-blur-sm p-3 rounded-full transition-colors duration-200"
                      aria-label={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted ? (
                        <FaVolumeMute className="text-white text-xl" />
                      ) : (
                        <FaVolumeUp className="text-white text-xl" />
                      )}
                    </button>
                  )}
                </>
              ) : null}
            </div>

            {/* Content */}
            <div className="relative h-full w-full px-4 sm:px-6 lg:px-12 xl:px-16 flex items-center">
              <div className="max-w-2xl">
                <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight animate-fade-in drop-shadow-lg">
                  {slide.title}
                </h1>
                <p className="text-lg md:text-xl text-gray-200 mb-8 animate-fade-in-delay drop-shadow-md">
                  {slide.subtitle}
                </p>
                <div className="flex flex-wrap gap-4 animate-fade-in-delay-2">
                  <Link
                    href={slide.ctaLink}
                    className="px-8 py-3 bg-brand-gold hover:bg-brand-gold-light text-brand-navy font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-brand-gold/50 hover:scale-105 transform"
                  >
                    {slide.ctaText}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-sm p-3 rounded-full transition-colors duration-200"
        aria-label="Previous slide"
      >
        <FaChevronLeft className="text-white text-xl" />
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-sm p-3 rounded-full transition-colors duration-200"
        aria-label="Next slide"
      >
        <FaChevronRight className="text-white text-xl" />
      </button>

      {/* Dots Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-3">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${index === currentSlide
              ? "bg-brand-gold w-8"
              : "bg-white/50 hover:bg-white/75"
              }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.8s ease-out forwards;
        }

        .animate-fade-in-delay {
          opacity: 0;
          animation: fade-in 0.8s ease-out 0.2s forwards;
        }

        .animate-fade-in-delay-2 {
          opacity: 0;
          animation: fade-in 0.8s ease-out 0.4s forwards;
        }
      `}</style>
    </section>
  );
};
