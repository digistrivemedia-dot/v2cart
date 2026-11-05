"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { HiPlus, HiPencil, HiTrash, HiChevronDown, HiChevronRight, HiX, HiViewGrid, HiMenuAlt4 } from "react-icons/hi";
import { useCategories, useCategoryMutation } from "@/hooks/category";
import type { Category } from "@/schemas";

// A category carries NO margin rules. Phases 16/17 put sell-speed windows and
// a margin % per tier here, with an inheritance chain up the parent categories;
// Phase 20 moved both onto the individual product, because the grain was wrong
// — an iPhone 15 and an iPhone 14 are both phones and need different day counts
// and different percentages. The rules are set per product at approval, in
// components/admin/ProductPricingPanel.tsx.

export default function CategoryManagement() {
  const { categories, isLoading } = useCategories(true); // Include inactive
  const { create, update, remove, toggle, reorder, isCreating, isUpdating, isDeleting, isToggling, isReordering } = useCategoryMutation();

  // Local ordered list for drag-and-drop (top-level only)
  const [orderedCategories, setOrderedCategories] = useState<Category[]>([]);
  const draggedId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Sync local order when server data loads/changes
  useEffect(() => {
    setOrderedCategories([...categories]);
  }, [categories]);

  const handleDragStart = (id: string) => {
    draggedId.current = id;
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId.current || draggedId.current === targetId) return;
    setDragOverId(targetId);
    setOrderedCategories(prev => {
      const dragIdx = prev.findIndex(c => c._id === draggedId.current);
      const targetIdx = prev.findIndex(c => c._id === targetId);
      if (dragIdx === -1 || targetIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
  };

  const handleDrop = () => {
    draggedId.current = null;
    setDragOverId(null);
    reorder(orderedCategories.map((c, i) => ({ id: c._id, order: i + 1 })));
  };

  const handleDragEnd = () => {
    draggedId.current = null;
    setDragOverId(null);
  };

  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    parent: null as string | null,
    order: 0,
    isActive: true,
  });

  const toggleExpand = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const handleOpenModal = (category?: Category, parentId?: string) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        description: category.description || "",
        parent: category.parent || null,
        order: category.order,
        isActive: category.isActive,
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: "",
        description: "",
        parent: parentId || null,
        order: 0,
        isActive: true,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCategory(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Saving a category is just a category edit again. It used to reprice every
    // product in the subtree and could refund investors, because the category
    // carried the margin percentages — hence the confirm dialog that used to
    // live here. Margin rules are per product now, so nothing here moves money.
    const data = { ...formData };

    if (editingCategory) {
      update({ id: editingCategory._id, data });
    } else {
      create(data);
    }

    handleCloseModal();
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      remove(id);
    }
  };

  const handleToggleStatus = (id: string) => {
    toggle(id);
  };

  // Helper function to get parent category name
  const getParentName = (parentId: string | null): string => {
    if (!parentId) return "";
    const findCategory = (cats: Category[]): Category | undefined => {
      for (const cat of cats) {
        if (cat._id === parentId) return cat;
        if (cat.children) {
          const found = findCategory(cat.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    const parent = findCategory(categories);
    return parent?.name || "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Category Management</h2>
          <p className="text-sm text-slate-600 mt-1">
            Manage your product categories (3 levels: Category → Subcategory → Sub-subcategory)
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex shrink-0 items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          <HiPlus className="w-5 h-5" />
          Add Category
        </button>
      </div>

      {/* Category Tree */}
      {orderedCategories.length === 0 && !isLoading ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
          <HiViewGrid className="w-12 h-12 mx-auto mb-4 text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Categories Yet</h3>
          <p className="text-slate-600 mb-4">Start by creating your first product category</p>
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            <HiPlus className="w-5 h-5" />
            Add First Category
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <HiMenuAlt4 className="w-4 h-4" />
            Drag the <HiMenuAlt4 className="w-3.5 h-3.5 inline" /> handle to reorder top-level categories
            {isReordering && <span className="ml-2 text-orange-500 font-medium">Saving…</span>}
          </p>
          <div className="bg-slate-50 rounded-lg border border-slate-200 divide-y divide-slate-200">
            {orderedCategories.map((category) => (
              <div
                key={category._id}
                draggable
                onDragStart={() => handleDragStart(category._id)}
                onDragOver={(e) => handleDragOver(e, category._id)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className={`transition-all duration-150 ${dragOverId === category._id ? 'ring-2 ring-inset ring-orange-400 bg-orange-50' : ''} ${draggedId.current === category._id ? 'opacity-40' : ''}`}
              >
                <CategoryTreeItem
                  category={category}
                  isExpanded={expandedCategories.has(category._id)}
                  onToggleExpand={toggleExpand}
                  onEdit={handleOpenModal}
                  onDelete={handleDelete}
                  onToggleStatus={handleToggleStatus}
                  onAddChild={handleOpenModal}
                  isDeleting={isDeleting}
                  isToggling={isToggling}
                  expandedCategories={expandedCategories}
                  isDraggable={true}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {editingCategory
                  ? "Edit Category"
                  : formData.parent
                    ? "Add Subcategory"
                    : "Add Category"}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <HiX className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
              {formData.parent && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Adding to:</span> {getParentName(formData.parent)}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder={formData.parent ? "e.g., Smartphones" : "e.g., Electronics"}
                />
                <p className="text-xs text-slate-500 mt-1">
                  {formData.parent ? "Enter the subcategory name" : "Enter the main category name"}
                </p>
              </div>

              {!formData.parent && !editingCategory && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p className="text-sm text-slate-700 mb-2">
                    💡 <span className="font-medium">Tip:</span> After creating a category, you can add subcategories and sub-subcategories by clicking the <HiPlus className="inline w-4 h-4" /> icon.
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Example: Electronics → Audio → Wireless Headphones
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  placeholder="Brief description of this category..."
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-orange-500 rounded focus:ring-2 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-slate-700">Show this category in the navbar</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-2 px-4 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || isUpdating}
                  className="flex-1 py-2 px-4 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:opacity-50"
                >
                  {isCreating || isUpdating ? "Saving..." : editingCategory ? "Update" : formData.parent ? "Add Subcategory" : "Add Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Category Tree Item Component (Recursive for 3 levels)
function CategoryTreeItem({
  category,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onToggleStatus,
  onAddChild,
  isDeleting,
  isToggling,
  expandedCategories,
  isDraggable = false,
  depth = 0,
}: {
  category: Category;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onEdit: (category: Category) => void;
  onDelete: (id: string, name: string) => void;
  onToggleStatus: (id: string) => void;
  onAddChild: (category: undefined, parentId: string) => void;
  isDeleting: boolean;
  isToggling: boolean;
  expandedCategories: Set<string>;
  isDraggable?: boolean;
  depth?: number;
}) {
  const hasChildren = category.children && category.children.length > 0;
  const canAddChildren = category.level < 2; // Can add children if level is 0 or 1

  // Level labels
  const getLevelLabel = (level: number) => {
    switch (level) {
      case 0: return "Category";
      case 1: return "Subcategory";
      case 2: return "Sub-subcategory";
      default: return "";
    }
  };

  const getLevelColor = (level: number) => {
    switch (level) {
      case 0: return "bg-purple-100 text-purple-700";
      case 1: return "bg-blue-100 text-blue-700";
      case 2: return "bg-green-100 text-green-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div>
      <div className={`flex flex-wrap items-center gap-3 p-3 sm:p-4 hover:bg-white transition-colors ${depth > 0 ? 'pl-' + (4 + depth * 8) : ''}`}>
        {/* Drag handle — only on top-level rows */}
        {isDraggable && depth === 0 ? (
          <span
            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 p-1"
            title="Drag to reorder"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <HiMenuAlt4 className="w-4 h-4" />
          </span>
        ) : (
          depth === 0 && <span className="w-6 flex-shrink-0" />
        )}

        {/* Expand/Collapse Button */}
        <button
          onClick={() => onToggleExpand(category._id)}
          className={`p-1 rounded hover:bg-slate-200 transition-colors ${!hasChildren && "invisible"}`}
        >
          {isExpanded ? (
            <HiChevronDown className="w-4 h-4 text-slate-600" />
          ) : (
            <HiChevronRight className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Category Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900">{category.name}</span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${category.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
              {category.isActive ? "Active" : "Inactive"}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${getLevelColor(category.level)}`}>
              {getLevelLabel(category.level)}
            </span>
          </div>
          {category.description && (
            <p className="text-sm text-slate-600 mt-1">{category.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex basis-full items-center justify-end gap-1 sm:basis-auto">
          {canAddChildren && (
            <button
              onClick={() => onAddChild(undefined, category._id)}
              className="p-2 text-slate-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
              title={`Add ${category.level === 0 ? 'subcategory' : 'sub-subcategory'}`}
            >
              <HiPlus className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onEdit(category)}
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit"
          >
            <HiPencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToggleStatus(category._id)}
            disabled={isToggling}
            className="px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded transition-colors disabled:opacity-50"
            title="Toggle status"
          >
            {category.isActive ? "Hide" : "Show"}
          </button>
          <button
            onClick={() => onDelete(category._id, category.name)}
            disabled={isDeleting}
            className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            title="Delete"
          >
            <HiTrash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Children (Recursive) */}
      {hasChildren && isExpanded && (
        <div className={`border-l-2 border-slate-300 ${depth === 0 ? 'ml-6' : 'ml-4'}`}>
          {category.children!.map((child: any) => (
            <CategoryTreeItem
              key={child._id}
              category={child}
              isExpanded={expandedCategories.has(child._id)}
              onToggleExpand={onToggleExpand}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleStatus={onToggleStatus}
              onAddChild={onAddChild}
              isDeleting={isDeleting}
              isToggling={isToggling}
              expandedCategories={expandedCategories}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
