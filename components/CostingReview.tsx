import React, { useState } from 'react';
import { DollarSign, Save, CheckCircle, X, AlertCircle, Loader } from 'lucide-react';

interface LeadItem {
  id: string;
  name: string;
  price: number;
  baseCost?: number;
  costOverrideReason?: string;
  estimatedHours?: number;
  costStatus?: 'pending' | 'reviewed' | 'approved';
  quantity?: number;
}

interface CostingReviewProps {
  leadId: string;
  items: LeadItem[];
  onSave: (items: any[]) => Promise<void>;
  onReview: (approvedBy: string, comment: string) => Promise<void>;
  onClose: () => void;
  currentUserId: string;
  canApproveCosting: boolean;
}

export const CostingReview: React.FC<CostingReviewProps> = ({
  leadId,
  items,
  onSave,
  onReview,
  onClose,
  currentUserId,
  canApproveCosting
}) => {
  const [editedItems, setEditedItems] = useState<LeadItem[]>(items);
  const [reviewComment, setReviewComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleItemChange = (id: string, field: string, value: any) => {
    setEditedItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleSave = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      await onSave(editedItems);
      setSuccessMessage('Changes saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to save changes';
      setErrorMessage(errorMsg);
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReview = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsApproving(true);
    try {
      await onReview(currentUserId, reviewComment);
      setSuccessMessage('Costing approved successfully');
      setTimeout(() => {
        setShowReviewConfirm(false);
        onClose();
      }, 2000);
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to approve costing';
      setErrorMessage(errorMsg);
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsApproving(false);
    }
  };

  const calculateMargin = (price: number, baseCost?: number) => {
    if (!baseCost && baseCost !== 0) return null;
    return price - baseCost;
  };

  const calculateMarginPercent = (price: number, baseCost?: number) => {
    if (!baseCost && baseCost !== 0 || price === 0) return null;
    return ((price - baseCost) / price) * 100;
  };

  const totalPrice = editedItems.reduce((sum, item) => sum + (item.price || 0), 0);
  const totalBaseCost = editedItems.reduce((sum, item) => sum + (item.baseCost || 0), 0);
  const totalMargin = totalPrice - totalBaseCost;
  const totalMarginPercent = totalPrice > 0 ? (totalMargin / totalPrice) * 100 : 0;
  const allApproved = editedItems.every(item => item.costStatus === 'approved');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <DollarSign size={20} /> Costing Review
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={isSaving || isApproving}>
            <X size={20} />
          </button>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Error</p>
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700">{successMessage}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Item Name</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700 text-xs">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Sale Price</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Base Cost</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Margin</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {editedItems.map(item => {
                  const margin = calculateMargin(item.price, item.baseCost);
                  const marginPercent = calculateMarginPercent(item.price, item.baseCost);
                  const isOverride = item.baseCost !== undefined && item.baseCost > 0;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {item.name}
                        {item.costOverrideReason && (
                          <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                            <AlertCircle size={12} /> {item.costOverrideReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600 bg-blue-50">
                        <span className="text-xs text-blue-700 font-medium">{item.quantity || 1}</span>
                        <div className="text-[10px] text-blue-600">desde Quote</div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        ${item.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={isSaving || isApproving}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right disabled:bg-gray-100 disabled:cursor-not-allowed"
                          value={item.baseCost ?? ''}
                          onChange={e => handleItemChange(item.id, 'baseCost', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="—"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {margin !== null ? (
                          <div>
                            <div className="font-medium text-gray-900">
                              ${margin.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            </div>
                            <div className={`text-xs ${marginPercent !== null && marginPercent >= 30 ? 'text-green-600' : marginPercent !== null && marginPercent >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                              {marginPercent !== null ? marginPercent.toFixed(1) : '—'}%
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          disabled={isSaving || isApproving}
                          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                          value={item.costStatus || 'pending'}
                          onChange={e => handleItemChange(item.id, 'costStatus', e.target.value)}
                        >
                          <option value="pending">Pending</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="approved">Approved</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                <tr className="font-semibold text-gray-900">
                  <td className="px-4 py-3">TOTAL</td>
                  <td className="px-4 py-3 text-right">${totalPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right">${totalBaseCost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-blue-900">${totalMargin.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                    <div className="text-xs text-blue-700">{totalMarginPercent.toFixed(1)}%</div>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Review Section */}
          <div className="border-t pt-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Final Approval</h3>
            <textarea
              placeholder="Add a comment for the approval (optional)"
              disabled={isSaving || isApproving || !canApproveCosting}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              rows={3}
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
            />
            {!canApproveCosting && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle size={16} className="text-amber-600" />
                <span className="text-sm text-amber-700">
                  Only finance/admin users can approve costing
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <CheckCircle size={16} className="text-blue-600" />
              <span className="text-sm text-blue-700">
                {allApproved
                  ? 'All items are approved. Ready to convert to project.'
                  : `${editedItems.filter(i => i.costStatus === 'approved').length}/${editedItems.length} items approved`}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSaving || isApproving}
            className="px-4 py-2 text-gray-600 text-sm hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isApproving}
            className="px-4 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader size={16} className="animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save size={16} /> Save Changes
              </>
            )}
          </button>
          <button
            onClick={() => setShowReviewConfirm(true)}
            disabled={isSaving || isApproving || !allApproved || !canApproveCosting}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            {isApproving ? (
              <>
                <Loader size={16} className="animate-spin" /> Approving...
              </>
            ) : (
              <>
                <CheckCircle size={16} /> Mark as Reviewed
              </>
            )}
          </button>
        </div>

        {/* Confirmation Modal */}
        {showReviewConfirm && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
              <h3 className="font-bold text-gray-900 mb-2">Confirm Final Approval</h3>
              <p className="text-sm text-gray-600 mb-4">
                You are marking all items as approved. This will lock the costing for this lead and allow conversion to a project.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowReviewConfirm(false)}
                  disabled={isApproving}
                  className="px-4 py-2 text-gray-600 text-sm hover:bg-gray-100 rounded disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReview}
                  disabled={isApproving}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-2"
                >
                  {isApproving ? (
                    <>
                      <Loader size={16} className="animate-spin" /> Confirming...
                    </>
                  ) : (
                    'Confirm'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
