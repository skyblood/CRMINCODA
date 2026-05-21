/**
 * Costing System Documentation & Guide
 * ─────────────────────────────────────────────────────────────────────────
 * Interactive guide for using the costing review feature in the CRM.
 * Includes workflows, validation rules, role permissions, and examples.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, DollarSign, CheckCircle, AlertCircle, Lock, TrendingUp, TrendingDown, AlertTriangle, BookOpen, Zap } from 'lucide-react';

export const CostingSystemGuide: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [expandedSection, setExpandedSection] = useState<string | null>('overview');

  const Section = ({ id, title, icon: Icon, children }: { id: string; title: string; icon: any; children: React.ReactNode }) => {
    const isExpanded = expandedSection === id;
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setExpandedSection(isExpanded ? null : id)}
          className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition"
        >
          <div className="flex items-center gap-3">
            <Icon size={20} className="text-blue-600" />
            <h3 className="font-semibold text-gray-900">{title}</h3>
          </div>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {isExpanded && <div className="p-4 bg-white space-y-4">{children}</div>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen size={28} />
            <div>
              <h1 className="text-2xl font-bold">Costing System Guide</h1>
              <p className="text-blue-100 text-sm">Complete documentation for cost review & approval workflow</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-blue-100 hover:text-white text-2xl">
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* SECTION 1: Overview */}
          <Section id="overview" title="What is the Costing System?" icon={DollarSign}>
            <p className="text-gray-600 leading-relaxed">
              The costing system provides real-time visibility into deal profitability before committing to a project. Finance reviews all item costs, approves the deal, and prevents margin losses from underpriced proposals.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="font-semibold text-gray-900">Problem it solves:</p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>✗ Sales quotes aggressively without cost validation</li>
                <li>✗ Finance discovers margin losses after project kickoff</li>
                <li>✗ Renegotiations are expensive and damage relationships</li>
                <li>✓ Costing review catches issues in Proposal stage</li>
              </ul>
            </div>
          </Section>

          {/* SECTION 2: How to Use */}
          <Section id="howto" title="How to Review Costs" icon={Zap}>
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-gray-900 mb-2">Step 1: Open the Lead</p>
                <p className="text-sm text-gray-600">Navigate to Pipeline view and click on a lead in Proposal stage.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-2">Step 2: Click "Review Costs"</p>
                <p className="text-sm text-gray-600">Opens the Costing Review modal showing all items with sale prices.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-2">Step 3: Enter Base Costs</p>
                <p className="text-sm text-gray-600">For each item, enter the internal cost (labor, materials, overhead). Margin recalculates automatically.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-2">Step 4: Review Margins</p>
                <p className="text-sm text-gray-600">Check if margins are healthy (30%+), thin (15-30%), or losses (&lt;15%).</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-2">Step 5: Approve or Hold</p>
                <p className="text-sm text-gray-600">If healthy, click "Mark as Reviewed". If problems, add comment and negotiate new pricing.</p>
              </div>
            </div>
          </Section>

          {/* SECTION 3: Margin Interpretation */}
          <Section id="margins" title="Understanding Margins" icon={TrendingUp}>
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="font-semibold text-green-900 flex items-center gap-2">
                  <CheckCircle size={18} /> Healthy Margin: 30% or higher
                </p>
                <p className="text-sm text-green-700 mt-1">Low risk. Covers overhead, provides profit buffer.</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="font-semibold text-amber-900 flex items-center gap-2">
                  <AlertCircle size={18} /> Thin Margin: 15-30%
                </p>
                <p className="text-sm text-amber-700 mt-1">Acceptable but risky. Monitor execution closely. Any scope creep erodes profit.</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="font-semibold text-red-900 flex items-center gap-2">
                  <AlertTriangle size={18} /> Loss Deal: Below 15% or negative
                </p>
                <p className="text-sm text-red-700 mt-1">HOLD. Renegotiate pricing with sales or defer work. Do not approve.</p>
              </div>
            </div>
          </Section>

          {/* SECTION 4: Roles & Permissions */}
          <Section id="roles" title="Who Can Do What?" icon={Lock}>
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Role</th>
                      <th className="px-3 py-2 text-center">View Modal</th>
                      <th className="px-3 py-2 text-center">Edit Costs</th>
                      <th className="px-3 py-2 text-center">Approve</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-3 py-2 font-medium">Admin / Finance</td>
                      <td className="px-3 py-2 text-center">✅</td>
                      <td className="px-3 py-2 text-center">✅</td>
                      <td className="px-3 py-2 text-center">✅</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Sales</td>
                      <td className="px-3 py-2 text-center">✅</td>
                      <td className="px-3 py-2 text-center">❌</td>
                      <td className="px-3 py-2 text-center">❌</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Consultant</td>
                      <td className="px-3 py-2 text-center">✅</td>
                      <td className="px-3 py-2 text-center">❌</td>
                      <td className="px-3 py-2 text-center">❌</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mt-2">Only users with Admin role or explicit approval permission can approve costing.</p>
            </div>
          </Section>

          {/* SECTION 5: Validation Rules */}
          <Section id="validation" title="Validation Rules & Error Messages" icon={AlertCircle}>
            <div className="space-y-3 text-sm">
              <div className="border-l-4 border-red-400 bg-red-50 p-3 rounded">
                <p className="font-semibold text-red-900">Base Cost Out of Range</p>
                <p className="text-red-700">❌ "baseCost must be between 0 and 100,000"</p>
                <p className="text-xs text-red-600 mt-1">Enter a valid cost between $0 and $100,000</p>
              </div>
              <div className="border-l-4 border-red-400 bg-red-50 p-3 rounded">
                <p className="font-semibold text-red-900">Invalid Cost Status</p>
                <p className="text-red-700">❌ "costStatus must be one of: pending, reviewed, approved"</p>
                <p className="text-xs text-red-600 mt-1">Select Pending, Reviewed, or Approved from dropdown</p>
              </div>
              <div className="border-l-4 border-red-400 bg-red-50 p-3 rounded">
                <p className="font-semibold text-red-900">Permission Denied</p>
                <p className="text-red-700">❌ "User does not have permission to approve costing"</p>
                <p className="text-xs text-red-600 mt-1">Only Finance/Admin can approve. Contact your finance manager.</p>
              </div>
              <div className="border-l-4 border-red-400 bg-red-50 p-3 rounded">
                <p className="font-semibold text-red-900">Item Not Found</p>
                <p className="text-red-700">❌ "Item not found in this lead"</p>
                <p className="text-xs text-red-600 mt-1">The item ID doesn't match. Reload and try again.</p>
              </div>
            </div>
          </Section>

          {/* SECTION 6: Examples */}
          <Section id="examples" title="Real-World Examples" icon={TrendingDown}>
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-gray-900 mb-2">Example 1: Healthy Deal ✅</p>
                <div className="bg-gray-50 p-3 rounded text-sm space-y-1 font-mono">
                  <p>Company: Acme Corp</p>
                  <p>Item: Implementation Services</p>
                  <p className="text-blue-600">Sale Price: $50,000</p>
                  <p className="text-orange-600">Base Cost: $30,000</p>
                  <p className="text-green-600 font-bold">Margin: $20,000 (40%)</p>
                  <p className="text-green-700">✓ Action: APPROVE — Healthy margin provides buffer</p>
                </div>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-2">Example 2: Thin Margin ⚠️</p>
                <div className="bg-gray-50 p-3 rounded text-sm space-y-1 font-mono">
                  <p>Company: GlobalTech</p>
                  <p>Item: Annual Support</p>
                  <p className="text-blue-600">Sale Price: $40,000</p>
                  <p className="text-orange-600">Base Cost: $34,000</p>
                  <p className="text-amber-600 font-bold">Margin: $6,000 (15%)</p>
                  <p className="text-amber-700">⚠️ Action: APPROVE with comment "Monitor execution closely"</p>
                </div>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-2">Example 3: Loss Deal 🚫</p>
                <div className="bg-gray-50 p-3 rounded text-sm space-y-1 font-mono">
                  <p>Company: TechStartup</p>
                  <p>Item: Development Phase 1 + 2</p>
                  <p className="text-blue-600">Sale Price: $150,000</p>
                  <p className="text-orange-600">Base Cost: $170,000</p>
                  <p className="text-red-600 font-bold">Margin: -$20,000 (-13.3%)</p>
                  <p className="text-red-700">❌ Action: HOLD — Add comment "Renegotiate or defer Phase 2"</p>
                </div>
              </div>
            </div>
          </Section>

          {/* SECTION 7: FAQ */}
          <Section id="faq" title="Frequently Asked Questions" icon={BookOpen}>
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-semibold text-gray-900">Q: Can I change costs after approval?</p>
                <p className="text-gray-600 mt-1">A: Yes. Reopen the modal, edit costs, and save. You can approve again if needed.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Q: What happens if I don't approve?</p>
                <p className="text-gray-600 mt-1">A: Lead stays in Proposal stage. You cannot convert to a project until approved.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Q: Who sees the approval comment?</p>
                <p className="text-gray-600 mt-1">A: It's stored on the lead and visible to anyone with access to the lead details.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Q: Can consultants see costs?</p>
                <p className="text-gray-600 mt-1">A: Yes, they can view the modal in read-only mode. They cannot edit or approve.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Q: What if the cost changes during execution?</p>
                <p className="text-gray-600 mt-1">A: Time logs capture the consultant's hourly rate at the moment they're logged. Historical costs remain unchanged.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Q: How do I renegotiate a deal?</p>
                <p className="text-gray-600 mt-1">A: Add comment "Renegotiating with customer", hold approval, contact sales, then update costs when pricing confirmed.</p>
              </div>
            </div>
          </Section>

          {/* SECTION 8: Best Practices */}
          <Section id="bestpractices" title="Best Practices" icon={CheckCircle}>
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>
                  <strong>Review all items.</strong> Don't leave any item without a base cost. Use market rates or historical data.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>
                  <strong>Add comments for thin/loss deals.</strong> Explain why you're approving (or holding) and what risks to monitor.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>
                  <strong>Set baseCost to match reality.</strong> Include all labor, materials, overhead. Don't underestimate.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>
                  <strong>Escalate loss deals to management.</strong> Don't approve negative margin without explicit approval.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>
                  <strong>Track approved margin vs actual cost.</strong> After project delivery, compare projected vs realized costs.
                </span>
              </li>
            </ul>
          </Section>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t p-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Got it, close this guide
          </button>
        </div>
      </div>
    </div>
  );
};
