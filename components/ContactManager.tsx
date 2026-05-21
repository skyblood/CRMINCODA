
import React, { useState } from 'react';
import { Contact } from '../types';
import { Users, Plus, Search, Mail, Phone, Briefcase, Building, Edit2, Trash2, X, Save } from 'lucide-react';

interface ContactManagerProps {
  contacts: Contact[];
  onAddContact: (contact: Contact) => void;
  onUpdateContact: (contact: Contact) => void;
  onDeleteContact: (id: string) => void;
}

export const ContactManager: React.FC<ContactManagerProps> = ({ contacts, onAddContact, onUpdateContact, onDeleteContact }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const initialFormState = {
    name: '',
    email: '',
    phone: '',
    role: '',
    companyName: '',
    notes: ''
  };

  const [formData, setFormData] = useState(initialFormState);

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenAdd = () => {
    setEditingContact(null);
    setFormData(initialFormState);
    setShowModal(true);
  };

  const handleOpenEdit = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role,
      companyName: contact.companyName,
      notes: contact.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingContact) {
      onUpdateContact({
        ...editingContact,
        ...formData
      });
    } else {
      const newContact: Contact = {
        id: `cnt_${Date.now()}`,
        ...formData,
        lastContacted: new Date().toISOString()
      };
      onAddContact(newContact);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this contact?')) {
      onDeleteContact(id);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-blue-600" /> Contact Directory
          </h1>
          <p className="text-gray-500 text-sm">Manage your professional network and key stakeholders.</p>
        </div>
        <button 
          onClick={handleOpenAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 shadow-sm"
        >
          <Plus size={18} /> Add Contact
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
         <div className="relative">
            <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
            <input 
                type="text" 
                placeholder="Search by name, company, or email..." 
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
      </div>

      {/* Contact Grid */}
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredContacts.map(contact => (
              <div key={contact.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600 flex items-center justify-center font-bold text-lg border border-blue-50">
                      {contact.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{contact.name}</h3>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Building size={12} /> {contact.companyName}
                      </p>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button onClick={() => handleOpenEdit(contact)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(contact.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex items-center gap-2">
                    <Briefcase size={14} className="text-gray-400" />
                    <span>{contact.role}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail size={14} className="text-gray-400" />
                    <a href={`mailto:${contact.email}`} className="hover:text-blue-600 truncate">{contact.email}</a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-gray-400" />
                    <span>{contact.phone}</span>
                  </div>
                </div>
                
                {contact.notes && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500 italic line-clamp-2">"{contact.notes}"</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Users size={48} className="mb-4 opacity-20" />
            <p>No contacts found.</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <h2 className="text-lg font-bold text-gray-900">
                {editingContact ? 'Edit Contact' : 'New Contact'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                           value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                    <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                           value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Job Title / Role</label>
                    <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                           value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input required type="tel" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                           value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                 </div>
               </div>

               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input required type="email" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                         value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
               </div>

               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" rows={3}
                            value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
               </div>

               <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-2">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 text-sm hover:bg-gray-100 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2">
                    <Save size={16} /> Save Contact
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
