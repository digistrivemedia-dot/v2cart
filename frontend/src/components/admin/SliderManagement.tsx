"use client";

import { useState, useEffect } from "react";
import { FiPlus, FiEdit2, FiTrash2, FiImage, FiVideo, FiEye, FiEyeOff } from "react-icons/fi";
import Image from "next/image";
import { toast } from "sonner";
import { getAdminSliders, createSlider, updateSlider, deleteSlider } from "@/app/actions/sliderActions";

interface Slider {
    _id: string;
    title: string;
    subtitle: string;
    ctaText: string;
    ctaLink: string;
    mediaType: 'image' | 'video';
    image?: { url: string; public_id: string };
    video?: { url: string; public_id: string; duration: number; format: string };
    isActive: boolean;
    order: number;
}

export const SliderManagement = () => {
    const [sliders, setSliders] = useState<Slider[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSlider, setEditingSlider] = useState<Slider | null>(null);
    const [formData, setFormData] = useState({
        title: "",
        subtitle: "",
        ctaText: "Explore Collection",
        ctaLink: "/search",
        mediaType: "image" as "image" | "video",
        isActive: true,
    });
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string>("");
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetchSliders();
    }, []);

    const fetchSliders = async () => {
        try {
            const result = await getAdminSliders();
            if (result.success) {
                setSliders(result.sliders);
            } else {
                toast.error(result.error || "Failed to load sliders");
            }
        } catch (error) {
            console.error("Error fetching sliders:", error);
            toast.error("Failed to load sliders");
        } finally {
            setLoading(false);
        }
    };

    const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isVideo = formData.mediaType === "video";
        const maxSize = isVideo ? 20 * 1024 * 1024 : 10 * 1024 * 1024; // 20MB for video, 10MB for image

        if (file.size > maxSize) {
            toast.error(`File size must be less than ${maxSize / (1024 * 1024)}MB`);
            return;
        }

        if (isVideo) {
            // Validate video format
            const allowedFormats = ['video/mp4', 'video/webm', 'video/quicktime'];
            if (!allowedFormats.includes(file.type)) {
                toast.error("Please upload MP4, WebM, or MOV format only");
                return;
            }

            // Check video duration
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                window.URL.revokeObjectURL(video.src);
                if (video.duration > 30) {
                    toast.error("Video duration must be less than 30 seconds");
                    return;
                }
                setMediaFile(file);
                setMediaPreview(URL.createObjectURL(file));
            };
            video.src = URL.createObjectURL(file);
        } else {
            setMediaFile(file);
            setMediaPreview(URL.createObjectURL(file));
        }
    };

    const convertToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.title || !formData.subtitle) {
            toast.error("Please fill in all required fields");
            return;
        }

        if (!editingSlider && !mediaFile) {
            toast.error(`Please upload ${formData.mediaType === 'video' ? 'a video' : 'an image'}`);
            return;
        }

        setUploading(true);

        try {
            let uploadData: any = {
                title: formData.title,
                subtitle: formData.subtitle,
                ctaText: formData.ctaText,
                ctaLink: formData.ctaLink,
                mediaType: formData.mediaType,
                isActive: formData.isActive,
            };

            if (mediaFile) {
                const base64 = await convertToBase64(mediaFile);
                if (formData.mediaType === 'image') {
                    uploadData.image = base64;
                } else {
                    uploadData.video = base64;
                }
            }

            let result;
            if (editingSlider) {
                // Update
                result = await updateSlider(editingSlider._id, uploadData);
            } else {
                // Create
                result = await createSlider(uploadData);
            }

            if (result.success) {
                toast.success(editingSlider ? "Slider updated successfully" : "Slider created successfully");
                fetchSliders();
                handleCloseModal();
            } else {
                toast.error(result.error || "Failed to save slider");
            }
        } catch (error: any) {
            console.error("Error saving slider:", error);
            toast.error(error.message || "Failed to save slider");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this slider?")) return;

        try {
            const result = await deleteSlider(id);
            if (result.success) {
                toast.success("Slider deleted successfully");
                fetchSliders();
            } else {
                toast.error(result.error || "Failed to delete slider");
            }
        } catch (error) {
            console.error("Error deleting slider:", error);
            toast.error("Failed to delete slider");
        }
    };

    const handleToggleActive = async (slider: Slider) => {
        try {
            const result = await updateSlider(slider._id, { isActive: !slider.isActive });
            if (result.success) {
                toast.success(`Slider ${!slider.isActive ? 'activated' : 'deactivated'}`);
                fetchSliders();
            } else {
                toast.error(result.error || "Failed to update slider");
            }
        } catch (error) {
            console.error("Error updating slider:", error);
            toast.error("Failed to update slider");
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingSlider(null);
        setFormData({
            title: "",
            subtitle: "",
            ctaText: "Explore Collection",
            ctaLink: "/search",
            mediaType: "image",
            isActive: true,
        });
        setMediaFile(null);
        setMediaPreview("");
    };

    const handleEdit = (slider: Slider) => {
        setEditingSlider(slider);
        setFormData({
            title: slider.title,
            subtitle: slider.subtitle,
            ctaText: slider.ctaText,
            ctaLink: slider.ctaLink,
            mediaType: slider.mediaType,
            isActive: slider.isActive,
        });
        if (slider.mediaType === 'image' && slider.image) {
            setMediaPreview(slider.image.url);
        } else if (slider.mediaType === 'video' && slider.video) {
            setMediaPreview(slider.video.url);
        }
        setShowModal(true);
    };

    if (loading) {
        return <div className="text-center py-12">Loading sliders...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Hero Slider Management</h2>
                    <p className="text-slate-600 mt-1">
                        Manage your homepage hero slider images and videos
                    </p>
                    <p className="text-sm text-slate-500 mt-2">
                        📸 <strong>Recommended Image Size:</strong> 1920x800px (16:9 ratio) |
                        🎥 <strong>Video:</strong> Max 20MB, 30 seconds, MP4/WebM format
                    </p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex shrink-0 items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                    <FiPlus className="w-5 h-5" />
                    Add Slider
                </button>
            </div>

            {/* Sliders List */}
            <div className="grid gap-4">
                {sliders.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
                        <FiImage className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                        <p className="text-slate-600">No sliders yet. Create your first one!</p>
                    </div>
                ) : (
                    sliders.map((slider) => (
                        <div
                            key={slider._id}
                            className={`bg-white rounded-lg border ${slider.isActive ? 'border-slate-200' : 'border-slate-300 opacity-60'
                                } p-4 flex flex-col gap-4 sm:flex-row`}
                        >
                            {/* Media Preview */}
                            <div className="relative h-40 w-full sm:h-32 sm:w-48 flex-shrink-0 bg-slate-100 rounded-lg overflow-hidden">
                                {slider.mediaType === 'image' && slider.image ? (
                                    <Image
                                        src={slider.image.url}
                                        alt={slider.title}
                                        fill
                                        className="object-cover"
                                    />
                                ) : slider.mediaType === 'video' && slider.video ? (
                                    <video
                                        src={slider.video.url}
                                        className="w-full h-full object-cover"
                                        muted
                                    />
                                ) : null}
                                <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                                    {slider.mediaType === 'video' ? <FiVideo /> : <FiImage />}
                                    {slider.mediaType.toUpperCase()}
                                </div>
                            </div>

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                                <h3 className="font-semibold text-lg text-slate-900 mb-1">{slider.title}</h3>
                                <p className="text-slate-600 text-sm mb-2">{slider.subtitle}</p>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 break-all">
                                    <span>CTA: {slider.ctaText}</span>
                                    <span>→</span>
                                    <span>{slider.ctaLink}</span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 sm:flex-col">
                                <button
                                    onClick={() => handleToggleActive(slider)}
                                    className={`p-2 rounded-lg ${slider.isActive
                                        ? 'bg-green-100 text-green-600 hover:bg-green-200'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    title={slider.isActive ? 'Deactivate' : 'Activate'}
                                >
                                    {slider.isActive ? <FiEye /> : <FiEyeOff />}
                                </button>
                                <button
                                    onClick={() => handleEdit(slider)}
                                    className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                                    title="Edit"
                                >
                                    <FiEdit2 />
                                </button>
                                <button
                                    onClick={() => handleDelete(slider._id)}
                                    className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                                    title="Delete"
                                >
                                    <FiTrash2 />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-4 sm:p-6">
                            <h3 className="text-xl font-bold text-slate-900 mb-4">
                                {editingSlider ? 'Edit Slider' : 'Add New Slider'}
                            </h3>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Media Type Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Media Type <span className="text-red-500">*</span>
                                    </label>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, mediaType: 'image' })}
                                            className={`flex-1 p-4 border-2 rounded-lg flex items-center justify-center gap-2 ${formData.mediaType === 'image'
                                                ? 'border-orange-500 bg-orange-50 text-orange-600'
                                                : 'border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            <FiImage className="w-5 h-5" />
                                            Image
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, mediaType: 'video' })}
                                            className={`flex-1 p-4 border-2 rounded-lg flex items-center justify-center gap-2 ${formData.mediaType === 'video'
                                                ? 'border-orange-500 bg-orange-50 text-orange-600'
                                                : 'border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            <FiVideo className="w-5 h-5" />
                                            Video
                                        </button>
                                    </div>
                                </div>

                                {/* Media Upload */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        {formData.mediaType === 'video' ? 'Upload Video' : 'Upload Image'} {!editingSlider && <span className="text-red-500">*</span>}
                                    </label>
                                    <input
                                        type="file"
                                        accept={formData.mediaType === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/*'}
                                        onChange={handleMediaChange}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                                    />
                                    {formData.mediaType === 'video' && (
                                        <p className="text-xs text-slate-500 mt-1">
                                            Max 20MB, 30 seconds, MP4/WebM/MOV format
                                        </p>
                                    )}
                                    {mediaPreview && (
                                        <div className="mt-2 relative w-full h-48 bg-slate-100 rounded-lg overflow-hidden">
                                            {formData.mediaType === 'image' ? (
                                                <Image src={mediaPreview} alt="Preview" fill className="object-cover" />
                                            ) : (
                                                <video src={mediaPreview} controls className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Title */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Title <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                                        placeholder="Enter slider title"
                                        required
                                    />
                                </div>

                                {/* Subtitle */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Subtitle <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        value={formData.subtitle}
                                        onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                                        placeholder="Enter slider subtitle"
                                        rows={3}
                                        required
                                    />
                                </div>

                                {/* CTA Text */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Button Text
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.ctaText}
                                        onChange={(e) => setFormData({ ...formData, ctaText: e.target.value })}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                                        placeholder="Explore Collection"
                                    />
                                </div>

                                {/* CTA Link */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Button Link
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.ctaLink}
                                        onChange={(e) => setFormData({ ...formData, ctaLink: e.target.value })}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                                        placeholder="/search"
                                    />
                                </div>

                                {/* Is Active */}
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                        className="w-4 h-4"
                                    />
                                    <label className="text-sm text-slate-700">Active (show on homepage)</label>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="submit"
                                        disabled={uploading}
                                        className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {uploading ? 'Uploading...' : editingSlider ? 'Update Slider' : 'Create Slider'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCloseModal}
                                        disabled={uploading}
                                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
