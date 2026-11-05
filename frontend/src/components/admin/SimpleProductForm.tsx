"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FiUpload, FiCheck, FiX, FiStar, FiTrash2, FiImage, FiPlus } from "react-icons/fi";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCategories } from "@/hooks/category/queries/useCategories";
import { usePricingSettings } from "@/hooks/admin/queries/usePricingSettings";
import { listingFromVendorNet, vendorNetFromListing, vendorPriceBreakdown } from "@/lib/pricing";
import { revalidateProducts } from "@/app/actions";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

import { colorMapping } from "@/constants/colors";
import {
  MAX_FILE_SIZE, MAX_IMAGES, VALID_IMAGE_TYPES,
} from "@/constants/productFormOptions";
import { generateUUID, fileToBase64 } from "@/utils/imageUtils";
import { FieldHint } from "./FieldHint";
import { ProductPreviewCard } from "./ProductPreviewCard";

interface VariantImage {
  file: File;
  preview: string;
  id: string;
}

interface Variant {
  id: string;
  color: string;
  size: string;
  productId: string;
  finish: string;
  material: string;
  price: string;
  cuttedPrice: string;
  stock: string;
  images: VariantImage[];
  featuredImageIndex: number;
}

/**
 * The full product form, shared by admin and vendor.
 *
 * Every prop is optional and defaults to the original admin create behaviour,
 * so the admin route is unchanged by the vendor support being added here —
 * the alternative was a second 1500-line copy that would drift.
 *
 * Vendors differ in three ways, all enforced on the backend too:
 *   • no MRP (`cuttedPrice`) — it's in ADMIN_ONLY_FIELDS and would be
 *     silently dropped, so showing the field would just mislead them
 *   • no PER-VARIANT pricing — checkout charges `variant.price` while
 *     settlement pays the investor `product.price`, so a per-variant price
 *     would break the margin math (see Phase 10 known gaps). Variants are
 *     catalogue-only for vendors and inherit the product price.
 *   • their own endpoints, and the listing goes to pending_approval
 */
export interface SimpleProductFormProps {
  role?: "admin" | "vendor";
  mode?: "create" | "edit";
  /** Existing product, for mode="edit". */
  initialProduct?: any;
  /** Required for mode="edit". */
  editProductId?: string;
}

/**
 * What the vendor's typed price turns into, for everyone involved.
 *
 * The vendor sets their own price; the platform margin and GST are both set by
 * admin and are read-only here. Showing all four figures — their net, the
 * platform's cut, what the customer pays, and the investor's side — is the
 * point: a vendor typing ₹100 should not have to work out that the product
 * lists at ₹120 and bills at ₹141.60.
 *
 * Every number comes from one call to `vendorPriceBreakdown`, so the rows
 * cannot show a set of figures that don't add up.
 */
function VendorPriceBreakdown({
  vendorNet,
  settings,
  loading,
}: {
  vendorNet: number;
  settings: { marginPct: number; gstPct: number };
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-3 h-32 rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />
    );
  }

  // Nothing typed yet — explain what will happen rather than showing zeroes.
  if (!vendorNet) {
    return (
      <p className="mt-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        Enter the amount you want to receive per unit. We&apos;ll show the platform fee
        ({settings.marginPct}%), what customers pay including {settings.gstPct}% GST, and the
        investor&apos;s side.
      </p>
    );
  }

  const b = vendorPriceBreakdown(vendorNet, settings);
  const money = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden text-sm">
      <div className="bg-emerald-50 px-4 py-3 flex items-center justify-between border-b border-emerald-100">
        <span className="font-medium text-emerald-900">You receive</span>
        <span className="font-bold text-emerald-700">{money(b.vendorReceives)}</span>
      </div>

      <div className="px-4 py-2.5 flex items-center justify-between bg-white">
        <span className="text-slate-500">
          Platform fee
          <span className="ml-1 text-xs text-slate-400">({b.marginPct}%, set by admin)</span>
        </span>
        <span className="text-slate-700">{money(b.platformFee)}</span>
      </div>

      <div className="px-4 py-2.5 flex items-center justify-between bg-white border-t border-slate-100">
        <span className="text-slate-500">Listed to customers</span>
        <span className="font-medium text-slate-900">{money(b.listingPrice)}</span>
      </div>

      <div className="px-4 py-2.5 flex items-center justify-between bg-white">
        <span className="text-slate-500">
          GST<span className="ml-1 text-xs text-slate-400">({b.gstPct}%)</span>
        </span>
        <span className="text-slate-700">{money(b.gstAmount)}</span>
      </div>

      <div className="px-4 py-3 flex items-center justify-between bg-slate-900">
        <span className="font-medium text-white">Customer pays</span>
        <span className="font-bold text-white">{money(b.customerTotal)}</span>
      </div>

      {/* The investor's side used to be summarised here as "invests X,
          receives Y, profit = the margin". That stopped being true in Phase 20:
          an investor now earns a band percentage decided by how long their unit
          takes to sell, so there is no single figure — and it is admin's
          setting, not the vendor's. The vendor's own numbers above are
          unaffected by any of it, which is the only thing they need to know. */}
    </div>
  );
}

export function SimpleProductForm({
  role = "admin",
  mode = "create",
  initialProduct,
  editProductId,
}: SimpleProductFormProps = {}) {
  const router = useRouter();
  const isVendor = role === "vendor";
  const isEdit = mode === "edit";

  /**
   * ── What the price field means, per role ────────────────────────────────
   *
   * Admin types the LISTING price — what the customer is charged before tax,
   * which is what the backend stores as `price`.
   *
   * A vendor types THEIR OWN price — what they want to receive — and the form
   * grosses it up by the platform margin before submitting. So a vendor typing
   * ₹100 at a 20% margin submits `price: 120`.
   *
   * `price` is still the only number stored; the vendor's net is always
   * re-derived from it by the backend, never kept as a second truth. On edit
   * the field is therefore seeded from the stored `vendorPrice`.
   *
   * Vendors can read the margin (and GST) but not change them — that is
   * admin's call, and the endpoint only grants them read.
   */
  const { settings: pricingSettings, isLoading: pricingLoading } = usePricingSettings();

  // Images already on the product. The update endpoint appends new uploads to
  // these rather than replacing them, so they're shown as context and the
  // uploader only ever collects additions.
  const existingImages: Array<{ url: string }> = isEdit ? initialProduct?.images ?? [] : [];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [imagePreviews, setImagePreviews] = useState<Array<{ file: File; preview: string; id: string }>>([]);
  const [featuredImageIndex, setFeaturedImageIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [specCount, setSpecCount] = useState(Math.max(2, initialProduct?.specifications?.length ?? 0));
  const [selectedCategory, setSelectedCategory] = useState(
    initialProduct?.category?._id ?? initialProduct?.category ?? ''
  );
  const [selectedSubcategory, setSelectedSubcategory] = useState(
    initialProduct?.subcategory?._id ?? initialProduct?.subcategory ?? ''
  );
  const [selectedSubSubcategory, setSelectedSubSubcategory] = useState('');

  const { categories, isLoading: categoriesLoading } = useCategories();

  // Get selected category object for subcategory dropdown
  const selectedCategoryObj = categories.find((cat: any) => cat._id === selectedCategory);

  // Get selected subcategory object for sub-subcategory dropdown
  const selectedSubcategoryObj = selectedCategoryObj?.children?.find((subcat: any) => subcat._id === selectedSubcategory);



  const [careItems, setCareItems] = useState<Array<{ id: string; title: string; description: string }>>(
    initialProduct?.careInstructions?.length
      ? initialProduct.careInstructions.map((c: any) => ({
          id: generateUUID(),
          title: c?.title ?? '',
          description: c?.description ?? '',
        }))
      : [{ id: generateUUID(), title: '', description: '' }]
  );

  const [hasVariants, setHasVariants] = useState(Boolean(initialProduct?.hasVariants));
  const [variants, setVariants] = useState<Variant[]>(
    (initialProduct?.variants ?? []).map((v: any) => ({
      id: generateUUID(),
      color: v?.color ?? '',
      size: v?.size ?? '',
      productId: v?.productId ?? '',
      finish: v?.finish ?? '',
      material: v?.material ?? '',
      price: v?.price != null ? String(v.price) : '',
      cuttedPrice: v?.cuttedPrice != null ? String(v.cuttedPrice) : '',
      stock: v?.stock != null ? String(v.stock) : '',
      images: [],
      featuredImageIndex: 0,
    }))
  );

  const [mainFormValues, setMainFormValues] = useState({
    name: initialProduct?.name ?? '',
    shortDescription: initialProduct?.shortDescription ?? '',
    productId: initialProduct?.productId ?? '',
    material: initialProduct?.material ?? '',
    finish: initialProduct?.finish ?? '',
    color: initialProduct?.color ?? '',
    size: initialProduct?.size ?? '',
    // For a vendor this field holds their own price, so an existing product
    // is loaded from its stored vendorPrice. `vendorPrice` is always present
    // on a priced product; the fallback re-derives it in case it isn't.
    price:
      isVendor && initialProduct?.price != null
        ? String(
            initialProduct.vendorPrice ??
              vendorNetFromListing(initialProduct.price, { marginPct: initialProduct.marginPct ?? 0 })
          )
        : initialProduct?.price != null
          ? String(initialProduct.price)
          : '',
    cuttedPrice: initialProduct?.cuttedPrice != null ? String(initialProduct.cuttedPrice) : '',
    stock: initialProduct?.stock != null ? String(initialProduct.stock) : '100',
  });

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      // Cleanup main product images
      imagePreviews.forEach(img => {
        if (img.preview.startsWith('blob:')) {
          URL.revokeObjectURL(img.preview);
        }
      });

      // Cleanup variant images
      variants.forEach(variant => {
        variant.images.forEach(img => {
          if (img.preview.startsWith('blob:')) {
            URL.revokeObjectURL(img.preview);
          }
        });
      });
    };
  }, [imagePreviews, variants]);

  const handleImageSelect = (files: FileList | null) => {
    if (!files) return;

    // Validate image count
    if (imagePreviews.length + files.length > MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} images allowed. You can upload ${MAX_IMAGES - imagePreviews.length} more.`);
      return;
    }

    const newImages: Array<{ file: File; preview: string; id: string }> = [];
    for (const file of Array.from(files)) {
      // Validate file type
      if (!VALID_IMAGE_TYPES.includes(file.type)) {
        setError(`Invalid file type: ${file.name}. Only JPG, PNG, GIF, and WebP are allowed.`);
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`File too large: ${file.name}. Maximum 10MB per image.`);
        continue;
      }

      newImages.push({
        file,
        preview: URL.createObjectURL(file),
        id: generateUUID()
      });
    }

    if (newImages.length > 0) {
      setImagePreviews(prev => [...prev, ...newImages]);
      setError(''); // Clear any previous errors
    }
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
    const removedIndex = imagePreviews.findIndex(img => img.id === id);

    // Revoke blob URL to prevent memory leak
    const imageToRemove = imagePreviews.find(img => img.id === id);
    if (imageToRemove && imageToRemove.preview.startsWith('blob:')) {
      URL.revokeObjectURL(imageToRemove.preview);
    }

    // Remove the image
    setImagePreviews(prev => prev.filter(img => img.id !== id));

    // Adjust featured index if needed
    if (removedIndex !== -1) {
      if (removedIndex === featuredImageIndex) {
        // Featured image was removed, set to first image
        setFeaturedImageIndex(0);
      } else if (removedIndex < featuredImageIndex) {
        // Image removed before featured, shift index down
        setFeaturedImageIndex(prev => prev - 1);
      }
      // If removed after featured, no change needed
    }
  };

  const setFeaturedImage = (index: number) => {
    setFeaturedImageIndex(index);
  };

  const handleVariantImageSelect = (variantId: string, files: FileList | null) => {
    if (!files) return;

    const newImages = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file),
      id: generateUUID()
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
        // Revoke blob URL to prevent memory leak
        const imageToRemove = v.images.find(img => img.id === imageId);
        if (imageToRemove && imageToRemove.preview.startsWith('blob:')) {
          URL.revokeObjectURL(imageToRemove.preview);
        }

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

  const addVariant = () => {
    const newVariant: Variant = {
      id: generateUUID(),
      color: mainFormValues.color,
      size: mainFormValues.size,
      productId: mainFormValues.productId,
      finish: mainFormValues.finish,
      material: mainFormValues.material,
      price: mainFormValues.price,
      cuttedPrice: mainFormValues.cuttedPrice,
      stock: mainFormValues.stock,
      images: [],
      featuredImageIndex: 0
    };
    setVariants([...variants, newVariant]);
  };

  const updateVariant = (id: string, field: string, value: string) => {
    setVariants(variants.map(v =>
      v.id === id ? { ...v, [field]: value } : v
    ));
  };

  const removeVariant = (id: string) => {
    setVariants(variants.filter(v => v.id !== id));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // ── Client-side validation ──────────────────────────────────────────────
    const formData_check = new FormData(e.currentTarget);
    const name_check = mainFormValues.name.trim();
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
    // On edit the product already has images; new uploads are appended.
    if (imagePreviews.length === 0 && existingImages.length === 0) {
      setError('Please upload at least one product image before saving.');
      return;
    }
    if (price_check < 0) {
      setError('Price cannot be negative. Enter 0 if the price is shown on request.');
      return;
    }
    if (!isVendor && cuttedPrice_check > 0 && price_check > 0 && cuttedPrice_check <= price_check) {
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

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData(e.currentTarget);
      setUploadProgress('Preparing product data...');

      const name = mainFormValues.name;
      const description = formData.get('description') as string;
      const shortDescription = mainFormValues.shortDescription;
      const productId = formData.get('productId') as string;
      const price = formData.get('price') as string;
      const cuttedPrice = formData.get('cuttedPrice') as string;
      const category = formData.get('category') as string;
      const subcategory = formData.get('subcategory') as string;
      const subSubcategory = formData.get('subSubcategory') as string;
      const stock = formData.get('stock') as string;
      const material = formData.get('material') as string;
      const finish = formData.get('finish') as string;
      const color = formData.get('color') as string;
      const size = formData.get('size') as string;
      const unit = formData.get('unit') as string;

      const highlight1 = formData.get('highlight1') as string;
      const highlight2 = formData.get('highlight2') as string;
      const highlight3 = formData.get('highlight3') as string;
      const highlight4 = formData.get('highlight4') as string;
      const highlight5 = formData.get('highlight5') as string;
      const highlight6 = formData.get('highlight6') as string;
      const highlights = [highlight1, highlight2, highlight3, highlight4, highlight5, highlight6].filter(h => h);

      const careInstructions = careItems
        .filter(c => c.title.trim() || c.description.trim())
        .map(c => JSON.stringify({ title: c.title.trim(), description: c.description.trim() }));

      const tags = formData.getAll('tags') as string[];

      const specifications = [];
      for (let i = 1; i <= specCount; i++) {
        const specTitle = formData.get(`specTitle${i}`) as string;
        const specDesc = formData.get(`specDesc${i}`) as string;
        if (specTitle && specDesc) {
          specifications.push(JSON.stringify({ title: specTitle, description: specDesc }));
        }
      }

      setUploadProgress('Processing images...');
      const images = [];
      for (let i = 0; i < imagePreviews.length; i++) {
        setUploadProgress(`Processing image ${i + 1} of ${imagePreviews.length}...`);
        try {
          const base64 = await fileToBase64(imagePreviews[i].file);
          images.push(base64);
        } catch {
          setError(`Failed to process image ${i + 1}. Please remove it and try uploading a different file.`);
          setLoading(false);
          setUploadProgress('');
          return;
        }
      }

      const requestBody: any = {
        name,
        description,
        shortDescription,
        productId: productId || undefined,
        // A vendor typed their own net; the backend stores the listing price.
        price: isVendor
          ? listingFromVendorNet(Number(price), { marginPct: pricingSettings.marginPct })
          : Number(price),
        category: category,
        subcategory: subSubcategory || subcategory || undefined,
        images,
        featuredImageIndex,
        highlights,
        careInstructions,
        specifications,
        stock: Number(stock),
      };

      // Stripped from vendor requests by the backend anyway; omitted here so
      // the payload matches what actually gets saved.
      if (!isVendor) requestBody.cuttedPrice = Number(cuttedPrice);

      if (material) requestBody.material = material;
      if (finish) requestBody.finish = finish;
      if (color) requestBody.color = color;
      if (size) requestBody.size = size;


      requestBody.hasVariants = hasVariants;
      if (hasVariants && variants.length > 0) {
        setUploadProgress('Processing variant images...');

        const variantsToSend = [];
        for (const variant of variants) {
          const variantImages = [];
          for (let i = 0; i < variant.images.length; i++) {
            setUploadProgress(`Processing variant images ${i + 1}...`);
            const base64 = await fileToBase64(variant.images[i].file);
            variantImages.push(base64);
          }

          variantsToSend.push({
            productId: variant.productId,
            color: variant.color,
            size: variant.size,
            finish: variant.finish,
            material: variant.material,
            // Vendor variants carry no price of their own: checkout would
            // charge it while settlement still pays the investor the product
            // price, which breaks the margin math. Omitted, so getPriceForSize
            // falls back to product.price.
            ...(isVendor ? {} : { price: variant.price, cuttedPrice: variant.cuttedPrice }),
            stock: variant.stock,
            images: variantImages,
            featuredImageIndex: variant.featuredImageIndex
          });
        }

        requestBody.variants = JSON.stringify(variantsToSend);
      }

      if (tags.length > 0) {
        requestBody.tags = JSON.stringify(tags);
      }

      setUploadProgress('Uploading to server...');
      const token = localStorage.getItem('auth_token');

      const endpoint = isEdit
        ? `${API_BASE_URL}/${isVendor ? 'vendor' : 'admin'}/product/${editProductId}`
        : `${API_BASE_URL}/${isVendor ? 'vendor' : 'admin'}/product/new`;

      const response = await fetch(endpoint, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (response.status === 401) {
          setError('Your session has expired. Please log in again and retry.');
        } else if (response.status === 413) {
          setError('Images are too large. Please compress them (under 2MB each) and try again.');
        } else if (response.status === 429) {
          setError('Too many requests. Please wait a moment and try again.');
        } else if (response.status >= 500) {
          setError('Server error occurred. Please try again. If this keeps happening, contact support.');
        } else {
          setError(result.message || `Failed to ${isEdit ? 'update' : 'create'} product. Please check all fields and try again.`);
        }
        setUploadProgress('');
        return;
      }

      await revalidateProducts();
      setUploadProgress('');

      if (isEdit) {
        // Nothing to reset on an edit — leave the form showing what was saved
        // and send them back to their list.
        setSuccess('Product updated successfully!');
        router.push(isVendor ? '/vendor/products' : '/admin/products');
        return;
      }

      setSuccess(
        isVendor
          ? 'Product submitted — it will appear once an admin approves it.'
          : 'Product created successfully!'
      );
      (e.target as HTMLFormElement).reset();
      setImagePreviews([]);
      setVariants([]);
      setHasVariants(false);
      setSelectedCategory('');
      setSelectedSubcategory('');
      setSelectedSubSubcategory('');
      setMainFormValues({
        name: '',
        shortDescription: '',
        productId: '',
        material: '',
        finish: '',
        color: '',
        size: '',
        price: '',
        cuttedPrice: '',
        stock: '100'
      });

    } catch (err: any) {
      console.error('Error:', err);
      if (err?.message?.toLowerCase().includes('network') || err?.message?.toLowerCase().includes('fetch')) {
        setError('Network error — please check your internet connection and try again.');
      } else if (err?.message) {
        setError(err.message);
      } else {
        setError('Failed to save product. Please try again or contact support if the issue persists.');
      }
      setUploadProgress('');

      // Cleanup blob URLs on error to prevent memory leaks
      imagePreviews.forEach(img => {
        if (img.preview.startsWith('blob:')) {
          URL.revokeObjectURL(img.preview);
        }
      });
      variants.forEach(v => {
        v.images.forEach(img => {
          if (img.preview.startsWith('blob:')) {
            URL.revokeObjectURL(img.preview);
          }
        });
      });
    } finally {
      setLoading(false);
    }
  };

  const previewImage = imagePreviews[featuredImageIndex]?.preview;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <form onSubmit={handleSubmit} className="max-w-7xl mx-auto px-0 py-6 sm:px-6 sm:py-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl sm:text-4xl font-light text-slate-900 mb-3 tracking-tight">
            {isEdit ? 'Edit Product' : 'Create New Product'}
          </h1>
          <p className="text-slate-500 text-base sm:text-lg font-light">
            Fill in the sections below — a live preview of the product card updates on the right as you go.
          </p>
          {isVendor && !isEdit && (
            <p className="text-sm text-amber-700 mt-2">
              Your listing is reviewed before it goes live.
            </p>
          )}
          <p className="text-xs text-slate-400 mt-3">
            <span className="text-red-500 font-medium">*</span> Required — everything else is optional
          </p>
        </div>

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
                    placeholder="Wireless Bluetooth Headphones"
                    value={mainFormValues.name}
                    onChange={(e) => setMainFormValues({ ...mainFormValues, name: e.target.value })}
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
                    defaultValue={initialProduct?.description ?? ''}
                    required
                    rows={4}
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
                    placeholder="Short description of the product"
                    value={mainFormValues.shortDescription}
                    onChange={(e) => setMainFormValues({ ...mainFormValues, shortDescription: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Category *</label>
                  <select
                    name="category"
                    required
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setSelectedSubcategory(''); // Reset subcategory when category changes
                      setSelectedSubSubcategory(''); // Reset sub-subcategory as well
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

                {/* Subcategory (Brand) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Brand</label>
                  <select
                    name="subcategory"
                    value={selectedSubcategory}
                    onChange={(e) => {
                      setSelectedSubcategory(e.target.value);
                      setSelectedSubSubcategory(''); // Reset sub-subcategory when subcategory changes
                    }}
                    disabled={!selectedCategory}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">{selectedCategory ? 'Select brand' : 'Select category first'}</option>
                    {selectedCategoryObj?.children?.map((subcat: any) => (
                      <option key={subcat._id} value={subcat._id}>
                        {subcat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sub-subcategory */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sub-category</label>
                  <select
                    name="subSubcategory"
                    value={selectedSubSubcategory}
                    onChange={(e) => setSelectedSubSubcategory(e.target.value)}
                    disabled={!selectedSubcategory || !selectedSubcategoryObj?.children || selectedSubcategoryObj.children.length === 0}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">{!selectedSubcategory ? 'Select brand first' : (selectedSubcategoryObj?.children?.length > 0 ? 'Select sub-category' : 'No sub-categories')}</option>
                    {selectedSubcategoryObj?.children?.map((subSubcat: any) => (
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
                {/* Images already saved on this product. The update endpoint
                    appends new uploads rather than replacing, so these stay
                    and the uploader below only collects additions. */}
                {existingImages.length > 0 && (
                  <div className="mb-5">
                    <p className="text-sm font-medium text-slate-700 mb-2">
                      Current images ({existingImages.length})
                    </p>
                    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                      {existingImages.map((img, i) => (
                        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL, matches the rest of this form
                        <img
                          key={img.url ?? i}
                          src={img.url}
                          alt=""
                          className="aspect-square w-full rounded-xl border border-slate-200 object-cover"
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Anything you add below is appended to these.
                    </p>
                  </div>
                )}

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

                {imagePreviews.length === 0 && (
                  <p className="text-xs text-red-500 mt-2">* At least one product image is required</p>
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
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {isVendor ? 'Your Price (₹) *' : 'Selling Price (₹) *'}
                    {isVendor && (
                      <span className="ml-1 text-xs text-slate-400 font-normal">
                        — what you receive per unit sold
                      </span>
                    )}
                  </label>
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    placeholder={isVendor ? '100' : '999'}
                    value={mainFormValues.price}
                    onChange={(e) => setMainFormValues({ ...mainFormValues, price: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                  {/* A product can carry its own margin override, so the global
                      rate is not always the right answer. On edit the API sends
                      the margin that actually applies — using the global one
                      here would promise the vendor a net they won't get. */}
                  {isVendor && <VendorPriceBreakdown
                    vendorNet={Number(mainFormValues.price) || 0}
                    settings={{
                      ...pricingSettings,
                      marginPct: initialProduct?.effectiveMarginPct ?? pricingSettings.marginPct,
                    }}
                    loading={pricingLoading}
                  />}
                </div>

                {/* MRP is admin-only — the backend strips it from vendor
                    requests, so offering the field would just mislead them. */}
                {!isVendor && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      MRP (₹)
                      <span className="ml-1 text-xs text-slate-400 font-normal">— shown crossed out to display a discount</span>
                    </label>
                    <input
                      name="cuttedPrice"
                      type="number"
                      step="0.01"
                      placeholder="1499"
                      value={mainFormValues.cuttedPrice}
                      onChange={(e) => setMainFormValues({ ...mainFormValues, cuttedPrice: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Stock *</label>
                  <input
                    name="stock"
                    type="number"
                    value={mainFormValues.stock}
                    onChange={(e) => setMainFormValues({ ...mainFormValues, stock: e.target.value })}
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
                  <input
                    name="productId"
                    type="text"
                    placeholder="SKU-12345 or any unique ID"
                    value={mainFormValues.productId}
                    onChange={(e) => setMainFormValues({ ...mainFormValues, productId: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Material
                    <FieldHint kind="customer" />
                  </label>
                  <input
                    name="material"
                    type="text"
                    placeholder="e.g. Cotton, Aluminum, Leather"
                    value={mainFormValues.material}
                    onChange={(e) => setMainFormValues({ ...mainFormValues, material: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Finish
                    <FieldHint kind={["customer", "filter"]} />
                  </label>
                  <input
                    name="finish"
                    type="text"
                    placeholder="e.g. Matte, Glossy, Brushed"
                    value={mainFormValues.finish}
                    onChange={(e) => setMainFormValues({ ...mainFormValues, finish: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Color
                    <FieldHint kind={["customer", "filter"]} />
                  </label>
                  <select
                    name="color"
                    value={mainFormValues.color}
                    onChange={(e) => setMainFormValues({ ...mainFormValues, color: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  >
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
                  <input
                    name="size"
                    type="text"
                    placeholder="e.g. Medium, 10x8 inches, 500g"
                    value={mainFormValues.size}
                    onChange={(e) => setMainFormValues({ ...mainFormValues, size: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  />
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
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hasVariants ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </button>
                </div>

                {hasVariants && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-700">
                        Variant Combinations
                      </label>
                      <span className="text-xs text-slate-500">
                        {variants.length} variant{variants.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {variants.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <p className="text-sm text-slate-500 mb-3">No variants added yet</p>
                        <button
                          type="button"
                          onClick={addVariant}
                          className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
                        >
                          Add First Variant
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {variants.map((variant, index) => (
                          <div key={variant.id} className="p-6 bg-slate-50 rounded-xl border border-slate-200">
                            <div className="flex items-center justify-between mb-4">
                              <span className="text-sm font-medium text-slate-700">Variant {index + 1}</span>
                              <button
                                type="button"
                                onClick={() => removeVariant(variant.id)}
                                className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"
                              >
                                <FiTrash2 className="w-4 h-4" />
                                Remove
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Product ID</label>
                                <input
                                  type="text"
                                  value={variant.productId}
                                  onChange={(e) => updateVariant(variant.id, 'productId', e.target.value)}
                                  placeholder="SKU-001"
                                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Material</label>
                                <input
                                  type="text"
                                  value={variant.material}
                                  onChange={(e) => updateVariant(variant.id, 'material', e.target.value)}
                                  placeholder="e.g. Cotton"
                                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Finish</label>
                                <input
                                  type="text"
                                  value={variant.finish}
                                  onChange={(e) => updateVariant(variant.id, 'finish', e.target.value)}
                                  placeholder="e.g. Matte"
                                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Color</label>
                                <select
                                  value={variant.color}
                                  onChange={(e) => updateVariant(variant.id, 'color', e.target.value)}
                                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                                >
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
                                <input
                                  type="text"
                                  value={variant.size}
                                  onChange={(e) => updateVariant(variant.id, 'size', e.target.value)}
                                  placeholder="e.g. Medium"
                                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                                />
                              </div>

                              {/* Per-variant pricing is admin-only: checkout
                                  charges variant.price while settlement pays
                                  the investor product.price, so a variant
                                  price would break the margin math. Vendor
                                  variants inherit the product price. */}
                              {!isVendor && (
                                <>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Price (₹)</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={variant.price}
                                      onChange={(e) => updateVariant(variant.id, 'price', e.target.value)}
                                      placeholder="999"
                                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">MRP (₹)</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={variant.cuttedPrice}
                                      onChange={(e) => updateVariant(variant.id, 'cuttedPrice', e.target.value)}
                                      placeholder="1499"
                                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                                    />
                                  </div>
                                </>
                              )}

                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Stock</label>
                                <input
                                  type="number"
                                  value={variant.stock}
                                  onChange={(e) => updateVariant(variant.id, 'stock', e.target.value)}
                                  placeholder="100"
                                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                                />
                              </div>
                            </div>

                            {/* Variant Images */}
                            <div className="mt-6 pt-6 border-t border-slate-200">
                              <label className="block text-sm font-medium text-slate-700 mb-3">
                                Variant Images {variant.images.length > 0 && `(${variant.images.length})`}
                              </label>

                              <div className="relative border-2 border-dashed border-slate-300 bg-white rounded-xl hover:border-slate-400 transition-all">
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={(e) => handleVariantImageSelect(variant.id, e.target.files)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div className="py-8 px-4 text-center pointer-events-none">
                                  <FiUpload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                                  <p className="text-xs font-medium text-slate-600 mb-1">
                                    Click to upload variant images
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    PNG, JPG, GIF up to 10MB
                                  </p>
                                </div>
                              </div>

                              {variant.images.length > 0 && (
                                <div className="mt-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-medium text-slate-600">
                                      Selected Images
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      Click <FiStar className="inline w-3 h-3" /> for featured
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
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
                                          <div className="absolute top-1 left-1 bg-orange-500 text-white px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-0.5">
                                            <FiStar className="w-2.5 h-2.5 fill-current" />
                                            Featured
                                          </div>
                                        )}

                                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                          <button
                                            type="button"
                                            onClick={() => setVariantFeaturedImage(variant.id, imgIndex)}
                                            className="p-1.5 bg-white rounded-md hover:bg-orange-500 hover:text-white transition-colors"
                                            title="Set as featured"
                                          >
                                            <FiStar className={`w-3 h-3 ${imgIndex === variant.featuredImageIndex ? 'fill-current' : ''}`} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => removeVariantImage(variant.id, image.id)}
                                            className="p-1.5 bg-white text-red-600 rounded-md hover:bg-red-600 hover:text-white transition-colors"
                                            title="Remove image"
                                          >
                                            <FiTrash2 className="w-3 h-3" />
                                          </button>
                                        </div>

                                        <div className="absolute bottom-1 right-1 bg-black bg-opacity-60 text-white px-1.5 py-0.5 rounded text-xs font-medium">
                                          {imgIndex + 1}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={addVariant}
                          className="w-full py-3 px-4 border-2 border-dashed border-slate-300 text-slate-600 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 group"
                        >
                          <FiPlus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          <span className="text-sm font-medium">Add Another Variant</span>
                        </button>

                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs text-blue-800 leading-relaxed">
                            <strong>💡 Tip:</strong> Each variant is pre-filled with values from the main specifications form above.
                            You can modify any field for each variant. Each variant can have its own set of images - upload them in the variant's image section.
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
                  <input name="highlight1" defaultValue={initialProduct?.highlights?.[0] ?? ''} placeholder="Highlight 1" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                  <input name="highlight2" defaultValue={initialProduct?.highlights?.[1] ?? ''} placeholder="Highlight 2" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                  <input name="highlight3" defaultValue={initialProduct?.highlights?.[2] ?? ''} placeholder="Highlight 3" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                  <input name="highlight4" defaultValue={initialProduct?.highlights?.[3] ?? ''} placeholder="Highlight 4" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                  <input name="highlight5" defaultValue={initialProduct?.highlights?.[4] ?? ''} placeholder="Highlight 5" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                  <input name="highlight6" defaultValue={initialProduct?.highlights?.[5] ?? ''} placeholder="Highlight 6" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all" />
                </div>
              </div>

              <div className="md:col-span-2 pt-4">
                <label className="block text-sm font-medium text-slate-700 mb-3">Technical Specifications</label>
                <div className="space-y-3">
                  {Array.from({ length: specCount }, (_, index) => (
                    <div key={index} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input
                        name={`specTitle${index + 1}`}
                        defaultValue={initialProduct?.specifications?.[index]?.title ?? ''}
                        placeholder={`Specification Title ${index + 1}`}
                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                      />
                      <input
                        name={`specDesc${index + 1}`}
                        defaultValue={initialProduct?.specifications?.[index]?.description ?? ''}
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
                {careItems.map((item, index) => (
                  <div key={item.id} className="flex gap-2 items-start">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        value={item.title}
                        onChange={e => setCareItems(prev => prev.map(c => c.id === item.id ? { ...c, title: e.target.value } : c))}
                        placeholder={`Title (e.g. Daily Cleaning)`}
                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all font-medium"
                      />
                      <input
                        value={item.description}
                        onChange={e => setCareItems(prev => prev.map(c => c.id === item.id ? { ...c, description: e.target.value } : c))}
                        placeholder={`Description (e.g. Sweep or vacuum regularly)`}
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
                  onClick={() => setCareItems(prev => [...prev, { id: generateUUID(), title: '', description: '' }])}
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
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer group">
                    <input
                      type="checkbox"
                      name="tags"
                      value="popular"
                      defaultChecked={initialProduct?.tags?.includes("popular") ?? false}
                      className="w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-blue-700">
                      ⭐ Popular
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-yellow-50 hover:border-yellow-300 transition-all cursor-pointer group">
                    <input
                      type="checkbox"
                      name="tags"
                      value="trending"
                      defaultChecked={initialProduct?.tags?.includes("trending") ?? false}
                      className="w-4 h-4 text-yellow-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-yellow-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-yellow-700">
                      🔥 Trending
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-green-50 hover:border-green-300 transition-all cursor-pointer group">
                    <input
                      type="checkbox"
                      name="tags"
                      value="new"
                      defaultChecked={initialProduct?.tags?.includes("new") ?? false}
                      className="w-4 h-4 text-green-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-green-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-green-700">
                      ✨ New
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-purple-50 hover:border-purple-300 transition-all cursor-pointer group">
                    <input
                      type="checkbox"
                      name="tags"
                      value="premium"
                      defaultChecked={initialProduct?.tags?.includes("premium") ?? false}
                      className="w-4 h-4 text-purple-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-purple-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-purple-700">
                      💎 Premium
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-pink-50 hover:border-pink-300 transition-all cursor-pointer group">
                    <input
                      type="checkbox"
                      name="tags"
                      value="exclusive"
                      defaultChecked={initialProduct?.tags?.includes("exclusive") ?? false}
                      className="w-4 h-4 text-pink-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-pink-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-pink-700">
                      👑 Exclusive
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 hover:border-slate-400 transition-all cursor-pointer group">
                    <input
                      type="checkbox"
                      name="tags"
                      value="classic"
                      defaultChecked={initialProduct?.tags?.includes("classic") ?? false}
                      className="w-4 h-4 text-slate-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-slate-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                      🏛️ Classic
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-orange-50 hover:border-orange-300 transition-all cursor-pointer group">
                    <input
                      type="checkbox"
                      name="tags"
                      value="bestseller"
                      defaultChecked={initialProduct?.tags?.includes("bestseller") ?? false}
                      className="w-4 h-4 text-orange-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-orange-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-orange-700">
                      🏆 Best Seller
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-red-50 hover:border-red-300 transition-all cursor-pointer group">
                    <input
                      type="checkbox"
                      name="tags"
                      value="limited"
                      defaultChecked={initialProduct?.tags?.includes("limited") ?? false}
                      className="w-4 h-4 text-red-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-red-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-red-700">
                      ⏰ Limited Edition
                    </span>
                  </label>
                </div>

                <p className="text-xs text-slate-500 mt-4">
                  Selected tags will appear as badges on the product card for better visibility
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={() => router.push('/admin/products')}
            className="flex-1 py-4 px-6 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl hover:bg-slate-50 transition-all duration-200 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-4 px-6 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{isEdit ? 'Saving...' : 'Creating...'}</span>
              </>
            ) : (
              <>
                <FiCheck className="w-5 h-5" />
                <span>{isEdit ? 'Save Changes' : isVendor ? 'Submit Product' : 'Create Product'}</span>
              </>
            )}
          </button>
        </div>
        </div>

        {/* Live preview — mirrors the real product card, updates as you type */}
        <div className="lg:sticky lg:top-6">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Live Preview</p>
          <ProductPreviewCard
            name={mainFormValues.name}
            shortDescription={mainFormValues.shortDescription}
            imageUrl={previewImage}
            // The card previews what a CUSTOMER sees, so a vendor's own price
            // has to be grossed up here too — otherwise the preview shows
            // ₹100 while the live product shows ₹120.
            price={
              isVendor
                ? listingFromVendorNet(Number(mainFormValues.price) || 0, {
                    marginPct: pricingSettings.marginPct,
                  })
                : Number(mainFormValues.price) || 0
            }
            cuttedPrice={isVendor ? undefined : Number(mainFormValues.cuttedPrice) || undefined}
            variantCount={hasVariants ? variants.length : 0}
          />
          <p className="text-xs text-slate-400 mt-3 text-center">This is what customers will see on the product card.</p>
        </div>
        </div>
      </form>
    </div>
  );
}