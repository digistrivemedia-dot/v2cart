"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { HiPlus, HiPencil, HiShoppingBag, HiTrash } from "react-icons/hi";
import { FiChevronLeft, FiChevronRight, FiSearch, FiX, FiDownload, FiUpload, FiCheck, FiAlertCircle } from "react-icons/fi";
import { GlobalPricingBar } from "@/components/admin/GlobalPricingBar";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

interface Product {
  _id: string;
  name: string;
  description: string;
  shortDescription?: string;
  price: number;
  cuttedPrice: number;
  vendorPrice?: number;
  /** Per-product margin override; null/undefined means it follows the global margin. */
  marginPct?: number | null;
  /** The margin band this product sits in, resolved by the API. */
  marginCategory?: 'low' | 'medium' | 'high' | null;
  /** This product's bands (its own, or the platform defaults). */
  marginBands?: Record<'low' | 'medium' | 'high', { days: number; pct: number }>;
  // Phase 21 — when this product's money is released after delivery.
  returnPolicy?: 'full' | 'replacement_only' | 'none';
  returnWindowDays?: number;
  returnPolicyLabel?: string;
  usesDefaultReturnPolicy?: boolean;
  /** True when it has no bands of its own and is riding the defaults. */
  usesDefaultBands?: boolean;
  listingStatus?: 'draft' | 'pending_approval' | 'live' | 'rejected' | 'paused';
  rejectionNote?: string | null;
  pricingStatus?: 'pending_pricing' | 'priced';
  productId?: string;
  category: {
    _id: string;
    name: string;
    slug: string;
  };
  subcategory?: {
    _id: string;
    name: string;
    slug: string;
  };
  images: Array<{ url: string; public_id: string; isFeatured?: boolean }>;
  stock: number;
  brand?: {
    name: string;
    logo?: { url: string; public_id: string };
  };
  material?: string;
  finish?: string;
  color?: string;
  warranty?: number;
  hasVariants?: boolean;
  variants?: Array<{
    productId?: string;
    color?: string;
    size?: string;
    finish?: string;
    material?: string;
    unit?: string;
    price?: number;
    cuttedPrice?: number;
    stock?: number;
    images?: Array<{ url: string; public_id: string; isFeatured?: boolean }>;
  }>;
}

interface CsvChange {
  type: 'product' | 'variant';
  productId: string;
  productName: string;
  variantIndex?: number;
  variantLabel?: string;
  changes: Array<{
    field: string;
    oldValue: number | string;
    newValue: number | string;
  }>;
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{ id: string; name: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successTimeoutId, setSuccessTimeoutId] = useState<NodeJS.Timeout | null>(null);

  // Listing approval state
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [productToReject, setProductToReject] = useState<{ id: string; name: string } | null>(null);
  const [rejectionNoteInput, setRejectionNoteInput] = useState("");

  // CSV export/import state
  const [csvExporting, setCsvExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview'>('upload');
  const [csvChanges, setCsvChanges] = useState<CsvChange[]>([]);
  const [csvParseError, setCsvParseError] = useState('');
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [allProductsData, setAllProductsData] = useState<Product[]>([]);
  const [applyResult, setApplyResult] = useState<{ updated: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search and Pagination state
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'pending_approval' | 'rejected'>('live');

  useEffect(() => {
    fetchProducts();

    // Cleanup function
    return () => {
      if (successTimeoutId) {
        clearTimeout(successTimeoutId);
      }
    };
  }, [searchQuery, currentPage, itemsPerPage, statusFilter]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');

      // Fetch ALL products (backend doesn't support pagination)
      const response = await fetch(`${API_BASE_URL}/admin/products`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        cache: 'no-store',
      });

      const result = await response.json();

      if (result.success) {
        let allProducts = result.products || [];

        // Client-side filtering by approval status
        if (statusFilter !== 'all') {
          allProducts = allProducts.filter((product: Product) =>
            statusFilter === 'live'
              ? (product.listingStatus ?? 'live') === 'live'
              : product.listingStatus === statusFilter
          );
        }

        // Client-side filtering by search query
        if (searchQuery) {
          const searchLower = searchQuery.toLowerCase();
          allProducts = allProducts.filter((product: Product) =>
            product.name?.toLowerCase().includes(searchLower) ||
            product.description?.toLowerCase().includes(searchLower) ||
            product.category?.name?.toLowerCase().includes(searchLower) ||
            product.brand?.name?.toLowerCase().includes(searchLower)
          );
        }

        // Client-side pagination
        const totalCount = allProducts.length;
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedProducts = allProducts.slice(startIndex, endIndex);

        setProducts(paginatedProducts);
        setTotalProducts(totalCount);
        setTotalPages(Math.ceil(totalCount / itemsPerPage));
      } else {
        setError(result.message || 'Failed to fetch products');
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const showSuccessMessage = (message: string) => {
    // Clear any existing timeout
    if (successTimeoutId) {
      clearTimeout(successTimeoutId);
    }

    setSuccessMessage(message);
    const timeoutId = setTimeout(() => setSuccessMessage(null), 5000);
    setSuccessTimeoutId(timeoutId);
  };

  // ── CSV Helpers ──

  const escapeCsvField = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  // ── CSV Export ──

  const handleExportCsv = async () => {
    setCsvExporting(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE_URL}/admin/products`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      const result = await response.json();
      if (!result.success) {
        setError('Failed to fetch products for export');
        return;
      }

      const allProducts: Product[] = result.products || [];

      // CSV columns
      const headers = [
        'type', '_id', 'name', 'productId', 'variant_index',
        'variant_color', 'variant_size', 'price', 'cuttedPrice',
        'stock', 'category_name'
      ];

      const rows: string[] = [headers.join(',')];

      for (const p of allProducts) {
        // Product row
        rows.push([
          escapeCsvField('product'),
          escapeCsvField(p._id),
          escapeCsvField(p.name),
          escapeCsvField(p.productId || ''),
          '', // variant_index
          '', // variant_color
          '', // variant_size
          escapeCsvField(p.price),
          escapeCsvField(p.cuttedPrice || ''),
          escapeCsvField(p.stock),
          escapeCsvField(p.category?.name || ''),
        ].join(','));

        // Variant rows
        if (p.hasVariants && p.variants && p.variants.length > 0) {
          p.variants.forEach((v, idx) => {
            rows.push([
              escapeCsvField('variant'),
              escapeCsvField(p._id),
              escapeCsvField(p.name),
              escapeCsvField(v.productId || ''),
              escapeCsvField(idx),
              escapeCsvField(v.color || ''),
              escapeCsvField(v.size || ''),
              escapeCsvField(v.price ?? ''),
              escapeCsvField(v.cuttedPrice ?? ''),
              escapeCsvField(v.stock ?? ''),
              escapeCsvField(p.category?.name || ''),
            ].join(','));
          });
        }
      }

      const csv = rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showSuccessMessage('CSV exported successfully!');
    } catch {
      setError('Failed to export CSV');
    } finally {
      setCsvExporting(false);
    }
  };

  // ── CSV Import & Preview ──

  const openImportModal = () => {
    setShowImportModal(true);
    setImportStep('upload');
    setCsvChanges([]);
    setCsvParseError('');
    setApplyResult(null);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportStep('upload');
    setCsvChanges([]);
    setCsvParseError('');
    setApplyResult(null);
    setAllProductsData([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const processFile = async (file: File) => {
    setCsvParseError('');

    if (!file.name.endsWith('.csv')) {
      setCsvParseError('Please upload a .csv file');
      return;
    }

    try {
      // Fetch all current products for comparison
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE_URL}/admin/products`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      const result = await response.json();
      if (!result.success) {
        setCsvParseError('Failed to fetch current product data for comparison');
        return;
      }
      const currentProducts: Product[] = result.products || [];
      setAllProductsData(currentProducts);

      // Build lookup map
      const productMap = new Map<string, Product>();
      for (const p of currentProducts) {
        productMap.set(p._id, p);
      }

      // Parse CSV
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        setCsvParseError('CSV file is empty or has no data rows');
        return;
      }

      const headers = parseCsvLine(lines[0]).map(h => h.trim());
      const requiredHeaders = ['type', '_id', 'price'];
      for (const rh of requiredHeaders) {
        if (!headers.includes(rh)) {
          setCsvParseError(`CSV is missing required column: "${rh}"`);
          return;
        }
      }

      const getColIndex = (name: string) => headers.indexOf(name);

      const editableProductFields = ['price', 'cuttedPrice', 'stock'];
      const editableVariantFields = ['price', 'cuttedPrice', 'stock'];
      const numericFields = ['price', 'cuttedPrice', 'stock'];

      const changes: CsvChange[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const rowType = values[getColIndex('type')]?.trim();
        const productId = values[getColIndex('_id')]?.trim();

        if (!productId || !rowType) continue;

        const currentProduct = productMap.get(productId);
        if (!currentProduct) continue;

        if (rowType === 'product') {
          const rowChanges: CsvChange['changes'] = [];

          for (const field of editableProductFields) {
            const colIdx = getColIndex(field);
            if (colIdx === -1) continue;
            const rawVal = values[colIdx]?.trim();
            if (rawVal === '' || rawVal === undefined) continue;

            const newVal = numericFields.includes(field) ? Number(rawVal) : rawVal;
            if (numericFields.includes(field) && isNaN(newVal as number)) continue;

            const oldVal = (currentProduct as any)[field] ?? '';
            if (Number(oldVal) !== Number(newVal)) {
              rowChanges.push({ field, oldValue: oldVal, newValue: newVal });
            }
          }

          if (rowChanges.length > 0) {
            changes.push({
              type: 'product',
              productId,
              productName: currentProduct.name,
              changes: rowChanges,
            });
          }
        } else if (rowType === 'variant') {
          const variantIndexCol = getColIndex('variant_index');
          if (variantIndexCol === -1) continue;
          const variantIndex = parseInt(values[variantIndexCol]?.trim());
          if (isNaN(variantIndex)) continue;

          const currentVariant = currentProduct.variants?.[variantIndex];
          if (!currentVariant) continue;

          const rowChanges: CsvChange['changes'] = [];

          for (const field of editableVariantFields) {
            const colIdx = getColIndex(field);
            if (colIdx === -1) continue;
            const rawVal = values[colIdx]?.trim();
            if (rawVal === '' || rawVal === undefined) continue;

            const newVal = numericFields.includes(field) ? Number(rawVal) : rawVal;
            if (numericFields.includes(field) && isNaN(newVal as number)) continue;

            const oldVal = (currentVariant as any)[field] ?? '';
            if (Number(oldVal) !== Number(newVal)) {
              rowChanges.push({ field, oldValue: oldVal, newValue: newVal });
            }
          }

          if (rowChanges.length > 0) {
            const label = [currentVariant.color, currentVariant.size].filter(Boolean).join(' / ') || `Variant ${variantIndex + 1}`;
            changes.push({
              type: 'variant',
              productId,
              productName: currentProduct.name,
              variantIndex,
              variantLabel: label,
              changes: rowChanges,
            });
          }
        }
      }

      if (changes.length === 0) {
        setCsvParseError('No changes detected. Make sure you edited the price, cuttedPrice, or stock columns.');
        return;
      }

      setCsvChanges(changes);
      setImportStep('preview');
    } catch {
      setCsvParseError('Failed to parse CSV file. Please check the format.');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const applyImportChanges = async () => {
    setApplyingChanges(true);
    const token = localStorage.getItem('auth_token');
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    // Group all changes by product ID
    const changesByProduct = new Map<string, { productChanges: Record<string, number | string>; variantChanges: Map<number, Record<string, number | string>> }>();

    for (const change of csvChanges) {
      if (!changesByProduct.has(change.productId)) {
        changesByProduct.set(change.productId, { productChanges: {}, variantChanges: new Map() });
      }
      const entry = changesByProduct.get(change.productId)!;

      if (change.type === 'product') {
        for (const c of change.changes) {
          entry.productChanges[c.field] = c.newValue;
        }
      } else if (change.type === 'variant' && change.variantIndex !== undefined) {
        if (!entry.variantChanges.has(change.variantIndex)) {
          entry.variantChanges.set(change.variantIndex, {});
        }
        for (const c of change.changes) {
          entry.variantChanges.get(change.variantIndex)![c.field] = c.newValue;
        }
      }
    }

    for (const [productId, { productChanges, variantChanges }] of changesByProduct) {
      try {
        const updateBody: Record<string, any> = { ...productChanges };

        // Handle variant updates
        if (variantChanges.size > 0) {
          const currentProduct = allProductsData.find(p => p._id === productId);
          if (currentProduct?.variants) {
            const updatedVariants = currentProduct.variants.map((v: any, idx: number) => {
              if (variantChanges.has(idx)) {
                return { ...v, ...variantChanges.get(idx) };
              }
              return { ...v };
            });
            updateBody.variants = updatedVariants;
          }
        }

        const response = await fetch(`${API_BASE_URL}/admin/product/${productId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
          body: JSON.stringify(updateBody),
        });
        const result = await response.json();
        if (result.success) {
          updated++;
        } else {
          failed++;
          errors.push(`${changesByProduct.get(productId) ? productId : productId}: ${result.message || 'Update failed'}`);
        }
      } catch {
        failed++;
        errors.push(`${productId}: Network error`);
      }
    }

    setApplyResult({ updated, failed, errors });
    setApplyingChanges(false);

    if (updated > 0) {
      fetchProducts();
    }
  };

  // ── Delete handlers ──

  const openDeleteModal = (productId: string, productName: string) => {
    setProductToDelete({ id: productId, name: productName });
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setProductToDelete(null);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;

    setDeleteLoading(productToDelete.id);
    setShowDeleteModal(false);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE_URL}/admin/product/${productToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const result = await response.json();

      if (result.success) {
        showSuccessMessage(`"${productToDelete.name}" deleted successfully!`);
        fetchProducts(); // Refresh to update pagination
      } else {
        setError(result.message || 'Failed to delete product');
      }
    } catch (err) {
      console.error('Error deleting product:', err);
      setError('Failed to delete product');
    } finally {
      setDeleteLoading(null);
      setProductToDelete(null);
    }
  };

  // ── Listing approval handlers ──

  const updateListingStatus = async (productId: string, listingStatus: string, rejectionNote?: string) => {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_BASE_URL}/admin/product/${productId}/listing-status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
      body: JSON.stringify({ listingStatus, rejectionNote: rejectionNote ?? null }),
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to update listing status');
    }
    return result.product;
  };

  // Approving from the list publishes with whatever margin rules the product
  // already resolves to — its own, or the platform defaults. Those numbers are
  // spelled out first rather than applied silently: approval is the moment the
  // investor's return is decided, and admin should see it even when they are
  // just accepting the defaults. Different numbers for this one product are set
  // on its edit page.
  const handleApprove = async (productId: string, productName: string) => {
    const product = products.find((p) => p._id === productId);
    const bands = product?.marginBands;

    if (bands) {
      const lines = (['low', 'medium', 'high'] as const)
        .map((k) =>
          `  ${k.padEnd(7)} `
          + (k === 'high' ? `over ${bands.medium.days}d` : `within ${bands[k].days}d`)
          + ` → investor earns ${bands[k].pct}%`
        )
        .join('\n');

      // Phase 21 — WHEN the money is released, shown next to how much it is.
      // Approval is the one moment admin sees both halves of the deal.
      const policy = product?.returnPolicy ?? 'full';
      const windowDays = product?.returnWindowDays ?? 7;
      const releaseLine = policy === 'full'
        ? `  paid out ${windowDays} day${windowDays === 1 ? '' : 's'} after delivery `
          + `(${windowDays}-day refund window)`
        : `  paid out at delivery (${policy === 'none'
            ? 'no return or replacement'
            : 'replacement only, no refund'})`;

      const ok = window.confirm(
        `Publish "${productName}" with these rules?\n\n`
        + `MARGIN BANDS — what an investor earns\n${lines}\n\n`
        + `RETURN WINDOW — when the vendor and investor are paid\n${releaseLine}\n\n`
        + (product?.usesDefaultBands || product?.usesDefaultReturnPolicy
          ? 'Some of these are the platform defaults. To change them for this '
            + 'product alone, open Edit and set them in the Admin Pricing panel '
            + 'before approving.'
          : 'These rules are set on this product.')
      );
      if (!ok) return;
    }

    setApprovalLoading(productId);
    try {
      await updateListingStatus(productId, 'live');
      showSuccessMessage(`"${productName}" approved and is now live!`);
      fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve product');
    } finally {
      setApprovalLoading(null);
    }
  };

  const openRejectModal = (productId: string, productName: string) => {
    setProductToReject({ id: productId, name: productName });
    setRejectionNoteInput("");
    setShowRejectModal(true);
  };

  const closeRejectModal = () => {
    setShowRejectModal(false);
    setProductToReject(null);
    setRejectionNoteInput("");
  };

  const confirmReject = async () => {
    if (!productToReject) return;

    setApprovalLoading(productToReject.id);
    setShowRejectModal(false);

    try {
      await updateListingStatus(productToReject.id, 'rejected', rejectionNoteInput.trim() || undefined);
      showSuccessMessage(`"${productToReject.name}" rejected.`);
      fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject product');
    } finally {
      setApprovalLoading(null);
      setProductToReject(null);
      setRejectionNoteInput("");
    }
  };

  // Search handlers
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    setCurrentPage(1); // Reset to page 1 on new search
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setCurrentPage(1);
  };

  // Pagination handlers
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1); // Reset to page 1 when changing items per page
  };

  const handleStatusFilterChange = (value: 'all' | 'live' | 'pending_approval' | 'rejected') => {
    setStatusFilter(value);
    setCurrentPage(1); // Reset to page 1 when changing the status filter
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const itemsPerPageOptions = [6, 12, 18, 24, 30];

  // ── Render helpers ──

  const fieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      price: 'Price',
      cuttedPrice: 'MRP',
      stock: 'Stock',
    };
    return labels[field] || field;
  };

  const formatValue = (field: string, value: number | string) => {
    if (value === '' || value === null || value === undefined) return '—';
    if (['price', 'cuttedPrice'].includes(field)) {
      return `₹${Number(value).toLocaleString('en-IN')}`;
    }
    return String(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading products...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Products Management</h1>
          <p className="text-slate-600 mt-1">
            Manage all your products and inventory ({totalProducts} products)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={handleExportCsv}
            disabled={csvExporting}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <FiDownload className="w-4 h-4" />
            {csvExporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            onClick={openImportModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <FiUpload className="w-4 h-4" />
            Update Prices
          </button>
          <Link
            href="/admin/products/create"
            className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors shadow-lg hover:shadow-xl font-medium"
          >
            <HiPlus className="w-5 h-5" />
            <span>Add Product</span>
          </Link>
        </div>
      </div>

      <GlobalPricingBar />

      {/* Search Box */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4">
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products by name..."
              className="w-full pl-12 pr-24 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="mr-3 absolute right-20 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                title="Clear search"
              >
                <FiX className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors text-sm font-medium"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Approval Status Filter */}
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-sm text-slate-600 font-medium whitespace-nowrap">Status:</span>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          {([
            { value: 'all', label: 'All' },
            { value: 'live', label: 'Approved' },
            { value: 'pending_approval', label: 'Pending' },
            { value: 'rejected', label: 'Rejected' },
          ] as const).map((option) => (
            <button
              key={option.value}
              onClick={() => handleStatusFilterChange(option.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                statusFilter === option.value
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items Per Page Selector */}
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-sm text-slate-600 font-medium whitespace-nowrap">Show:</span>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          {itemsPerPageOptions.map((option) => (
            <button
              key={option}
              onClick={() => handleItemsPerPageChange(option)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                itemsPerPage === option
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-600 whitespace-nowrap">per page</span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Products Grid */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200">
        {products.length === 0 ? (
          <div className="text-center px-4 py-16 sm:py-20">
            <HiShoppingBag className="w-20 h-20 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              {searchQuery
                ? 'No Products Found'
                : statusFilter !== 'all'
                ? `No ${statusFilter === 'live' ? 'Approved' : statusFilter === 'pending_approval' ? 'Pending' : 'Rejected'} Products`
                : 'No Products Yet'}
            </h3>
            <p className="text-slate-600 mb-6">
              {searchQuery
                ? 'Try adjusting your search terms'
                : statusFilter !== 'all'
                ? 'Try a different status filter above.'
                : 'Start adding products to your inventory'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Link
                href="/admin/products/create"
                className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                <HiPlus className="w-5 h-5" />
                <span className="font-medium">Add Your First Product</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:gap-6 sm:p-6">
            {products.map((product) => (
              <div
                key={product._id}
                className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg transition-all group"
              >
                {/* Product Image */}
                <div className="relative h-48 bg-slate-100 overflow-hidden">
                  {product.images && product.images.length > 0 ? (
                    <img
                      src={product.images.find(img => img.isFeatured)?.url || product.images[0].url}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <HiShoppingBag className="w-16 h-16" />
                    </div>
                  )}

                  {/* Category Badge */}
                  <div className="absolute top-2 right-2">
                    <span className="px-3 py-1 bg-orange-500 text-white text-xs font-semibold rounded-full">
                      {product.category?.name || 'Uncategorized'}
                    </span>
                  </div>

                  {/* Stock Badge */}
                  <div className="absolute top-2 left-2">
                    <span className={`px-3 py-1 text-white text-xs font-semibold rounded-full ${product.stock > 50 ? 'bg-green-500' :
                        product.stock > 10 ? 'bg-yellow-500' :
                          'bg-red-500'
                      }`}>
                      Stock: {product.stock}
                    </span>
                  </div>

                  {/* Variants Badge */}
                  {product.hasVariants && product.variants && product.variants.length > 0 && (
                    <div className="absolute bottom-2 left-2">
                      <span className="px-3 py-1 bg-purple-500 text-white text-xs font-semibold rounded-full">
                        {product.variants.length} Variants
                      </span>
                    </div>
                  )}

                  {/* Custom-margin badge — makes products that opted out of the
                      global margin visible without opening each one. */}
                  {product.marginPct != null && (
                    <div className="absolute bottom-2 left-2">
                      <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                        {product.marginPct}% margin
                      </span>
                    </div>
                  )}

                  {/* Margin band — what an investor earns on this product, and
                      the days that decide it. Phase 16 skipped this column
                      because rendering it meant duplicating the investor sales
                      aggregation; it is two fields on the document now. */}
                  {product.marginCategory && product.marginBands && (
                    <div className="absolute top-2 left-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${
                          product.marginCategory === 'high'
                            ? 'bg-amber-600'
                            : product.marginCategory === 'medium'
                              ? 'bg-emerald-600'
                              : 'bg-slate-600'
                        }`}
                        title={
                          `${product.marginCategory} margin — investor earns `
                          + `${product.marginBands[product.marginCategory].pct}% `
                          + (product.usesDefaultBands
                            ? '(platform default rules)'
                            : '(rules set on this product)')
                        }
                      >
                        {product.marginCategory} · {product.marginBands[product.marginCategory].pct}%
                        {product.usesDefaultBands ? '' : ' ★'}
                      </span>
                    </div>
                  )}

                  {/* Listing Status Badge — shows vendor-submitted drafts awaiting pricing/approval */}
                  {product.listingStatus && product.listingStatus !== 'live' && (
                    <div className="absolute bottom-2 right-2">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        product.listingStatus === 'draft' ? 'bg-slate-500 text-white' :
                        product.listingStatus === 'pending_approval' ? 'bg-amber-500 text-white' :
                        product.listingStatus === 'rejected' ? 'bg-red-600 text-white' :
                        'bg-slate-600 text-white'
                      }`}>
                        {product.listingStatus === 'draft' ? 'Needs Pricing' :
                         product.listingStatus === 'pending_approval' ? 'Pending Approval' :
                         product.listingStatus === 'rejected' ? 'Rejected' : 'Paused'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-lg text-slate-900 mb-1 line-clamp-1">
                    {product.name}
                  </h3>

                  {/* Brand & Material */}
                  <div className="flex items-center gap-2 mb-2">
                    {product.brand?.name && (
                      <span className="text-sm text-slate-600">
                        {product.brand.name}
                      </span>
                    )}
                    {product.material && (
                      <>
                        {product.brand?.name && <span className="text-slate-400">•</span>}
                        <span className="text-sm text-slate-600 capitalize">
                          {product.material}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                    {product.shortDescription || product.description}
                  </p>

                  {/* Subcategory & Finish */}
                  {(product.subcategory || product.finish || product.color) && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {product.subcategory && (
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-md">
                          {product.subcategory.name}
                        </span>
                      )}
                      {product.finish && (
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md capitalize">
                          {product.finish}
                        </span>
                      )}
                      {product.color && (
                        <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-md capitalize">
                          {product.color}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Pricing */}
                  <div className="flex items-center gap-3 mb-4">
                    <div>
                      <p className="text-xs text-slate-500">Price</p>
                      {product.price != null ? (
                        <p className="text-xl font-bold text-orange-500">
                          ₹{Number(product.price).toLocaleString("en-IN")}
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-amber-600">
                          Pending Pricing
                        </p>
                      )}
                    </div>
                    {product.cuttedPrice && product.cuttedPrice > product.price && (
                      <div>
                        <p className="text-xs text-slate-500">MRP</p>
                        <p className="text-sm font-semibold text-slate-400 line-through">
                          ₹{Number(product.cuttedPrice).toLocaleString("en-IN")}
                        </p>
                      </div>
                    )}
                    {product.cuttedPrice && product.cuttedPrice > product.price && (
                      <div className="ml-auto">
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">
                          {Math.round(((product.cuttedPrice - product.price) / product.cuttedPrice) * 100)}% OFF
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Rejection note — shown to admin so they remember why it was rejected */}
                  {product.listingStatus === 'rejected' && product.rejectionNote && (
                    <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs font-medium text-red-700 mb-0.5">Rejection reason</p>
                      <p className="text-xs text-red-600">{product.rejectionNote}</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 mb-2">
                    <Link
                      href={`/admin/products/${product._id}/edit`}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-orange-500 hover:text-white transition-colors"
                    >
                      <HiPencil className="w-4 h-4" />
                      <span className="font-medium">Edit</span>
                    </Link>
                    <button
                      onClick={() => openDeleteModal(product._id, product.name)}
                      disabled={deleteLoading === product._id}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deleteLoading === product._id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                          <span className="font-medium">Deleting...</span>
                        </>
                      ) : (
                        <>
                          <HiTrash className="w-4 h-4" />
                          <span className="font-medium">Delete</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Approve/Reject — only for listings still needing a decision. Already-live (approved) listings don't show these. */}
                  {product.listingStatus !== 'live' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(product._id, product.name)}
                        disabled={approvalLoading === product._id}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FiCheck className="w-4 h-4" />
                        <span className="font-medium">{approvalLoading === product._id ? 'Approving...' : 'Approve'}</span>
                      </button>
                      <button
                        onClick={() => openRejectModal(product._id, product.name)}
                        disabled={approvalLoading === product._id || product.listingStatus === 'rejected'}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FiX className="w-4 h-4" />
                        <span className="font-medium">Reject</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalProducts > 0 && totalPages > 1 && (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
          {/* Page Navigation */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {/* Previous Button */}
            <button
              onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
              <FiChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>

            {/* Page Numbers */}
            <div className="flex flex-wrap items-center justify-center gap-1">
              {getPageNumbers().map((page, index) => (
                page === '...' ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-slate-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page as number)}
                    className={`min-w-[40px] h-10 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                      currentPage === page
                        ? "bg-orange-500 text-white shadow-sm"
                        : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {page}
                  </button>
                )
              ))}
            </div>

            {/* Next Button */}
            <button
              onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
              <span className="hidden sm:inline">Next</span>
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Page Info */}
          <div className="text-center text-sm text-slate-500 mt-4">
            Page {currentPage} of {totalPages}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && productToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all animate-slideUp">
            <div className="p-6">
              {/* Icon */}
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <HiTrash className="w-8 h-8 text-red-600" />
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold text-slate-900 text-center mb-2">
                Delete Product?
              </h3>

              {/* Message */}
              <p className="text-slate-600 text-center mb-6">
                Are you sure you want to delete <span className="font-semibold text-slate-900">&quot;{productToDelete.name}&quot;</span>? This action cannot be undone.
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={closeDeleteModal}
                  className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3 px-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium shadow-lg hover:shadow-xl"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Listing Modal */}
      {showRejectModal && productToReject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all animate-slideUp">
            <div className="p-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiX className="w-8 h-8 text-red-600" />
              </div>

              <h3 className="text-2xl font-bold text-slate-900 text-center mb-2">
                Reject Product?
              </h3>

              <p className="text-slate-600 text-center mb-4">
                Rejecting <span className="font-semibold text-slate-900">&quot;{productToReject.name}&quot;</span> will hide it from customers. The vendor will see this listing marked as rejected.
              </p>

              <label className="block text-sm font-medium text-slate-700 mb-2">
                Reason for the vendor (optional)
              </label>
              <textarea
                value={rejectionNoteInput}
                onChange={(e) => setRejectionNoteInput(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g. Product photos are blurry, please re-upload clearer images."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all mb-6 resize-none"
              />

              <div className="flex gap-3">
                <button
                  onClick={closeRejectModal}
                  className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  className="flex-1 py-3 px-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium shadow-lg hover:shadow-xl"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto transform transition-all ${importStep === 'preview' ? 'max-w-4xl' : 'max-w-lg'}`}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">
                {applyResult ? 'Update Results' : importStep === 'upload' ? 'Update Prices via CSV' : 'Review Changes'}
              </h3>
              <button
                onClick={closeImportModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <FiX className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6">
              {/* Result View */}
              {applyResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
                    <FiCheck className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-lg font-semibold text-green-800">{applyResult.updated} product{applyResult.updated !== 1 ? 's' : ''} updated successfully</p>
                    </div>
                  </div>
                  {applyResult.failed > 0 && (
                    <div className="p-4 bg-red-50 rounded-xl">
                      <div className="flex items-center gap-3 mb-2">
                        <FiAlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                        <p className="text-lg font-semibold text-red-800">{applyResult.failed} failed</p>
                      </div>
                      <div className="max-h-32 overflow-y-auto mt-2">
                        {applyResult.errors.map((err, i) => (
                          <p key={i} className="text-sm text-red-600 py-0.5">{err}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={closeImportModal}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors font-medium"
                  >
                    Done
                  </button>
                </div>
              ) : importStep === 'upload' ? (
                /* Upload Step */
                <div>
                  <p className="text-sm text-slate-600 mb-4">
                    Export your products CSV first, edit the <strong>price</strong>, <strong>cuttedPrice</strong>, or <strong>stock</strong> columns, then upload the edited file here.
                  </p>

                  {/* Drag & Drop Zone */}
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                      dragActive
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                    }`}
                  >
                    <FiUpload className={`w-12 h-12 mx-auto mb-4 ${dragActive ? 'text-blue-500' : 'text-slate-400'}`} />
                    <p className="text-lg font-medium text-slate-700 mb-1">
                      {dragActive ? 'Drop your CSV file here' : 'Drag & drop your CSV file here'}
                    </p>
                    <p className="text-sm text-slate-500">or click to browse files</p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {csvParseError && (
                    <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <FiAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{csvParseError}</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Preview Step */
                <div>
                  {/* Summary */}
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-4">
                    <div className="px-4 py-2 bg-blue-50 rounded-lg">
                      <span className="text-2xl font-bold text-blue-600">{csvChanges.filter(c => c.type === 'product').length}</span>
                      <span className="text-sm text-blue-700 ml-2">Products</span>
                    </div>
                    <div className="px-4 py-2 bg-purple-50 rounded-lg">
                      <span className="text-2xl font-bold text-purple-600">{csvChanges.filter(c => c.type === 'variant').length}</span>
                      <span className="text-sm text-purple-700 ml-2">Variants</span>
                    </div>
                    <div className="px-4 py-2 bg-orange-50 rounded-lg">
                      <span className="text-2xl font-bold text-orange-600">{csvChanges.reduce((sum, c) => sum + c.changes.length, 0)}</span>
                      <span className="text-sm text-orange-700 ml-2">Total Changes</span>
                    </div>
                  </div>

                  {/* Changes Table */}
                  <div className="max-h-[400px] overflow-auto border border-slate-200 rounded-xl">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-slate-700">Product</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-700">Field</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-700">Current</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-700"></th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-700">New</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {csvChanges.map((change, ci) =>
                          change.changes.map((c, fi) => (
                            <tr key={`${ci}-${fi}`} className="hover:bg-slate-50">
                              <td className="px-4 py-3">
                                {fi === 0 && (
                                  <div>
                                    <p className="font-medium text-slate-900 line-clamp-1">{change.productName}</p>
                                    {change.type === 'variant' && (
                                      <p className="text-xs text-purple-600 mt-0.5">Variant: {change.variantLabel}</p>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">
                                  {fieldLabel(c.field)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="text-red-500 line-through">{formatValue(c.field, c.oldValue)}</span>
                              </td>
                              <td className="px-4 py-3 text-center text-slate-400">
                                →
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="text-green-600 font-semibold">{formatValue(c.field, c.newValue)}</span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => { setImportStep('upload'); setCsvChanges([]); setCsvParseError(''); }}
                      disabled={applyingChanges}
                      className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={applyImportChanges}
                      disabled={applyingChanges}
                      className="flex-1 py-3 px-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {applyingChanges ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Updating...
                        </>
                      ) : (
                        <>
                          <FiCheck className="w-5 h-5" />
                          Confirm & Update
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-4 left-4 right-4 z-50 sm:left-auto animate-slideInRight">
          <div className="bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 sm:min-w-[300px]">
            <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-medium">{successMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
