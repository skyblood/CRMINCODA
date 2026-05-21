import React, { useState, useMemo } from 'react';
import { Account, Contact, Lead } from '../types';
import { Building2, Plus, Search, ExternalLink, ChevronDown, ChevronRight, Users, Briefcase, Edit2, Trash2, X, Save } from 'lucide-react';

interface Props {
  accounts: Account[];
  contacts: Contact[];
  leads: Lead[];
  onAdd: (a: Account) => void;
  onUpdate: (a: Account) => void;
  onDelete: (id: string) => void;
}

const INDUSTRIES = ['Technology', 'Finance', 'Healthcare', 'Manufacturing', 'Retail', 'Services', 'Education', 'Government', 'Energy', 'Other'];
const SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'];

const EMPTY_FORM: Omit<Account, 'id' | 'createdAt'> = {
  name: '', industry: '', size: '', website: '', address: '', notes: '',
};

function AccountForm({ initial, onSave, onCancel }: {
  initial: Omit<Account, 'id' | 'createdAt'>;
  onSave: (data: Omit<Account, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Company Name *</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" value={form.name} onChange={f('name')} placeholder="Acme Corp" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Industry</label>
          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none" value={form.industry} onChange={f('industry')}>
            <option value="">Select…</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Size</label>
          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none" value={form.size} onChange={f('size')}>
            <option value="">Select…</option>
            {SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Website</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" value={form.website} onChange={f('website')} placeholder="https://acme.com" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Address</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" value={form.address} onChange={f('address')} placeholder="City, Country" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Notes</label>
          <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 resize-none" rows={2} value={form.notes} onChange={f('notes')} placeholder="Internal notes…" />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200 transition">
          <X size={14} /> Cancel
        </button>
        <button onClick={() => form.name.trim() && onSave(form)} disabled={!form.name.trim()} className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition">
          <Save size={14} /> Save
        </button>
      </div>
    </div>
  );
}

export function AccountManager({ accounts, contacts, leads, onAdd, onUpdate, onDelete }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return accounts.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.industry ?? '').toLowerCase().includes(q) ||
      (a.address ?? '').toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const handleAdd = (data: Omit<Account, 'id' | 'createdAt'>) => {
    onAdd({ ...data, id: `acc_${Date.now()}`, createdAt: new Date().toISOString() });
    setShowForm(false);
  };

  const handleUpdate = (account: Account, data: Omit<Account, 'id' | 'createdAt'>) => {
    onUpdate({ ...account, ...data });
    setEditId(null);
  };

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#1E0B4B,#6B21A8)' }}>
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Accounts</h1>
            <p className="text-xs text-gray-500">{accounts.length} companies</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-200 w-56" placeholder="Search accounts…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
            <Plus size={15} /> New Account
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-3">
        {showForm && (
          <AccountForm initial={EMPTY_FORM} onSave={handleAdd} onCancel={() => setShowForm(false)} />
        )}

        {filtered.length === 0 && !showForm ? (
          <div className="text-center py-16 text-gray-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No accounts yet</p>
            <p className="text-sm mt-1">Create your first company account to link contacts and deals.</p>
          </div>
        ) : (
          filtered.map(account => {
            const linkedContacts = contacts.filter(c => c.accountId === account.id);
            const linkedLeads = leads.filter(l => (l as any).accountId === account.id && !l.deleted);
            const isExpanded = expanded.has(account.id);

            return (
              <div key={account.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {editId === account.id ? (
                  <div className="p-4">
                    <AccountForm
                      initial={{ name: account.name, industry: account.industry ?? '', size: account.size ?? '', website: account.website ?? '', address: account.address ?? '', notes: account.notes ?? '' }}
                      onSave={data => handleUpdate(account, data)}
                      onCancel={() => setEditId(null)}
                    />
                  </div>
                ) : (
                  <>
                    {/* Account row */}
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(account.id)}>
                      <button className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                        {account.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{account.name}</p>
                        <p className="text-xs text-gray-500">{[account.industry, account.size ? `${account.size} employees` : '', account.address].filter(Boolean).join(' · ')}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 mr-2">
                        <span className="flex items-center gap-1"><Users size={12} /> {linkedContacts.length} contacts</span>
                        <span className="flex items-center gap-1"><Briefcase size={12} /> {linkedLeads.length} deals</span>
                      </div>
                      {account.website && (
                        <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-gray-400 hover:text-blue-600 transition">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setEditId(account.id)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition"><Edit2 size={13} /></button>
                        <button onClick={() => onDelete(account.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition"><Trash2 size={13} /></button>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Users size={11} /> Contacts</p>
                          {linkedContacts.length === 0 ? (
                            <p className="text-xs text-gray-400">No contacts linked</p>
                          ) : (
                            <div className="space-y-1">
                              {linkedContacts.map(c => (
                                <div key={c.id} className="flex items-center gap-2 text-xs bg-white rounded-lg px-2 py-1.5 border border-gray-100">
                                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-[10px]">{c.name.charAt(0)}</div>
                                  <span className="font-medium text-gray-700">{c.name}</span>
                                  <span className="text-gray-400">{c.role}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Briefcase size={11} /> Deals</p>
                          {linkedLeads.length === 0 ? (
                            <p className="text-xs text-gray-400">No deals linked</p>
                          ) : (
                            <div className="space-y-1">
                              {linkedLeads.map(l => (
                                <div key={l.id} className="flex items-center gap-2 text-xs bg-white rounded-lg px-2 py-1.5 border border-gray-100">
                                  <span className="font-medium text-gray-700 truncate">{l.companyName}</span>
                                  <span className="ml-auto text-gray-500">${l.value.toLocaleString()}</span>
                                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 rounded">{l.stage}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {account.notes && (
                          <div className="col-span-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                            <p className="text-xs text-gray-600">{account.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
