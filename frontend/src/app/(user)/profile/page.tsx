"use client";

import { useState, useEffect } from "react";
import { HiUser, HiLocationMarker, HiClipboardList, HiMail, HiPhone, HiPencil, HiTrash, HiPlus, HiCheckCircle, HiClock, HiTruck, HiX } from "react-icons/hi";
import { toast } from "sonner";
import LoadingButton from "@/components/ui/loadingButton";
import { clearSession, refreshSession } from "@/lib/auth/client";

interface Address {
  _id: string;
  name: string;
  phoneNo: number;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: number;
  addressType: "home" | "work" | "other";
  isDefault: boolean;
}

interface User {
  _id: string;
  name: string;
  email: string;
  gender: string;
  role: string;
  avatar?: {
    url: string;
  };
  addresses: Address[];
}

interface Order {
  _id: string;
  orderItems: any[];
  totalPrice: number;
  orderStatus: string;
  paymentInfo: {
    id: string;
    status: string;
  };
  createdAt: string;
  shippedAt?: string;
  deliveredAt?: string;
}

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<"profile" | "addresses" | "orders">("profile");
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAddressUpdating, setIsAddressUpdating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    gender: "",
  });
  const [addressFormData, setAddressFormData] = useState({
    name: "",
    phoneNo: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    addressType: "home" as "home" | "work" | "other",
    isDefault: false,
  });

  useEffect(() => {
    fetchUserData();
    fetchOrders();
  }, []);

  const fetchUserData = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'}/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      const data = await response.json();
      // Don't swallow !success: a 401 (no/expired token) used to leave `user`
      // null with no toast and no reason, which renders as a bare
      // "Failed to load profile" that looks identical to the backend being down.
      if (!data.success) {
        // The server rejected our token, so the stored session is dead. Purge
        // it here too, otherwise the navbar keeps rendering the stale user
        // while this page says the session is invalid.
        clearSession();
        throw new Error(data.message || "Failed to load profile");
      }

      setUser(data.user);
      setFormData({
        name: data.user.name,
        email: data.user.email,
        gender: data.user.gender,
      });
    } catch (error) {
      console.error("Error fetching user data:", error);
      setLoadError(error instanceof Error ? error.message : "Failed to load profile");
      toast.error(error instanceof Error ? error.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'}/orders/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      const data = await response.json();
      if (data.success) {
        setOrders(data.orders);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    }
  };

  const handleUpdateProfile = async () => {
    setIsUpdating(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'}/me/update`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Profile updated successfully");
        setEditMode(false);
        fetchUserData();
        refreshSession(); // so the navbar picks up the new name/email
      } else {
        toast.error(data.message || "Failed to update profile");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddAddress = async () => {
    setIsAddressUpdating(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'}/me/addresses/new`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          ...addressFormData,
          phoneNo: parseInt(addressFormData.phoneNo),
          pincode: parseInt(addressFormData.pincode),
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Address added successfully");
        setShowAddressForm(false);
        resetAddressForm();
        fetchUserData();
      } else {
        toast.error(data.message || "Failed to add address");
      }
    } catch (error) {
      console.error("Error adding address:", error);
      toast.error("Failed to add address");
    } finally {
      setIsAddressUpdating(false);
    }
  };

  const handleUpdateAddress = async () => {
    if (!editingAddress) return;
    setIsAddressUpdating(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'}/me/addresses/${editingAddress._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          ...addressFormData,
          phoneNo: parseInt(addressFormData.phoneNo),
          pincode: parseInt(addressFormData.pincode),
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Address updated successfully");
        setEditingAddress(null);
        setShowAddressForm(false);
        resetAddressForm();
        fetchUserData();
      } else {
        toast.error(data.message || "Failed to update address");
      }
    } catch (error) {
      console.error("Error updating address:", error);
      toast.error("Failed to update address");
    } finally {
      setIsAddressUpdating(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm("Are you sure you want to delete this address?")) return;

    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'}/me/addresses/${addressId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Address deleted successfully");
        fetchUserData();
      } else {
        toast.error(data.message || "Failed to delete address");
      }
    } catch (error) {
      console.error("Error deleting address:", error);
      toast.error("Failed to delete address");
    }
  };

  const handleSetDefaultAddress = async (addressId: string) => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'}/me/addresses/${addressId}/default`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Default address updated");
        fetchUserData();
      } else {
        toast.error(data.message || "Failed to update default address");
      }
    } catch (error) {
      console.error("Error setting default address:", error);
      toast.error("Failed to update default address");
    }
  };

  const resetAddressForm = () => {
    setAddressFormData({
      name: "",
      phoneNo: "",
      address: "",
      city: "",
      state: "",
      pincode: "",
      addressType: "home",
      isDefault: false,
    });
  };

  const openEditAddress = (address: Address) => {
    setEditingAddress(address);
    setAddressFormData({
      name: address.name,
      phoneNo: address.phoneNo.toString(),
      address: address.address,
      city: address.city,
      state: address.state,
      pincode: address.pincode.toString(),
      addressType: address.addressType,
      isDefault: address.isDefault,
    });
    setShowAddressForm(true);
  };

  const getOrderStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      Processing: "bg-yellow-100 text-yellow-800",
      Packing: "bg-blue-100 text-blue-800",
      Dispatched: "bg-purple-100 text-purple-800",
      Shipped: "bg-indigo-100 text-indigo-800",
      Delivered: "bg-green-100 text-green-800",
      Cancelled: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // "jwt malformed" / "Please Login to Access" are auth failures, not load
    // failures — they mean there is no usable session, so offer login rather
    // than a retry that would fail identically.
    const isAuthError = /login|jwt|token|expired|unauthor/i.test(loadError || "");
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-500">
            {isAuthError ? "Your session has expired. Please log in again." : loadError || "Failed to load profile"}
          </p>
          {isAuthError ? (
            <a
              href="/login"
              className="inline-block mt-4 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
            >
              Log in
            </a>
          ) : (
            <button
              onClick={() => { setLoading(true); setLoadError(null); fetchUserData(); fetchOrders(); }}
              className="mt-4 px-6 py-3 border-2 border-orange-500 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors font-medium"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">My Account</h1>
          <p className="text-slate-600">Manage your profile, addresses, and orders</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-6">
          <div className="flex border-b border-slate-200 overflow-x-auto">
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-1.5 px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === "profile"
                  ? "text-orange-500 border-b-2 border-orange-500"
                  : "text-slate-600 hover:text-slate-900"
                }`}
            >
              <HiUser className="w-4 h-4" />
              Profile
            </button>
            <button
              onClick={() => setActiveTab("addresses")}
              className={`flex items-center gap-1.5 px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === "addresses"
                  ? "text-orange-500 border-b-2 border-orange-500"
                  : "text-slate-600 hover:text-slate-900"
                }`}
            >
              <HiLocationMarker className="w-4 h-4" />
              Addresses
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`flex items-center gap-1.5 px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === "orders"
                  ? "text-orange-500 border-b-2 border-orange-500"
                  : "text-slate-600 hover:text-slate-900"
                }`}
            >
              <HiClipboardList className="w-4 h-4" />
              Orders ({orders.length})
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div>
          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Personal Information</h2>
                <button
                  onClick={() => setEditMode(!editMode)}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors"
                >
                  <HiPencil className="w-4 h-4" />
                  {editMode ? "Cancel" : "Edit"}
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!editMode}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={!editMode}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    disabled={!editMode}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-60"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {editMode && (
                  <div className="flex gap-3">
                    <LoadingButton
                      loading={isUpdating}
                      onClick={handleUpdateProfile}
                      className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-medium"
                    >
                      Save Changes
                    </LoadingButton>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Addresses Tab */}
          {activeTab === "addresses" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Saved Addresses</h2>
                <button
                  onClick={() => {
                    resetAddressForm();
                    setEditingAddress(null);
                    setShowAddressForm(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                  <HiPlus className="w-4 h-4" />
                  Add New Address
                </button>
              </div>

              {/* Address Form Modal */}
              {showAddressForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                  <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-slate-900">
                        {editingAddress ? "Edit Address" : "Add New Address"}
                      </h3>
                      <button
                        onClick={() => {
                          setShowAddressForm(false);
                          setEditingAddress(null);
                          resetAddressForm();
                        }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <HiX className="w-6 h-6" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Full Name *</label>
                        <input
                          type="text"
                          value={addressFormData.name}
                          onChange={(e) => setAddressFormData({ ...addressFormData, name: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number *</label>
                        <input
                          type="tel"
                          value={addressFormData.phoneNo}
                          onChange={(e) => setAddressFormData({ ...addressFormData, phoneNo: e.target.value })}
                          maxLength={10}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Address *</label>
                        <textarea
                          value={addressFormData.address}
                          onChange={(e) => setAddressFormData({ ...addressFormData, address: e.target.value })}
                          rows={3}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">City *</label>
                          <input
                            type="text"
                            value={addressFormData.city}
                            onChange={(e) => setAddressFormData({ ...addressFormData, city: e.target.value })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">PIN Code *</label>
                          <input
                            type="text"
                            value={addressFormData.pincode}
                            onChange={(e) => setAddressFormData({ ...addressFormData, pincode: e.target.value })}
                            maxLength={6}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">State *</label>
                        <select
                          value={addressFormData.state}
                          onChange={(e) => setAddressFormData({ ...addressFormData, state: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                          required
                        >
                          <option value="">Select State</option>
                          {INDIAN_STATES.map((state) => (
                            <option key={state} value={state}>{state}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Address Type *</label>
                        <div className="flex gap-3">
                          {["home", "work", "other"].map((type) => (
                            <label
                              key={type}
                              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-xl cursor-pointer transition-all ${addressFormData.addressType === type
                                  ? "border-orange-500 bg-orange-50 text-orange-700"
                                  : "border-slate-200 hover:border-slate-300"
                                }`}
                            >
                              <input
                                type="radio"
                                name="addressType"
                                value={type}
                                checked={addressFormData.addressType === type}
                                onChange={(e) => setAddressFormData({ ...addressFormData, addressType: e.target.value as "home" | "work" | "other" })}
                                className="sr-only"
                              />
                              <span className="font-medium capitalize">{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={addressFormData.isDefault}
                          onChange={(e) => setAddressFormData({ ...addressFormData, isDefault: e.target.checked })}
                          className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
                        />
                        <label className="text-sm text-slate-700">Set as default address</label>
                      </div>

                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => {
                            setShowAddressForm(false);
                            setEditingAddress(null);
                            resetAddressForm();
                          }}
                          className="flex-1 px-6 py-3 border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium"
                        >
                          Cancel
                        </button>
                        <LoadingButton
                          loading={isAddressUpdating}
                          onClick={editingAddress ? handleUpdateAddress : handleAddAddress}
                          className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-medium"
                        >
                          {editingAddress ? "Update Address" : "Save Address"}
                        </LoadingButton>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Address List */}
              {user.addresses && user.addresses.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {user.addresses.map((address) => (
                    <div
                      key={address._id}
                      className={`bg-white rounded-xl shadow-sm border-2 p-6 transition-all ${address.isDefault ? "border-orange-500" : "border-slate-200"
                        }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium capitalize">
                            {address.addressType}
                          </span>
                          {address.isDefault && (
                            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditAddress(address)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <HiPencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteAddress(address._id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <HiTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="font-semibold text-slate-900">{address.name}</p>
                        <p className="text-sm text-slate-600">{address.address}</p>
                        <p className="text-sm text-slate-600">
                          {address.city}, {address.state} - {address.pincode}
                        </p>
                        <p className="text-sm text-slate-600">Phone: {address.phoneNo}</p>
                      </div>

                      {!address.isDefault && (
                        <button
                          onClick={() => handleSetDefaultAddress(address._id)}
                          className="mt-4 w-full px-4 py-2 border-2 border-orange-500 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors font-medium text-sm"
                        >
                          Set as Default
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                  <HiLocationMarker className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">No addresses saved</h3>
                  <p className="text-slate-600 mb-6">Add your first address to make checkout faster</p>
                </div>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === "orders" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900">Order History</h2>

              {orders.length > 0 ? (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order._id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-sm text-slate-600 mb-1">Order #{order._id.slice(-8).toUpperCase()}</p>
                          <p className="text-sm text-slate-500">
                            {new Date(order.createdAt).toLocaleDateString("en-IN", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getOrderStatusColor(order.orderStatus)}`}>
                            {order.orderStatus}
                          </span>
                          <p className="text-lg font-bold text-slate-900 mt-2">
                            ₹{order.totalPrice.toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium text-slate-700">Payment Status</p>
                          <p className="text-sm text-slate-900">{order.paymentInfo.status}</p>
                        </div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium text-slate-700">Items</p>
                          <p className="text-sm text-slate-900">{order.orderItems.length} item(s)</p>
                        </div>
                        <a
                          href={`/orders/${order._id}`}
                          className="mt-4 w-full inline-block text-center px-4 py-2 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors font-medium text-sm"
                        >
                          View Details
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                  <HiClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">No orders yet</h3>
                  <p className="text-slate-600 mb-6">Start shopping to see your orders here</p>
                  <a
                    href="/search"
                    className="inline-block px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
                  >
                    Browse Products
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
