"use client";

import { useState, useEffect } from "react";
import { HiSearch, HiX, HiCheck, HiUsers, HiMail, HiPhone, HiLocationMarker, HiCalendar, HiShoppingBag, HiBan, HiCheckCircle } from "react-icons/hi";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

interface Customer {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: string;
  isBlocked: boolean;
  createdAt: string;
  totalOrders: number;
  totalSpent: number;
  addresses?: Array<{
    street: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  }>;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCustomers(customers);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredCustomers(
        customers.filter(
          (customer) =>
            customer.name.toLowerCase().includes(query) ||
            customer.email.toLowerCase().includes(query) ||
            customer.phone?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, customers]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      if (!token) {
        showAlert('error', 'Authentication token not found. Please log in.');
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/admin/users`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch customers');
      }

      const data = await response.json();
      
      // Adapt backend data to frontend Customer interface
      const adaptedCustomers = data.users.map((user: any) => ({
        ...user,
        phone: user.phone || 'N/A',
        isBlocked: user.role === 'disabled',
        totalOrders: user.totalOrders || 0,
        totalSpent: user.totalSpent || 0,
        addresses: user.addresses || [],
      }));

      setCustomers(adaptedCustomers);
      setFilteredCustomers(adaptedCustomers);
    } catch (error: any) {
      showAlert('error', error.message || 'Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const handleViewDetails = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetailsModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailsModal(false);
    setSelectedCustomer(null);
  };

  const toggleBlockStatus = async (customer: Customer) => {
    // This is a mock action as the backend does not support it yet.
    showAlert('success', `This is a mock action. The '${customer.isBlocked ? 'unblock' : 'block'}' feature is not yet implemented in the backend.`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Customers Management</h1>
          <p className="text-slate-600 mt-1">
            Manage your customer base and their information ({customers.length} customers)
          </p>
        </div>
      </div>

      {/* Alert */}
      {alert && (
        <div className={`p-4 rounded-lg border ${alert.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
          } flex items-center gap-3`}>
          {alert.type === 'success' ? (
            <HiCheck className="w-5 h-5 flex-shrink-0" />
          ) : (
            <HiX className="w-5 h-5 flex-shrink-0" />
          )}
          <p>{alert.message}</p>
        </div>
      )}

      {/* Search and Stats */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 sm:gap-6">
        <div className="sm:col-span-2">
          <div className="relative">
            <HiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <HiX className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">Total Customers</p>
              <p className="text-2xl sm:text-3xl font-bold mt-1">{customers.length}</p>
            </div>
            <HiUsers className="w-12 h-12 text-orange-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Active</p>
              <p className="text-2xl sm:text-3xl font-bold mt-1">
                {customers.filter(c => !c.isBlocked).length}
              </p>
            </div>
            <HiCheckCircle className="w-12 h-12 text-green-200" />
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200">
        {filteredCustomers.length === 0 ? (
          <div className="text-center px-4 py-16 sm:py-20">
            <HiUsers className="w-20 h-20 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              {searchQuery ? 'No customers found' : 'No Customers Yet'}
            </h3>
            <p className="text-slate-600">
              {searchQuery ? 'Try adjusting your search query' : 'Customers will appear here once they register'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Orders
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Total Spent
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredCustomers.map((customer) => (
                  <tr key={customer._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-semibold">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{customer.name}</div>
                          <div className="text-sm text-slate-500">{customer.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <HiMail className="w-4 h-4 text-slate-400" />
                          {customer.email}
                        </div>
                        {customer.phone && (
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <HiPhone className="w-4 h-4 text-slate-400" />
                            {customer.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <HiShoppingBag className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-900">{customer.totalOrders}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-900">
                        ₹{customer.totalSpent.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">
                      {new Date(customer.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${customer.isBlocked
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                        }`}>
                        {customer.isBlocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewDetails(customer)}
                          className="px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => toggleBlockStatus(customer)}
                          disabled={actionLoading === customer._id}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${customer.isBlocked
                              ? 'text-green-600 hover:bg-green-50'
                              : 'text-red-600 hover:bg-red-50'
                            } disabled:opacity-50`}
                        >
                          {actionLoading === customer._id ? (
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            customer.isBlocked ? 'Unblock' : 'Block'
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Details Modal */}
      {showDetailsModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Customer Details</h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <HiX className="w-6 h-6 text-slate-600" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              {/* Customer Info */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                <div className="w-20 h-20 flex-shrink-0 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-3xl font-bold">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">{selectedCustomer.name}</h3>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2 text-slate-600 break-all">
                      <HiMail className="w-5 h-5 flex-shrink-0 text-slate-400" />
                      {selectedCustomer.email}
                    </div>
                    {selectedCustomer.phone && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <HiPhone className="w-5 h-5 text-slate-400" />
                        {selectedCustomer.phone}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-slate-600">
                      <HiCalendar className="w-5 h-5 text-slate-400" />
                      Joined {new Date(selectedCustomer.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <span className={`px-4 py-2 rounded-full text-sm font-medium ${selectedCustomer.isBlocked
                    ? 'bg-red-100 text-red-800'
                    : 'bg-green-100 text-green-800'
                  }`}>
                  {selectedCustomer.isBlocked ? 'Blocked' : 'Active'}
                </span>
              </div>

              {/* Stats */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 sm:p-6 border border-orange-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-600 text-sm font-medium">Total Orders</p>
                      <p className="text-2xl sm:text-3xl font-bold text-orange-900 mt-1">
                        {selectedCustomer.totalOrders}
                      </p>
                    </div>
                    <HiShoppingBag className="w-12 h-12 text-orange-300" />
                  </div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 sm:p-6 border border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-600 text-sm font-medium">Total Spent</p>
                      <p className="text-2xl sm:text-3xl font-bold text-green-900 mt-1 break-words">
                        ₹{selectedCustomer.totalSpent.toLocaleString()}
                      </p>
                    </div>
                    <HiCheckCircle className="w-12 h-12 text-green-300" />
                  </div>
                </div>
              </div>

              {/* Addresses */}
              {selectedCustomer.addresses && selectedCustomer.addresses.length > 0 && (
                <div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <HiLocationMarker className="w-5 h-5 text-orange-500" />
                    Saved Addresses
                  </h4>
                  <div className="space-y-3">
                    {selectedCustomer.addresses.map((address, index) => (
                      <div key={index} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <p className="text-slate-900 font-medium">{address.street}</p>
                        <p className="text-slate-600 text-sm mt-1">
                          {address.city}, {address.state} - {address.pincode}
                        </p>
                        <p className="text-slate-600 text-sm">{address.country}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-4 sm:px-6 py-4">
              <button
                onClick={handleCloseModal}
                className="w-full py-3 px-6 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all duration-200 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
