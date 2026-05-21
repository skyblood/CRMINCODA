
import React, { useState } from 'react';
import { SKUItem, SKUCategory } from '../types';
import { Plus, Edit2, Trash2, Tag, DollarSign, Search, X, Package, Save, Barcode } from 'lucide-react';

interface SKUManagerProps {
  skus: SKUItem[];
  onAddSKU: (sku: SKUItem) => void;
  onUpdateSKU: (sku: SKUItem) => void;
  onDeleteSKU: (id: string) => void;
}

const SKU_CATEGORIES: { key: SKUCategory; label: string }[] = [
    { key: 'license', label: 'License' },
    { key: 'vendor_support', label: 'Vendor Support' },
    { key: 'incoda_support', label: 'Incoda Support' },
    { key: 'implementation', label: 'Implementation' },
    { key: 'hours_pack', label: 'Hours Pack' },
];

export const SKUManager: React.FC<SKUManagerProps> = ({ skus, onAddSKU, onUpdateSKU, onDeleteSKU }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingSKU, setEditingSKU] = useState<SKUItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const initialFormState = {
    code: '',
    name: '',
    category: 'license' as SKUCategory,
    basePrice: 0,
    description: '',
    suggestedBaseCost: 0,
    costUnit: 'fijo' as 'hora' | 'licencia' | 'fijo',
    costNotes: ''
  };

  const [formData, setFormData] = useState(initialFormState);

  const filteredSKUs = skus.filter(sku => {
      const matchesSearch = sku.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            sku.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            sku.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterCategory === 'all' || sku.category === filterCategory;
      return matchesSearch && matchesFilter;
  });

  const handleOpenAdd = () => {
    setEditingSKU(null);
    setFormData(initialFormState);
    setShowModal(true);
  };

  const handleOpenEdit = (sku: SKUItem) => {
    setEditingSKU(sku);
    setFormData({
      code: sku.code,
      name: sku.name,
      category: sku.category,
      basePrice: sku.basePrice,
      description: sku.description || '',
      suggestedBaseCost: (sku as any).suggestedBaseCost || 0,
      costUnit: (sku as any).costUnit || 'fijo',
      costNotes: (sku as any).costNotes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingSKU) {
      const updated = {
        ...editingSKU,
        code: formData.code,
        name: formData.name,
        category: formData.category,
        basePrice: Number(formData.basePrice),
        description: formData.description,
        suggestedBaseCost: Number(formData.suggestedBaseCost),
        costUnit: formData.costUnit,
        costNotes: formData.costNotes
      } as any;
      onUpdateSKU(updated);
    } else {
      const newSKU: any = {
        id: `sku_${Date.now()}`,
        code: formData.code,
        name: formData.name,
        category: formData.category,
        basePrice: Number(formData.basePrice),
        description: formData.description,
        suggestedBaseCost: Number(formData.suggestedBaseCost),
        costUnit: formData.costUnit,
        costNotes: formData.costNotes
      };
      onAddSKU(newSKU);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
      if(window.confirm('Are you sure you want to delete this product?')) {
          onDeleteSKU(id);
      }
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="text-blue-600" /> Product & Service Catalog
          </h1>
          <p className="text-gray-500 text-sm">Manage standard SKUs and pricing.</p>
        </div>
        <button 
          onClick={handleOpenAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
        >
          <Plus size={18} /> Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-center">
         <div className="relative flex-1 min-w-[200px]">
            <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
            <input 
                type="text" 
                placeholder="Search by Code or Name..." 
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
         <select 
            className="border border-gray-300 rounded-lg p-2 text-sm bg-white"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
         >
             <option value="all">All Categories</option>
             {SKU_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
         </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-y-auto flex-1">
          <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[560px]">
          <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 sticky top-0">
            <tr>
              <th className="px-6 py-4 font-medium">Code</th>
              <th className="px-6 py-4 font-medium">Product Name</th>
              <th className="px-6 py-4 font-medium">Category</th>
              <th className="px-6 py-4 font-medium">Description</th>
              <th className="px-6 py-4 text-right">Base Price</th>
              <th className="px-6 py-4 text-right">Suggested Cost</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredSKUs.map(sku => (
              <tr key={sku.id} className="hover:bg-gray-50 transition group">
                <td className="px-6 py-4 font-mono text-xs font-bold text-gray-600">
                    {sku.code}
                </td>
                <td className="px-6 py-4 font-medium text-gray-900">
                    {sku.name}
                </td>
                <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs border border-gray-200">
                        {SKU_CATEGORIES.find(c => c.key === sku.category)?.label}
                    </span>
                </td>
                <td className="px-6 py-4 text-gray-500 truncate max-w-xs" title={sku.description}>
                    {sku.description || '-'}
                </td>
                <td className="px-6 py-4 text-right font-medium text-gray-900">
                    ${sku.basePrice.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right text-gray-600">
                    {(sku as any).suggestedBaseCost ? `$${Number((sku as any).suggestedBaseCost).toLocaleString()}` : '-'}
                    {(sku as any).costUnit && <span className="text-xs text-gray-400 block">({(sku as any).costUnit})</span>}
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                   <button 
                     onClick={() => handleOpenEdit(sku)}
                     className="text-gray-400 hover:text-blue-600 transition p-1 rounded-md hover:bg-blue-50"
                     title="Edit"
                   >
                     <Edit2 size={16} />
                   </button>
                   <button 
                     onClick={() => handleDelete(sku.id)}
                     className="text-gray-400 hover:text-red-600 transition p-1 rounded-md hover:bg-red-50"
                     title="Delete"
                   >
                     <Trash2 size={16} />
                   </button>
                </td>
              </tr>
            ))}
             {filteredSKUs.length === 0 && (
                 <tr>
                     <td colSpan={7} className="text-center py-8 text-gray-400 italic">No products found.</td>
                 </tr>
             )}
          </tbody>
        </table>
          </div>
        </div>
        </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <h2 className="text-lg font-bold text-gray-900">
                {editingSKU ? 'Edit Product' : 'New Product'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU Code</label>
                  <div className="relative">
                    <Barcode size={16} className="absolute left-3 top-2.5 text-gray-400" />
                    <input 
                        required
                        type="text" 
                        className="w-full border border-gray-300 rounded-lg pl-9 p-2.5 text-sm uppercase"
                        placeholder="e.g. DYN-URL" 
                        value={formData.code}
                        onChange={e => setFormData({...formData, code: e.target.value})}
                    />
                  </div>
               </div>

               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                  <input 
                    required
                    type="text" 
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                    placeholder="e.g. Enterprise License 2024" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select 
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                        value={formData.category}
                        onChange={e => setFormData({...formData, category: e.target.value as SKUCategory})}
                      >
                         {SKU_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Base Price ($)</label>
                      <input 
                        required
                        type="number" 
                        min="0"
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                        placeholder="0.00" 
                        value={formData.basePrice}
                        onChange={e => setFormData({...formData, basePrice: Number(e.target.value)})}
                      />
                   </div>
               </div>

               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                    rows={3}
                    placeholder="Product details, limitations, etc."
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
               </div>

               {/* Costing Section */}
               <div className="border-t pt-4 mt-4">
                 <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                   <DollarSign size={16} /> Costing Information
                 </h3>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Suggested Base Cost ($)</label>
                     <input
                       type="number"
                       min="0"
                       step="0.01"
                       className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                       placeholder="0.00"
                       value={formData.suggestedBaseCost}
                       onChange={e => setFormData({...formData, suggestedBaseCost: Number(e.target.value)})}
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Cost Unit</label>
                     <select
                       className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                       value={formData.costUnit}
                       onChange={e => setFormData({...formData, costUnit: e.target.value as any})}
                     >
                       <option value="fijo">Fixed</option>
                       <option value="hora">Hourly</option>
                       <option value="licencia">License</option>
                     </select>
                   </div>
                 </div>

                 <div className="mt-3">
                   <label className="block text-sm font-medium text-gray-700 mb-1">Cost Notes (Optional)</label>
                   <textarea
                     className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                     rows={2}
                     placeholder="e.g., Hourly rate: $150/hr with 30% overhead"
                     value={formData.costNotes}
                     onChange={e => setFormData({...formData, costNotes: e.target.value})}
                   />
                 </div>
               </div>

               <div className="pt-2 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2">
                    <Save size={16} /> Save Product
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
