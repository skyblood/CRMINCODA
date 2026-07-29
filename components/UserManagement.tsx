
import React, { useState, useEffect } from 'react';
import { User, UserRole, ModulePermissions } from '../types';
import { Shield, UserPlus, Edit2, Trash2, Mail, User as UserIcon, X, Check, Lock, Unlock, LayoutDashboard } from 'lucide-react';

interface UserManagementProps {
  users: User[];
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({ users, onAddUser, onUpdateUser, onDeleteUser }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const defaultPermissions: ModulePermissions = {
    dashboard: true,
    crm: false,
    projects: false,
    portal: true,
    admin: false,
    finance: false
  };

  const initialFormState = {
    name: '',
    email: '',
    role: 'consultant' as UserRole,
    permissions: defaultPermissions,
    password: ''
  };

  const [formData, setFormData] = useState(initialFormState);

  // Helper to get default permissions based on role
  const getPermissionsForRole = (role: UserRole): ModulePermissions => {
    switch (role) {
      case 'admin':
        return { dashboard: true, crm: true, projects: true, portal: true, admin: true, finance: true };
      case 'sales':
        return { dashboard: true, crm: true, projects: false, portal: false, admin: false, finance: false };
      case 'consultant':
        return { dashboard: false, crm: false, projects: false, portal: true, admin: false, finance: false }; // No dashboard for consultants
      default:
        return defaultPermissions;
    }
  };

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData(initialFormState);
    setShowModal(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      password: ''
    });
    setShowModal(true);
  };

  const handleRoleChange = (role: UserRole) => {
    // Auto-update permissions when role changes, but allow manual override later
    setFormData({
      ...formData,
      role,
      permissions: getPermissionsForRole(role)
    });
  };

  const togglePermission = (key: keyof ModulePermissions) => {
    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        [key]: !formData.permissions[key]
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingUser) {
      const updated: any = {
        ...editingUser,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        permissions: formData.permissions
      };
      if (formData.password) updated.password = formData.password;
      onUpdateUser(updated);
    } else {
      const newUser: any = {
        id: `usr_${Date.now()}`,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        permissions: formData.permissions,
        password: formData.password
      };
      onAddUser(newUser);
    }
    setShowModal(false);
  };

  const handleDelete = (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      onDeleteUser(userId);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold border border-purple-200">Administrator</span>;
      case 'sales':
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200">Sales</span>;
      case 'consultant':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200">Consultant</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 text-sm">Manage system access, roles, and granular permissions.</p>
        </div>
        <button 
          onClick={handleOpenAdd}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition flex items-center gap-2"
        >
          <UserPlus size={18} /> Add User
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[560px]">
          <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 font-medium">User</th>
              <th className="px-6 py-4 font-medium">Role</th>
              <th className="px-6 py-4 font-medium">Custom Access</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 transition">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-sm">
                       {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{user.name}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1">
                        <Mail size={12} /> {user.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {getRoleBadge(user.role)}
                </td>
                <td className="px-6 py-4">
                   <div className="flex gap-2 flex-wrap">
                      {user.permissions.dashboard && <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200">Dash</span>}
                      {user.permissions.crm && <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200">CRM</span>}
                      {user.permissions.projects && <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200">Projects</span>}
                      {user.permissions.portal && <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200">Portal</span>}
                      {user.permissions.admin && <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200">Admin</span>}
                   </div>
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                   <button 
                     onClick={() => handleOpenEdit(user)}
                     className="text-gray-400 hover:text-blue-600 transition p-1 rounded-md hover:bg-blue-50"
                     title="Edit User"
                   >
                     <Edit2 size={16} />
                   </button>
                   <button 
                     onClick={() => handleDelete(user.id)}
                     className="text-gray-400 hover:text-red-600 transition p-1 rounded-md hover:bg-red-50"
                     title="Delete User"
                   >
                     <Trash2 size={16} />
                   </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <h2 className="text-lg font-bold text-gray-900">
                {editingUser ? 'Edit User & Permissions' : 'Add New User'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <div className="relative">
                       <UserIcon size={16} className="absolute left-3 top-3 text-gray-400" />
                       <input 
                         required
                         type="text" 
                         className="w-full border border-gray-300 rounded-lg pl-9 p-2.5 text-sm"
                         placeholder="e.g. John Doe" 
                         value={formData.name}
                         onChange={e => setFormData({...formData, name: e.target.value})}
                       />
                    </div>
                 </div>
                 
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <div className="relative">
                       <Mail size={16} className="absolute left-3 top-3 text-gray-400" />
                       <input 
                         required
                         type="email" 
                         className="w-full border border-gray-300 rounded-lg pl-9 p-2.5 text-sm"
                         placeholder="email@company.com" 
                         value={formData.email}
                         onChange={e => setFormData({...formData, email: e.target.value})}
                       />
                    </div>
                 </div>
               </div>

               <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {editingUser ? 'New Password (leave blank to keep unchanged)' : 'Password'}
                  </label>
                  <div className="relative">
                     <Lock size={16} className="absolute left-3 top-3 text-gray-400" />
                     <input
                       type="password"
                       required={!editingUser}
                       minLength={4}
                       className="w-full border border-gray-300 rounded-lg pl-9 p-2.5 text-sm"
                       placeholder={editingUser ? 'New password (optional)' : 'Minimum 4 characters'}
                       value={formData.password}
                       onChange={e => setFormData({...formData, password: e.target.value})}
                     />
                  </div>
               </div>

               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base Role</label>
                  <div className="relative">
                     <Shield size={16} className="absolute left-3 top-3 text-gray-400" />
                     <select 
                       className="w-full border border-gray-300 rounded-lg pl-9 p-2.5 text-sm appearance-none bg-white"
                       value={formData.role}
                       onChange={e => handleRoleChange(e.target.value as UserRole)}
                     >
                       <option value="consultant">Consultant</option>
                       <option value="sales">Sales Representative</option>
                       <option value="admin">Administrator</option>
                     </select>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Selecting a role sets default permissions, but you can customize them below.</p>
               </div>

               {/* Granular Permissions */}
               <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <Lock size={14} /> Module Access Control
                  </h3>
                  <div className="space-y-3">
                    
                    {/* Dashboard Permission (New) */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-700">Dashboard</span>
                        <span className="text-xs text-gray-500">Access to main KPI dashboard.</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => togglePermission('dashboard')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.permissions.dashboard ? 'bg-blue-600' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${formData.permissions.dashboard ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    {/* CRM Permission */}
                    <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-700">CRM & Sales</span>
                        <span className="text-xs text-gray-500">View pipeline, leads, and sales reports.</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => togglePermission('crm')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.permissions.crm ? 'bg-blue-600' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${formData.permissions.crm ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    {/* Project Manager Permission */}
                    <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-700">Project Manager</span>
                        <span className="text-xs text-gray-500">Manage all projects, tasks, and budgets.</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => togglePermission('projects')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.permissions.projects ? 'bg-blue-600' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${formData.permissions.projects ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    {/* Consultant Portal Permission */}
                    <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-700">Consultant Portal</span>
                        <span className="text-xs text-gray-500">Access personal tasks and log time.</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => togglePermission('portal')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.permissions.portal ? 'bg-blue-600' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${formData.permissions.portal ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    {/* Admin Permission */}
                    <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-700">System Admin</span>
                        <span className="text-xs text-gray-500">Manage users and settings.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => togglePermission('admin')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.permissions.admin ? 'bg-blue-600' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${formData.permissions.admin ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    {/* Finance / Ledger Permission */}
                    <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-700">Finance / Ledger</span>
                        <span className="text-xs text-gray-500">Access accounting ledger and financial statements.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => togglePermission('finance')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.permissions.finance ? 'bg-blue-600' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${formData.permissions.finance ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                  </div>
               </div>

               <div className="pt-2 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2">
                    <Check size={16} /> Save Changes
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
