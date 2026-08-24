import { Router } from 'express';
import Lead from '../models/Lead.js';
import Project from '../models/Project.js';
import Contact from '../models/Contact.js';
import SKU from '../models/SKU.js';
import Transaction from '../models/Transaction.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });

    const q = (req.query.q || '').trim();
    if (!q) return res.json({ results: { leads: [], projects: [], contacts: [], skus: [], transactions: [] }, total: 0 });

    const limit = Math.min(parseInt(req.query.limit) || 5, 25);
    const textSearch = { $text: { $search: q } };
    const scoreProjection = { score: { $meta: 'textScore' } };
    const isAdmin = req.session.user?.permissions?.admin;

    const [leads, projects, contacts, skus, transactions] = await Promise.all([
      Lead.find({ deleted: { $ne: true }, ...textSearch }, scoreProjection)
        .sort(scoreProjection).lean().limit(limit),

      Project.find(textSearch, scoreProjection)
        .sort(scoreProjection).lean().limit(limit),

      Contact.find(textSearch, scoreProjection)
        .sort(scoreProjection).lean().limit(limit),

      SKU.find(textSearch, scoreProjection)
        .sort(scoreProjection).lean().limit(limit),

      isAdmin
        ? Transaction.find(textSearch, scoreProjection).sort(scoreProjection).lean().limit(limit)
        : Promise.resolve([])
    ]);

    const shape = {
      leads: leads.map(d => ({
        id: d.id || String(d._id),
        title: d.companyName,
        subtitle: `${d.contactName || ''} — ${d.stage || ''}`,
        badge: d.stage,
        icon: 'Briefcase',
        route: '/crm',
        collectionType: 'leads'
      })),
      projects: projects.map(d => ({
        id: d.id || String(d._id),
        title: d.name,
        subtitle: `${d.type || ''} — ${d.status || ''}`,
        badge: d.status,
        icon: 'FolderKanban',
        route: '/projects',
        collectionType: 'projects'
      })),
      contacts: contacts.map(d => ({
        id: d.id || String(d._id),
        title: d.name,
        subtitle: d.companyName || d.email || '',
        icon: 'Users',
        route: '/contacts',
        collectionType: 'contacts'
      })),
      skus: skus.map(d => ({
        id: d.id || String(d._id),
        title: `${d.code || ''} — ${d.name || ''}`,
        subtitle: d.category || '',
        icon: 'Package',
        route: '/skus',
        collectionType: 'skus'
      })),
      transactions: transactions.map(d => ({
        id: d.id || String(d._id),
        title: d.title,
        subtitle: `$${d.amount || 0} — ${d.type || ''}`,
        badge: d.type,
        icon: 'DollarSign',
        route: '/finance',
        collectionType: 'transactions'
      }))
    };

    const total = Object.values(shape).reduce((s, arr) => s + arr.length, 0);
    res.json({ results: shape, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
