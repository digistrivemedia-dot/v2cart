"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FiUpload, FiCheck, FiX, FiArrowLeft, FiStar, FiTrash2, FiPlus } from "react-icons/fi";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCategories } from "@/hooks/category/queries/useCategories";
import { colorMapping } from "@/constants/colors";
import { revalidateProducts } from "@/app/actions";
import { ProductPricingPanel } from "@/components/admin/ProductPricingPanel";
import { FieldHint } from "@/components/admin/FieldHint";
import { ProductPreviewCard } from "@/components/admin/ProductPreviewCard";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export default function EditProductPage({ params }: EditProductPageProps) {
  const router = useRouter();
  const [productId, setProductId] = useState<string>(''); // FIX: Added missing state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [product, setProduct] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [selectedSubSubcategory, setSelectedSubSubcategory] = useState('');
  const [imagePreviews, setImagePreviews] = useState<Array<{ file?: File; preview: string; id: string; isExisting?: boolean }>>([]);
  const [featuredImageIndex, setFeaturedImageIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [specCount, setSpecCount] = useState(2);
  // Mirrors a handful of uncontrolled inputs purely so the live preview panel
  // can update as the admin types, without converting the whole form to
  // controlled inputs (which would require touching handleSubmit's FormData reads).
  const [previewState, setPreviewState] = useState({
    name: '', shortDescription: '', price: '', cuttedPrice: '',
  });
  const [careItems, setCareItems] = useState<Array<{ id: string; title: string; description: string }>>([
    { id: crypto.randomUUID?.() || Math.random().toString(36), title: '', description: '' },
  ]);

  // Variants state
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<Array<{
    id: string;
    color: string;
    size: string;
    productId: string;
    finish: string;
    material: string;
    price: string;
    cuttedPrice: string;
    stock: string;
    images: Array<{ preview: string; id: string; isExisting?: boolean }>;
    featuredImageIndex: number;
  }>>([]);

  const { categories, isLoading: categoriesLoading } = useCategories();

  // Get selected category object
  const selectedCategoryObj = categories.find((cat: any) => cat._id === selectedCategory);

  // Get subcategories based on selected parent
  const subcategories = selectedCategoryObj?.children || [];

  // Get selected subcategory object
  const selectedSubcategoryObj = subcategories.find((sub: any) => sub._id === selectedSubcategory);

  // Get sub-subcategories based on selected subcategory
  const subSubcategories = selectedSubcategoryObj?.children || [];

  useEffect(() => {
    params.then(({ id }) => {
      setProductId(id);
      fetchProduct(id);
    });
  }, [params]);

  // Initialize category dropdowns once BOTH product and categories are loaded
  useEffect(() => {
    if (!product || categories.length === 0) return;

    const productCategoryId = product.category?._id || product.category || '';
    const productSubcategoryId = product.subcategory?._id || product.subcategory || '';

    // Check if productCategoryId is a top-level category
    const topLevel = categories.find((cat: any) => cat._id === productCategoryId);
    if (topLevel) {
      setSelectedCategory(topLevel._id);

      if (productSubcategoryId) {
        // Check if it's a direct child (Brand level)
        const brand = topLevel.children?.find((c: any) => c._id === productSubcategoryId);
        if (brand) {
          setSelectedSubcategory(brand._id);
        } else {
          // Check if it's a grandchild (Sub-category level)
          for (const child of (topLevel.children || [])) {
            const subSub = child.children?.find((c: any) => c._id === productSubcategoryId);
            if (subSub) {
              setSelectedSubcategory(child._id);
              setSelectedSubSubcategory(subSub._id);
              break;
            }
          }
        }
      }
    } else {
      // Legacy: product.category was saved as a deeper level — walk the tree to restore all levels
      for (const parent of categories) {
        if (parent._id === productCategoryId) {
          setSelectedCategory(parent._id);
          break;
        }
        if (parent.children) {
          for (const child of parent.children) {
            if (child._id === productCategoryId) {
              setSelectedCategory(parent._id);
              setSelectedSubcategory(child._id);
              break;
            }
            if (child.children) {
              for (const subChild of child.children) {
                if (subChild._id === productCategoryId) {
                  setSelectedCategory(parent._id);
                  setSelectedSubcategory(child._id);
                  setSelectedSubSubcategory(subChild._id);
                  break;
                }
              }
            }
          }
        }
      }
    }
  }, [product, categories]);

  // Seed (and re-sync) the preview from product — covers initial load and
  // pricing-panel updates, which write straight into `product`.
  useEffect(() => {
    if (!product) return;
    setPreviewState({
      name: product.name || '',
      shortDescription: product.shortDescription || '',
      price: String(product.price ?? ''),
      cuttedPrice: String(product.cuttedPrice ?? ''),
    });
  }, [product]);

  const fetchProduct = async (id: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      // Admin-scoped — unlike the public /product/:id, this doesn't 404 for
      // drafts/pending-approval products that admin needs to open and price.
      const response = await fetch(`${API_BASE_URL}/admin/product/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const result = await response.json();

      if (result.success) {
        setProduct(result.product);

        // Set existing images
        if (result.product.images && result.product.images.length > 0) {
          const existingImages = result.product.images.map((img: any, index: number) => ({
            preview: img.url,
            id: `existing-${index}`,
            isExisting: true
          }));
          setImagePreviews(existingImages);

          // Find featured image
          const featuredIndex = result.product.images.findIndex((img: any) => img.isFeatured);
          if (featuredIndex !== -1) {
            setFeaturedImageIndex(featuredIndex);
          }
        }

        // Set spec count based on existing specs
        if (result.product.specifications && result.product.specifications.length > 0) {
          setSpecCount(Math.max(2, result.product.specifications.length));
        }

        // Set care instructions
        if (result.product.careInstructions && result.product.careInstructions.length > 0) {
          setCareItems(result.product.careInstructions.map((c: any) => ({
            id: crypto.randomUUID?.() || Math.random().toString(36),
            title: c.title || '',
            description: c.description || '',
          })));
        }

        // FIX: Load existing variants with all fields including images
        if (result.product.hasVariants && result.product.variants && result.product.variants.length > 0) {
          setHasVariants(true);
          const loadedVariants = result.product.variants.map((v: any, index: number) => {
            // Load variant images
            const variantImages = v.images && Array.isArray(v.images)
              ? v.images.map((img: any, imgIndex: number) => ({
                preview: img.url,
                id: `existing-variant-${index}-img-${imgIndex}`,
                isExisting: true
              }))
              : [];

            // Find featured image index
            const featuredIndex = v.images?.findIndex((img: any) => img.isFeatured) || 0;

            return {
              id: `variant-${index}`,
              color: v.color || '',
              size: v.size || '',
              productId: v.productId || '',
              finish: v.finish || '',
              material: v.material || '',
              price: v.price?.toString() || '',
              cuttedPrice: v.cuttedPrice?.toString() || '',
              stock: v.stock?.toString() || '',
              images: variantImages,
              featuredImageIndex: featuredIndex >= 0 ? featuredIndex : 0
            };
          });
          setVariants(loadedVariants);
        }
      } else {
        setError(result.message || 'Failed to fetch product');
      }
    } catch (err) {
      console.error('Error fetching product:', err);
      setError('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  // Variant management functions
  const addVariant = () => {
    setVariants([...variants, {
      id: Math.random().toString(36).substr(2, 9),
      color: '',
      size: '',
      productId: '',
      finish: '',
      material: '',
      price: '',
      cuttedPrice: '',
      stock: '',
      images: [],
      featuredImageIndex: 0
    }]);
  };

  const updateVariant = (id: string, field: string, value: string) => {
    setVariants(variants.map(v =>
      v.id === id ? { ...v, [field]: value } : v
    ));
  };

  const removeVariant = (id: string) => {
    setVariants(variants.filter(v => v.id !== id));
  };

  const handleVariantImageSelect = (variantId: string, files: FileList | null) => {
    if (!files) return;

    const newImages = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substr(2, 9),
      isExisting: false
    }));

    setVariants(variants.map(v =>
      v.id === variantId
        ? { ...v, images: [...v.images, ...newImages] }
        : v
    ));
  };

  const removeVariantImage = (variantId: string, imageId: string) => {
    setVariants(variants.map(v => {
      if (v.id === variantId) {
        const newImages = v.images.filter(img => img.id !== imageId);
        return {
          ...v,
          images: newImages,
          featuredImageIndex: v.featuredImageIndex >= newImages.length
            ? Math.max(0, newImages.length - 1)
            : v.featuredImageIndex
        };
      }
      return v;
    }));
  };

  const setVariantFeaturedImage = (variantId: string, index: number) => {
    setVariants(variants.map(v =>
      v.id === variantId ? { ...v, featuredImageIndex: index } : v
    ));
  };

  const handleImageSelect = (files: FileList | null) => {
    if (!files) return;

    const newImages = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substr(2, 9),
      isExisting: false
    }));

    setImagePreviews(prev => [...prev, ...newImages]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleImageSelect(e.dataTransfer.files);
  };

  const removeImage = (id: string) => {
    setImagePreviews(prev => {
      const newPreviews = prev.filter(img => img.id !== id);
      if (featuredImageIndex >= newPreviews.length) {
        setFeaturedImageIndex(Math.max(0, newPreviews.length - 1));
      }
      return newPreviews;
    });
  };

  const setFeaturedImage = (index: number) => {
    setFeaturedImageIndex(index);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // ── Client-side validation ──────────────────────────────────────────────
    const formData_check = new FormData(e.currentTarget);
    const name_check = (formData_check.get('name') as string || '').trim();
    const description_check = (formData_check.get('description') as string || '').trim();
    const category_check = (formData_check.get('category') as string || '').trim();
    const price_check = Number(formData_check.get('price'));
    const cuttedPrice_check = Number(formData_check.get('cuttedPrice'));
    const stock_check = Number(formData_check.get('stock'));

    if (!name_check) {
      setError('Product name is required.');
      return;
    }
    if (name_check.length < 3) {
      setError('Product name must be at least 3 characters long.');
      return;
    }
    if (!description_check) {
      setError('Product description is required.');
      return;
    }
    if (!category_check) {
      setError('Please select a category for this product.');
      return;
    }
    if (imagePreviews.length === 0) {
      setError('Please upload at least one product image before saving.');
      return;
    }
    if (price_check < 0) {
      setError('Price cannot be negative. Enter 0 if the price is shown on request.');
      return;
    }
    if (cuttedPrice_check > 0 && price_check > 0 && cuttedPrice_check <= price_check) {
      setError('MRP must be higher than the selling price.');
      return;
    }
    if (stock_check < 0) {
      setError('Stock quantity cannot be negative.');
      return;
    }
    if (hasVariants && variants.length === 0) {
      setError('Variants are enabled but none have been added. Please add at least one variant or disable the variants toggle.');
      return;
    }
    if (hasVariants && variants.length > 0) {
      for (let i = 0; i < variants.length; i++) {
        if (!variants[i].color) {
          setError(`Variant ${i + 1} is missing a color. Please select a color for it.`);
          return;
        }
      }
    }
    // Validate specification pairs
    for (let i = 1; i <= specCount; i++) {
      const title = (formData_check.get(`specTitle${i}`) as string || '').trim();
      const desc = (formData_check.get(`specDesc${i}`) as string || '').trim();
      if ((title && !desc) || (!title && desc)) {
        setError(`Specification ${i}: both the title and description must be filled, or leave both empty.`);
        return;
      }
    }
    // ── End validation ──────────────────────────────────────────────────────

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData(e.currentTarget);
      setUploadProgress('Preparing product data...');

      // Collect highlights
      const highlights = [];
      for (let i = 1; i <= 6; i++) {
        const highlight = formData.get(`highlight${i}`) as string;
        if (highlight && highlight.trim()) {
          highlights.push(highlight.trim());
        }
      }

      // Collect care instructions from controlled state
      const careInstructions = careItems
        .filter(c => c.title.trim() || c.description.trim())
        .map(c => JSON.stringify({ title: c.title.trim(), description: c.description.trim() }));

      // Collect specifications
      const specifications = [];
      for (let i = 1; i <= specCount; i++) {
        const title = formData.get(`specTitle${i}`) as string;
        const description = formData.get(`specDesc${i}`) as string;
        if (title && description) {
          specifications.push(JSON.stringify({ title, description }));
        }
      }

      // Collect tags
      const tags = formData.getAll('tags') as string[];

      // Get form values
      const categoryValue = formData.get('category') as string;
      const subcategoryValue = formData.get('subcategory') as string;
      const subSubcategoryValue = formData.get('subSubcategory') as string;

      const requestBody: any = {
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        shortDescription: formData.get('shortDescription') as string,
        // price/cuttedPrice are set exclusively through the Pricing panel
        // above (PUT .../pricing) — omitting them here means this save can
        // never silently clobber pricing with a stale form value.
        category: categoryValue,
        subcategory: subSubcategoryValue || subcategoryValue || undefined,
        stock: Number(formData.get('stock')),
        highlights,
        careInstructions,
        specifications,
        material: formData.get('material') as string || undefined,
        finish: formData.get('finish') as string || undefined,
        color: formData.get('color') as string || undefined,
        productId: formData.get('productId') as string || undefined,
        size: formData.get('size') as string || undefined,
      };

      // Add tags if selected
      if (tags.length > 0) {
        requestBody.tags = JSON.stringify(tags);
      }

      // FIX: Handle variants properly with image uploads
      requestBody.hasVariants = hasVariants;
      if (hasVariants && variants.length > 0) {
        setUploadProgress('Processing variant images...');

        const variantsToSend = [];
        for (const variant of variants) {
          const variantData: any = {
            productId: variant.productId,
            color: variant.color,
            size: variant.size,
            finish: variant.finish,
            material: variant.material,
            price: variant.price,
            cuttedPrice: variant.cuttedPrice,
            stock: variant.stock,
            featuredImageIndex: variant.featuredImageIndex
          };

          // Process variant images - upload new ones, keep existing ones
          if (variant.images && variant.images.length > 0) {
            const variantImages = [];
            for (let i = 0; i < variant.images.length; i++) {
              const img = variant.images[i];
              if (img.isExisting) {
                // Keep existing image URL
                variantImages.push(img.preview);
              } else if ((img as any).file) {
                // Upload new image
                setUploadProgress(`Processing variant ${variants.indexOf(variant) + 1} image ${i + 1}...`);
                const base64 = await fileToBase64((img as any).file);
                variantImages.push(base64);
              }
            }
            variantData.images = variantImages;
          }

          variantsToSend.push(variantData);
        }

        requestBody.variants = JSON.stringify(variantsToSend);
      }

      // Handle new images if uploaded
      const newImageFiles = imagePreviews.filter(img => !img.isExisting && img.file);
      if (newImageFiles.length > 0) {
        setUploadProgress('Processing images...');
        const images = [];
        for (let i = 0; i < newImageFiles.length; i++) {
          if (newImageFiles[i].file) {
            setUploadProgress(`Processing image ${i + 1} of ${newImageFiles.length}...`);
            const base64 = await fileToBase64(newImageFiles[i].file!);
            images.push(base64);
          }
        }
        requestBody.images = images;
      }

      // FIX: Send featured image index to update which image is featured
      requestBody.featuredImageIndex = featuredImageIndex;

      setUploadProgress('Updating product...');
      const token = localStorage.getItem('auth_token');

      console.log('=== FRONTEND: SENDING UPDATE ===');
      console.log('Product ID:', productId);
      console.log('Request Body:', requestBody);

      const response = await fetch(`${API_BASE_URL}/admin/product/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      console.log('=== FRONTEND: RECEIVED RESPONSE ===');
      console.log('Response Status:', response.status);
      console.log('Response OK:', response.ok);
      console.log('Result:', result);

      if (!response.ok || !result.success) {
        console.error('=== UPDATE FAILED ===');
        console.error('Error:', result.message);
        setError(result.message || 'Error updating product');
        setUploadProgress('');
        return;
      }

      setSuccess('Product updated successfully!');
      setUploadProgress('');
      await revalidateProducts(productId);
      setTimeout(() => {
        router.push('/admin/products');
      }, 1500);

    } catch (err: any) {
      console.error('Error:', err);
      if (err?.message?.toLowerCase().includes('network') || err?.message?.toLowerCase().includes('fetch')) {
        setError('Network error — please check your internet connection and try again.');
      } else if (err?.message) {
        setError(err.message);
      } else {
        setError('Failed to update product. Please try again or contact support if the issue persists.');
      }
      setUploadProgress('');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading product...</p>
        </div>
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-2 text-orange-500 hover:text-orange-600"
        >
          <FiArrowLeft />
          Back to Products
        </Link>
      </div>
    );
  }

  if (!product) return null;

  const previewImage = imagePreviews[featuredImageIndex]?.preview;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <form onSubmit={handleSubmit} className="max-w-7xl mx-auto px-0 py-6 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
          >
            <FiArrowLeft />
            Back to Products
          </Link>
          <h1 className="text-2xl sm:text-4xl font-light text-slate-900 mb-3 tracking-tight">Edit Product</h1>
          <p className="text-slate-500 text-lg font-light">Update the sections below — the live preview on the right updates as you go.</p>
          <p className="text-xs text-slate-400 mt-3">
            <span className="text-red-500 font-medium">*</span> Required — everything else is optional
          </p>
        </div>

        <ProductPricingPanel product={product} onUpdated={(updated) => setProduct((prev: any) => ({ ...prev, ...updated }))} />

        {/* Status Messages */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
            <FiX className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-8 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3">
            <FiCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
            <p className="text-green-700 text-sm">{success}</p>
          </div>
        )}

        {uploadProgress && (
          <div className="mb-8 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
            <p className="text-blue-700 text-sm text-center">{uploadProgress}</p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:gap-8 items-start">
        <div>

        {/* FIX: Open all sections by default so FormData includes all inputs */}
        <Accordion type="multiple" defaultValue={["basic", "images", "pricing", "highlights", "specs", "variants", "tags", "care"]} className="space-y-4">

          {/* 1. Basic Information */}
          <AccordionItem value="basic" className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <AccordionTrigger className="px-4 sm:px-8 py-5 sm:py-6 hover:no-underline hover:bg-slate-50 transition-colors">
              <div className="text-left">
                <h2 className="text-xl font-medium text-slate-900 flex items-center flex-wrap">
                  Product Basics
                  <FieldHint kind={["customer", "filter"]} />
                </h2>
                <p className="text-sm text-slate-500 mt-1 font-normal">What the product is called and where it's categorized.</p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 sm:px-8 pb-6 sm:pb-8">
              <div className="grid md:grid-cols-2 gap-6 pt-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Product Name *</label>
                  <input
                    name="name"
                    required
                    defaultValue={product.name}
                    onChange={(e) => setPreviewState((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Wireless Bluetooth Headphones"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Description *
                    <span className="ml-1 text-xs text-slate-400 font-normal">— the long version, shown in the product page's description tab</span>
                  </label>
                  <textarea
                    name="description"
                    required
                    rows={4}
                    defaultValue={product.description}
                    placeholder="Comfortable over-ear headphones with noise cancellation..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all resize-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Short Description *
                    <span className="ml-1 text-xs text-slate-400 font-normal">— the one-liner shown on the product card and at the top of the product page</span>
                  </label>
                  <input
                    name="shortDescription"
                    required
                    defaultValue={product.shortDescription}
                    onChange={(e) => setPreviewState((p) => ({ ...p, shortDescription: e.target.value }))}
                    placeholder="Short description of the product"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                </div>

                {/* Category (Level 0) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Category *</label>
                  <select
                    name="category"
                    required
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setSelectedSubcategory('');
                      setSelectedSubSubcategory('');
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  >
                    <option value="">Select category</option>
                    {categoriesLoading ? (
                      <option disabled>Loading categories...</option>
                    ) : Array.isArray(categories) && categories.length > 0 ? (
                      categories.map((cat: any) => (
                        <option key={cat._id} value={cat._id}>
                          {cat.name}
                        </option>
                      ))
                    ) : (
                      <option disabled>No categories available</option>
                    )}
                  </select>
                </div>

                {/* Subcategory / Brand (Level 1) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Brand</label>
                  <select
                    name="subcategory"
                    value={selectedSubcategory}
                    onChange={(e) => {
                      setSelectedSubcategory(e.target.value);
                      setSelectedSubSubcategory('');
                    }}
                    disabled={!selectedCategory || subcategories.length === 0}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">{!selectedCategory ? 'Select category first' : 'Select brand'}</option>
                    {subcategories.map((subcat: any) => (
                      <option key={subcat._id} value={subcat._id}>
                        {subcat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sub-subcategory (Level 2) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sub-category</label>
                  <select
                    name="subSubcategory"
                    value={selectedSubSubcategory}
                    onChange={(e) => setSelectedSubSubcategory(e.target.value)}
                    disabled={!selectedSubcategory || subSubcategories.length === 0}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">{!selectedSubcategory ? 'Select brand first' : (subSubcategories.length > 0 ? 'Select sub-category' : 'No sub-categories')}</option>
                    {subSubcategories.map((subSubcat: any) => (
                      <option key={subSubcat._id} value={subSubcat._id}>
                        {subSubcat.name}
                      </option>
                    ))}
                  </select>
                </div>

              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 2. Photos */}
          <AccordionItem value="images" className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <AccordionTrigger className="px-4 sm:px-8 py-5 sm:py-6 hover:no-underline hover:bg-slate-50 transition-colors">
              <div className="text-left">
                <h2 className="text-xl font-medium text-slate-900 flex items-center flex-wrap">
                  Photos *
                  <FieldHint kind="customer" />
                </h2>
                <p className="text-sm text-slate-500 mt-1 font-normal">The images customers browse. The starred one is the cover photo shown on the product card and search results.</p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 sm:px-8 pb-6 sm:pb-8">
              <div className="pt-4">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-xl transition-all ${isDragging
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-slate-300 bg-slate-50'
                    }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleImageSelect(e.target.files)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="py-12 px-4 text-center pointer-events-none">
                    <FiUpload className={`w-12 h-12 mx-auto mb-3 ${isDragging ? 'text-orange-500' : 'text-slate-400'}`} />
                    <p className="text-sm font-medium text-slate-700 mb-1">
                      {isDragging ? 'Drop images here' : 'Click to upload or drag and drop'}
                    </p>
                    <p className="text-xs text-slate-500">
                      PNG, JPG, GIF up to 10MB each
                    </p>
                  </div>
                </div>

                {imagePreviews.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-slate-700">
                        Selected Images ({imagePreviews.length})
                      </p>
                      <p className="text-xs text-slate-500">
                        Click <FiStar className="inline w-3 h-3" /> to set as cover photo
                      </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {imagePreviews.map((image, index) => (
                        <div
                          key={image.id}
                          className={`relative group rounded-lg overflow-hidden border-2 transition-all ${index === featuredImageIndex
                            ? 'border-orange-500 ring-2 ring-orange-200'
                            : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                          <div className="aspect-square bg-slate-100">
                            <img
                              src={image.preview}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {index === featuredImageIndex && (
                            <div className="absolute top-2 left-2 bg-orange-500 text-white px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
                              <FiStar className="w-3 h-3 fill-current" />
                              Cover Photo
                            </div>
                          )}

                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => setFeaturedImage(index)}
                              className="p-2 bg-white rounded-lg hover:bg-orange-500 hover:text-white transition-colors"
                              title="Set as cover photo"
                            >
                              <FiStar className={index === featuredImageIndex ? 'fill-current' : ''} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeImage(image.id)}
                              className="p-2 bg-white text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors"
                              title="Remove image"
                            >
                              <FiTrash2 />
                            </button>
                          </div>

                          <div className="absolute bottom-2 right-2 bg-black bg-opacity-60 text-white px-2 py-1 rounded text-xs font-medium">
                            {index + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 3. Pricing & Stock */}
          <AccordionItem value="pricing" className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <AccordionTrigger className="px-4 sm:px-8 py-5 sm:py-6 hover:no-underline hover:bg-slate-50 transition-colors">
              <div className="text-left">
                <h2 className="text-xl font-medium text-slate-900 flex items-center flex-wrap">
                  Pricing & Stock *
                  <FieldHint kind="customer" />
                </h2>
                <p className="text-sm text-slate-500 mt-1 font-normal">What customers pay and how many units you have available.</p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 sm:px-8 pb-6 sm:pb-8">
              <div className="grid md:grid-cols-2 gap-6 pt-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Selling Price (₹) *</label>
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    defaultValue={product.price}
                    onChange={(e) => setPreviewState((p) => ({ ...p, price: e.target.value }))}
                    placeholder="999"
                    disabled
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">Set via the Pricing panel above.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    MRP (₹)
                    <span className="ml-1 text-xs text-slate-400 font-normal">— shown crossed out to display a discount</span>
                  </label>
                  <input
                    name="cuttedPrice"
                    type="number"
                    step="0.01"
                    defaultValue={product.cuttedPrice}
                    onChange={(e) => setPreviewState((p) => ({ ...p, cuttedPrice: e.target.value }))}
                    placeholder="1499"
                    disabled
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">Set via the Pricing panel above.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Stock *</label>
                  <input
                    name="stock"
                    type="number"
                    defaultValue={product.stock}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 4. Search Filters */}
          <AccordionItem value="specs" className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <AccordionTrigger className="px-4 sm:px-8 py-5 sm:py-6 hover:no-underline hover:bg-slate-50 transition-colors">
              <div className="text-left">
                <h2 className="text-xl font-medium text-slate-900">Search Filters & Specs</h2>
                <p className="text-sm text-slate-500 mt-1 font-normal">Finish, color and size power the filter checkboxes on the search page. Material is shown on the product page but doesn't filter search.</p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 sm:px-8 pb-6 sm:pb-8">
              <div className="grid md:grid-cols-2 gap-6 pt-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Product ID / SKU
                    <FieldHint kind="internal" />
                  </label>
                  <input name="productId" defaultValue={product.productId} placeholder="SKU-001" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Material
                    <FieldHint kind="customer" />
                  </label>
                  <input name="material" type="text" defaultValue={product.material} placeholder="e.g. Cotton, Aluminum, Leather" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Finish
                    <FieldHint kind={["customer", "filter"]} />
                  </label>
                  <input name="finish" type="text" defaultValue={product.finish} placeholder="e.g. Matte, Glossy, Brushed" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Color
                    <FieldHint kind={["customer", "filter"]} />
                  </label>
                  <select name="color" defaultValue={product.color} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all">
                    <option value="">Select color</option>
                    {Object.keys(colorMapping).map((color) => (
                      <option key={color} value={color}>
                        {color.charAt(0).toUpperCase() + color.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Size
                    <FieldHint kind={["customer", "filter"]} />
                  </label>
                  <input name="size" defaultValue={product.size} placeholder="e.g. Medium, 10x8 inches, 500g" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 5. Product Variants */}
          <AccordionItem value="variants" className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <AccordionTrigger className="px-4 sm:px-8 py-5 sm:py-6 hover:no-underline hover:bg-slate-50 transition-colors">
              <div className="text-left">
                <h2 className="text-xl font-medium text-slate-900 flex items-center flex-wrap">
                  Variants
                  <span className="ml-2 text-xs font-normal text-slate-400">(optional)</span>
                  <FieldHint kind={["customer", "filter"]} />
                </h2>
                <p className="text-sm text-slate-500 mt-1 font-normal">Turn this on only if this product comes in multiple colors/sizes/finishes that customers pick between on the product page.</p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 sm:px-8 pb-6 sm:pb-8">
              <div className="space-y-6 pt-4">
                {/* Enable Variants Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Enable Product Variants</h3>
                    <p className="text-xs text-slate-500 mt-1">Add variations like different colors, sizes, or finishes</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setHasVariants(!hasVariants);
                      if (!hasVariants && variants.length === 0) {
                        addVariant();
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasVariants ? 'bg-slate-900' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hasVariants ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Variants List */}
                {hasVariants && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-700">Variant Combinations</label>
                      <span className="text-xs text-slate-500">{variants.length} variant{variants.length !== 1 ? 's' : ''}</span>
                    </div>

                    {variants.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <p className="text-sm text-slate-500 mb-3">No variants added yet</p>
                        <button type="button" onClick={addVariant} className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">
                          Add First Variant
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {variants.map((variant, index) => (
                          <div key={variant.id} className="p-6 bg-white rounded-xl border-2 border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <span className="text-base font-semibold text-slate-900">Variant {index + 1}</span>
                                {variant.color && (
                                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-md">
                                    {variant.color}
                                  </span>
                                )}
                                {variant.size && (
                                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-md">
                                    {variant.size}
                                  </span>
                                )}
                              </div>
                              <button type="button" onClick={() => removeVariant(variant.id)} className="text-red-600 hover:text-red-700 text-sm font-medium">Remove</button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Product ID</label>
                                <input type="text" value={variant.productId || ''} onChange={(e) => updateVariant(variant.id, 'productId', e.target.value)} placeholder="SKU-001" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Color</label>
                                <select value={variant.color} onChange={(e) => updateVariant(variant.id, 'color', e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all">
                                  <option value="">Select color</option>
                                  {Object.keys(colorMapping).map((color) => (
                                    <option key={color} value={color}>
                                      {color.charAt(0).toUpperCase() + color.slice(1)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Size</label>
                                <input type="text" value={variant.size} onChange={(e) => updateVariant(variant.id, 'size', e.target.value)} placeholder="e.g. Medium" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Finish</label>
                                <input type="text" value={variant.finish} onChange={(e) => updateVariant(variant.id, 'finish', e.target.value)} placeholder="e.g. Matte" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Material</label>
                                <input type="text" value={variant.material} onChange={(e) => updateVariant(variant.id, 'material', e.target.value)} placeholder="e.g. Cotton" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Price (₹)</label>
                                <input type="number" value={variant.price} onChange={(e) => updateVariant(variant.id, 'price', e.target.value)} placeholder="999" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">MRP (₹)</label>
                                <input type="number" value={variant.cuttedPrice} onChange={(e) => updateVariant(variant.id, 'cuttedPrice', e.target.value)} placeholder="1499" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Stock</label>
                                <input type="number" value={variant.stock} onChange={(e) => updateVariant(variant.id, 'stock', e.target.value)} placeholder="100" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                              </div>
                            </div>

                            {/* Variant Images */}
                            <div className="mt-4 pt-4 border-t border-slate-200">
                              <label className="block text-xs font-medium text-slate-600 mb-2">
                                Variant Images {variant.images.length > 0 && `(${variant.images.length})`}
                              </label>

                              {/* Upload Area */}
                              <div className="relative border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 transition-all mb-3">
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={(e) => handleVariantImageSelect(variant.id, e.target.files)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div className="py-6 px-4 text-center pointer-events-none">
                                  <FiUpload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                                  <p className="text-xs text-slate-600">Click or drag images for this variant</p>
                                </div>
                              </div>

                              {/* Image Previews */}
                              {variant.images.length > 0 && (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                  {variant.images.map((image, imgIndex) => (
                                    <div
                                      key={image.id}
                                      className={`relative group rounded-lg overflow-hidden border-2 transition-all ${imgIndex === variant.featuredImageIndex
                                        ? 'border-orange-500 ring-2 ring-orange-200'
                                        : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                      <div className="aspect-square bg-slate-100">
                                        <img
                                          src={image.preview}
                                          alt={`Variant ${index + 1} Image ${imgIndex + 1}`}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>

                                      {imgIndex === variant.featuredImageIndex && (
                                        <div className="absolute top-1 left-1 bg-orange-500 text-white px-1 py-0.5 rounded text-xs font-medium flex items-center gap-1">
                                          <FiStar className="w-2 h-2 fill-current" />
                                        </div>
                                      )}

                                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                        <button
                                          type="button"
                                          onClick={() => setVariantFeaturedImage(variant.id, imgIndex)}
                                          className="p-1.5 bg-white rounded hover:bg-orange-500 hover:text-white transition-colors"
                                          title="Set as featured"
                                        >
                                          <FiStar className={`w-3 h-3 ${imgIndex === variant.featuredImageIndex ? 'fill-current' : ''}`} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => removeVariantImage(variant.id, image.id)}
                                          className="p-1.5 bg-white text-red-600 rounded hover:bg-red-600 hover:text-white transition-colors"
                                          title="Remove"
                                        >
                                          <FiTrash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={addVariant} className="w-full py-3 px-4 border-2 border-dashed border-slate-300 text-slate-600 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 group">
                          <FiPlus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          <span className="text-sm font-medium">Add Another Variant</span>
                        </button>

                        {/* Helpful Note */}
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs text-blue-800 leading-relaxed">
                            <strong>💡 Tip:</strong> Each variant should have at least one unique attribute (Color, Size, or Finish).
                            For example: If you have different colors, fill in the Color field for each variant.
                            If you have different sizes, fill in the Size field. You can leave other fields empty if not applicable.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 6. Highlights + Specifications */}
          <AccordionItem value="highlights" className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <AccordionTrigger className="px-4 sm:px-8 py-5 sm:py-6 hover:no-underline hover:bg-slate-50 transition-colors">
              <div className="text-left">
                <h2 className="text-xl font-medium text-slate-900 flex items-center flex-wrap">
                  Product Page Extras
                  <span className="ml-2 text-xs font-normal text-slate-400">(optional, but recommended)</span>
                  <FieldHint kind="customer" />
                </h2>
                <p className="text-sm text-slate-500 mt-1 font-normal">Bullet-point highlights and a technical spec table — both shown in tabs on the product page.</p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 sm:px-8 pb-6 sm:pb-8">
              <div className="space-y-6 pt-4">
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-700">Product Highlights</label>
                  <input name="highlight1" defaultValue={product.highlights?.[0]} placeholder="Highlight 1" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                  <input name="highlight2" defaultValue={product.highlights?.[1]} placeholder="Highlight 2" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                  <input name="highlight3" defaultValue={product.highlights?.[2]} placeholder="Highlight 3" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                  <input name="highlight4" defaultValue={product.highlights?.[3]} placeholder="Highlight 4" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                  <input name="highlight5" defaultValue={product.highlights?.[4]} placeholder="Highlight 5" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                  <input name="highlight6" defaultValue={product.highlights?.[5]} placeholder="Highlight 6" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                </div>
              </div>

              <div className="md:col-span-2 pt-4">
                <label className="block text-sm font-medium text-slate-700 mb-3">Technical Specifications</label>
                <div className="space-y-3">
                  {Array.from({ length: specCount }, (_, index) => (
                    <div key={index} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input
                        name={`specTitle${index + 1}`}
                        defaultValue={product.specifications?.[index]?.title}
                        placeholder={`Specification Title ${index + 1}`}
                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                      />
                      <input
                        name={`specDesc${index + 1}`}
                        defaultValue={product.specifications?.[index]?.description}
                        placeholder={`Specification Description ${index + 1}`}
                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                      />
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setSpecCount(specCount + 1)}
                    className="w-full py-3 px-4 border-2 border-dashed border-slate-300 text-slate-600 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 group"
                  >
                    <FiPlus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-medium">Add Specification</span>
                  </button>
                </div>
              </div>

            </AccordionContent>
          </AccordionItem>

          {/* 7. Care Instructions */}
          <AccordionItem value="care" className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <AccordionTrigger className="px-4 sm:px-8 py-5 sm:py-6 hover:no-underline hover:bg-slate-50 transition-colors">
              <div className="text-left">
                <h2 className="text-xl font-medium text-slate-900 flex items-center flex-wrap">
                  Care Instructions
                  <span className="ml-2 text-xs font-normal text-slate-400">(optional)</span>
                  <FieldHint kind="customer" />
                </h2>
                <p className="text-sm text-slate-500 mt-1 font-normal">Shown in a dedicated tab on the product page.</p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 sm:px-8 pb-6 sm:pb-8">
              <div className="space-y-3 pt-4">
                <label className="block text-sm font-medium text-slate-700">Care Instructions <span className="text-slate-400 font-normal">(optional)</span></label>
                <p className="text-xs text-slate-500">Each instruction has a bold title and a description — e.g. Title: "Daily Cleaning", Description: "Sweep or vacuum regularly."</p>
                {careItems.map((item) => (
                  <div key={item.id} className="flex gap-2 items-start">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        value={item.title}
                        onChange={e => setCareItems(prev => prev.map(c => c.id === item.id ? { ...c, title: e.target.value } : c))}
                        placeholder="Title (e.g. Daily Cleaning)"
                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all font-medium"
                      />
                      <input
                        value={item.description}
                        onChange={e => setCareItems(prev => prev.map(c => c.id === item.id ? { ...c, description: e.target.value } : c))}
                        placeholder="Description (e.g. Sweep or vacuum regularly)"
                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                      />
                    </div>
                    {careItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCareItems(prev => prev.filter(c => c.id !== item.id))}
                        className="mt-1 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove instruction"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCareItems(prev => [...prev, { id: crypto.randomUUID?.() || Math.random().toString(36), title: '', description: '' }])}
                  className="w-full py-3 px-4 border-2 border-dashed border-slate-300 text-slate-600 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 group"
                >
                  <FiPlus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">Add Care Instruction</span>
                </button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 8. Badges */}
          <AccordionItem value="tags" className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <AccordionTrigger className="px-4 sm:px-8 py-5 sm:py-6 hover:no-underline hover:bg-slate-50 transition-colors">
              <div className="text-left">
                <h2 className="text-xl font-medium text-slate-900 flex items-center flex-wrap">
                  Badges
                  <span className="ml-2 text-xs font-normal text-slate-400">(optional)</span>
                  <FieldHint kind={["customer", "filter"]} />
                </h2>
                <p className="text-sm text-slate-500 mt-1 font-normal">Badges show directly on the product card (e.g. "New", "Best Seller") and add this product to those search filters.</p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 sm:px-8 pb-6 sm:pb-8">
              <div className="pt-4">
                <label className="block text-sm font-medium text-slate-700 mb-4">
                  Select tags to display on product cards
                </label>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Popular */}
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer group">
                    <input type="checkbox" name="tags" value="popular" defaultChecked={product.tags?.includes('popular')} className="w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer" />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-blue-700">⭐ Popular</span>
                  </label>

                  {/* Trending */}
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-yellow-50 hover:border-yellow-300 transition-all cursor-pointer group">
                    <input type="checkbox" name="tags" value="trending" defaultChecked={product.tags?.includes('trending')} className="w-4 h-4 text-yellow-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-yellow-500 cursor-pointer" />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-yellow-700">🔥 Trending</span>
                  </label>

                  {/* New */}
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-green-50 hover:border-green-300 transition-all cursor-pointer group">
                    <input type="checkbox" name="tags" value="new" defaultChecked={product.tags?.includes('new')} className="w-4 h-4 text-green-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-green-500 cursor-pointer" />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-green-700">✨ New</span>
                  </label>

                  {/* Premium */}
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-purple-50 hover:border-purple-300 transition-all cursor-pointer group">
                    <input type="checkbox" name="tags" value="premium" defaultChecked={product.tags?.includes('premium')} className="w-4 h-4 text-purple-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-purple-500 cursor-pointer" />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-purple-700">💎 Premium</span>
                  </label>

                  {/* Exclusive */}
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-pink-50 hover:border-pink-300 transition-all cursor-pointer group">
                    <input type="checkbox" name="tags" value="exclusive" defaultChecked={product.tags?.includes('exclusive')} className="w-4 h-4 text-pink-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-pink-500 cursor-pointer" />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-pink-700">👑 Exclusive</span>
                  </label>

                  {/* Classic */}
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 hover:border-slate-400 transition-all cursor-pointer group">
                    <input type="checkbox" name="tags" value="classic" defaultChecked={product.tags?.includes('classic')} className="w-4 h-4 text-slate-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-slate-500 cursor-pointer" />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">🏛️ Classic</span>
                  </label>

                  {/* Best Seller */}
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-orange-50 hover:border-orange-300 transition-all cursor-pointer group">
                    <input type="checkbox" name="tags" value="bestseller" defaultChecked={product.tags?.includes('bestseller')} className="w-4 h-4 text-orange-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-orange-500 cursor-pointer" />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-orange-700">🏆 Best Seller</span>
                  </label>

                  {/* Limited Edition */}
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-red-50 hover:border-red-300 transition-all cursor-pointer group">
                    <input type="checkbox" name="tags" value="limited" defaultChecked={product.tags?.includes('limited')} className="w-4 h-4 text-red-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-red-500 cursor-pointer" />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-red-700">⏰ Limited Edition</span>
                  </label>
                </div>

                <p className="text-xs text-slate-500 mt-4">
                  Selected tags will appear as badges on the product card for better visibility
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

        </Accordion>

        {/* Submit Button */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 pt-8">
          <Link
            href="/admin/products"
            className="flex-1 py-4 px-6 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl hover:bg-slate-50 transition-all duration-200 font-medium text-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-4 px-6 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Updating...</span>
              </>
            ) : (
              <>
                <FiCheck className="w-5 h-5" />
                <span>Update Product</span>
              </>
            )}
          </button>
        </div>
        </div>

        {/* Live preview — mirrors the real product card, updates as you type */}
        <div className="lg:sticky lg:top-6">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Live Preview</p>
          <ProductPreviewCard
            name={previewState.name}
            shortDescription={previewState.shortDescription}
            imageUrl={previewImage}
            price={Number(previewState.price) || 0}
            cuttedPrice={Number(previewState.cuttedPrice) || undefined}
            variantCount={hasVariants ? variants.length : 0}
          />
          <p className="text-xs text-slate-400 mt-3 text-center">This is what customers will see on the product card.</p>
        </div>
        </div>
      </form>
    </div>
  );
}